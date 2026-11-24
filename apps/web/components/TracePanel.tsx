"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import type { MemoCase } from "@/lib/demo-schema";
import { formatRupees } from "@/lib/money";
import { istDate } from "@/lib/rules";
import { Button } from "./ui/Button";
import { SPRING } from "./ui/motion";

const W = 720;
const SRC_X = 236;
const DST_X = 600;
const ROW = 58;
const MAX_ROWS = 6;
const HOP_MS = 1100;

const tail = (id: string) => id.slice(-3);

/**
 * Replays the engine's own trace for one account: each credit that carried victim money travels as a blip
 * into the account, and the counter adds what it carried. Same numbers as the memo; only the playback is animated.
 */
export function TracePanel({ c, open, onClose }: { c: MemoCase; open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const hops = useMemo(() => {
    const carrying = [...c.hops].filter((h) => h.taintPaise > 0).sort((a, b) => a.at - b.at);
    const top = [...carrying].sort((a, b) => b.taintPaise - a.taintPaise).slice(0, MAX_ROWS);
    const shown = carrying.filter((h) => top.includes(h));
    const rest = carrying.filter((h) => !top.includes(h));
    return { shown, restCount: rest.length, restPaise: rest.reduce((t, h) => t + h.taintPaise, 0) };
  }, [c]);
  const H = Math.max(240, hops.shown.length * ROW + 60);
  const midY = H / 2;
  const rowY = (i: number) => 40 + i * ROW + (H - 80 - (hops.shown.length - 1) * ROW) / 2;
  const pathFor = (i: number) => {
    const y = rowY(i);
    return `M ${SRC_X + 14} ${y} C ${SRC_X + 150} ${y}, ${DST_X - 170} ${midY}, ${DST_X - 30} ${midY}`;
  };

  const [step, setStep] = useState(-1); // index of the hop in flight; hops.shown.length = finished
  const [blip, setBlip] = useState<{ x: number; y: number } | null>(null);
  const [traced, setTraced] = useState(0);
  const [pulse, setPulse] = useState(0);
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const run = useRef(0);

  const play = useCallback(async () => {
    const id = ++run.current;
    setTraced(0); setBlip(null); setStep(-1);
    const total = hops.shown.length;
    if (reduce) {
      setStep(total); setTraced(hops.shown.reduce((t, h) => t + h.taintPaise, 0) + hops.restPaise);
      return;
    }
    await new Promise((r) => setTimeout(r, 450));
    for (let i = 0; i < total; i++) {
      if (run.current !== id) return;
      setStep(i);
      const el = paths.current[i];
      const len = el?.getTotalLength() ?? 0;
      await animate(0, 1, {
        duration: HOP_MS / 1000, ease: [0.45, 0, 0.2, 1],
        onUpdate: (t) => { if (el && run.current === id) { const p = el.getPointAtLength(t * len); setBlip({ x: p.x, y: p.y }); } },
      });
      if (run.current !== id) return;
      setBlip(null);
      setTraced((x) => x + hops.shown[i]!.taintPaise);
      setPulse((p) => p + 1);
    }
    if (hops.restPaise) setTraced((x) => x + hops.restPaise);
    setStep(total);
  }, [hops, reduce]);

  useEffect(() => {
    if (!open) { run.current++; return; }
    const t = setTimeout(play, 60);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); };
  }, [open, play, onClose]);

  const cameIn = hops.shown.reduce((t, h) => t + h.taintPaise, 0) + hops.restPaise;
  const done = step >= hops.shown.length;
  const movedOn = Math.max(0, cameIn - c.tracedPaise);
  // the account fills with what arrived, then drains to what is still there once the trace ends
  const share = done ? c.tracedPaise / Math.max(1, cameIn) : Math.min(1, traced / Math.max(1, cameIn));

  return (
    <AnimatePresence>
      {open && (
        <m.div className="no-print fixed inset-0 z-[70] grid place-items-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(8, 24, 30, 0.42)" }} onClick={onClose}>
          <m.div role="dialog" aria-modal="true" aria-label="Money trace" data-testid="trace-panel" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[1000px] rounded-2xl overflow-hidden" style={{ background: "var(--card)", boxShadow: "0 30px 80px -20px rgba(8,24,30,0.45)" }}
            initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={SPRING}>
            <header className="flex flex-wrap items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b" style={{ borderColor: "var(--line)" }}>
              <div>
                <p className="eyebrow !mb-1">Money trace · replay of the engine&apos;s trace</p>
                <h2 className="text-[22px] sm:text-[26px]">How the victims&apos; money reached account <span className="font-mono text-[0.8em]">•••{tail(c.account)}</span></h2>
              </div>
              <div className="flex gap-2">
                <Button onClick={play} data-testid="trace-replay">Replay</Button>
                <Button onClick={onClose} aria-label="Close trace">Close</Button>
              </div>
            </header>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="relative px-2 sm:px-4 py-4" style={{ background: "radial-gradient(600px 260px at 80% 50%, rgba(232,138,26,0.07), transparent 70%), repeating-linear-gradient(0deg, transparent 0 27px, rgba(11,85,99,0.05) 27px 28px), repeating-linear-gradient(90deg, transparent 0 27px, rgba(11,85,99,0.05) 27px 28px)" }}>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${hops.shown.length} credits carried traced money into this account`}>
                  <text x={SRC_X - 4} y={18} textAnchor="end" fontSize="11" fill="var(--muted)" fontWeight="700" letterSpacing="1.4">FROM</text>
                  <text x={DST_X} y={18} textAnchor="middle" fontSize="11" fill="var(--muted)" fontWeight="700" letterSpacing="1.4">INTO</text>
                  {hops.shown.map((h, i) => {
                    const y = rowY(i);
                    const lit = step > i || done;
                    const flying = step === i;
                    return (
                      <g key={h.utr}>
                        <path d={pathFor(i)} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="3 5" />
                        <m.path ref={(el: SVGPathElement | null) => { paths.current[i] = el; }} d={pathFor(i)} fill="none" stroke="var(--hold-fill)" strokeWidth={2.5} strokeLinecap="round"
                          initial={false} animate={{ pathLength: lit ? 1 : 0, opacity: lit ? 0.9 : 0 }} transition={{ duration: 0.3 }} />
                        <m.circle cx={SRC_X} cy={y} r={9} initial={false} animate={{ scale: flying ? 1.25 : 1 }} transition={SPRING}
                          fill={lit || flying ? "var(--hold-fill)" : "var(--card)"} stroke={lit || flying ? "var(--hold)" : "var(--line-strong)"} strokeWidth="2" style={{ transformOrigin: `${SRC_X}px ${y}px` }} />
                        <text x={SRC_X - 18} y={y - 3} textAnchor="end" fontSize="13" fontWeight="600" fill="var(--fg)">
                          {h.layer === 1 ? `Victim payment ${tail(h.from)}` : `Account •••${tail(h.from)}`}
                        </text>
                        <text x={SRC_X - 18} y={y + 13} textAnchor="end" fontSize="11.5" fill="var(--muted)">
                          {h.layer === 1 ? "straight from the complaint" : `${(h.layer ?? 2) - 1} hops after the victims`} · {istDate(h.at)}
                        </text>
                        <m.text x={SRC_X + 26} y={y - 10} fontSize="12" fontWeight="700" fill="var(--hold)" style={{ fontFamily: "var(--font-money)" }}
                          initial={false} animate={{ opacity: lit ? 1 : 0, y: lit ? 0 : 4 }} transition={SPRING}>
                          +{formatRupees(h.taintPaise)}
                        </m.text>
                      </g>
                    );
                  })}
                  {/* the account itself: fills up as traced money lands */}
                  <m.circle key={pulse} cx={DST_X} cy={midY} r={34} fill="none" stroke="var(--hold-fill)" strokeWidth="2"
                    initial={{ scale: 1, opacity: pulse ? 0.7 : 0 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.9, ease: "easeOut" }} style={{ transformOrigin: `${DST_X}px ${midY}px` }} />
                  <clipPath id={`acct-${c.account}`}><circle cx={DST_X} cy={midY} r={32} /></clipPath>
                  <circle cx={DST_X} cy={midY} r={32} fill="var(--accent-tint)" stroke="var(--accent)" strokeWidth="2.5" />
                  <m.rect x={DST_X - 32} width={64} clipPath={`url(#acct-${c.account})`} fill="var(--hold-fill)" opacity={0.85}
                    initial={false} animate={{ y: midY + 32 - 64 * share, height: 64 * share }} transition={SPRING} />
                  <text x={DST_X} y={midY + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--accent-ink)" style={{ fontFamily: "var(--font-mono)" }}>•••{tail(c.account)}</text>
                  <text x={DST_X} y={midY + 56} textAnchor="middle" fontSize="12" fill="var(--muted)">this account</text>
                  <m.g initial={false} animate={{ opacity: done && movedOn > 0 ? 1 : 0 }} transition={{ duration: 0.5 }}>
                    <path d={`M ${DST_X + 36} ${midY} L ${W - 18} ${midY}`} stroke="var(--freeze)" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#arrow)" />
                    <text x={DST_X + 44} y={midY - 10} fontSize="11.5" fontWeight="600" fill="var(--freeze)">moved on</text>
                    <text x={DST_X + 44} y={midY + 20} fontSize="11.5" fill="var(--freeze)" style={{ fontFamily: "var(--font-money)" }}>{formatRupees(movedOn)}</text>
                  </m.g>
                  <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="var(--freeze)" /></marker></defs>
                  {blip && (
                    <g>
                      <circle cx={blip.x} cy={blip.y} r={13} fill="var(--hold-fill)" opacity={0.18} />
                      <circle cx={blip.x} cy={blip.y} r={6} fill="var(--hold-fill)" stroke="#fff" strokeWidth="2" />
                    </g>
                  )}
                </svg>
                {hops.restCount > 0 && (
                  <p className="text-[12.5px] muted px-2">+ {hops.restCount} smaller credits carrying {formatRupees(hops.restPaise)} in all, listed in the memo.</p>
                )}
              </div>

              <aside className="border-t lg:border-t-0 lg:border-l p-5 grid content-start gap-4" style={{ borderColor: "var(--line)", background: "#f8fbfb" }} aria-live="polite">
                <div>
                  <p className="eyebrow !mb-1">Victim money that came in</p>
                  <p className="num text-[32px] font-semibold leading-none" style={{ color: "var(--hold)" }} data-testid="trace-total">{formatRupees(traced)}</p>
                  <p className="text-[13px] muted mt-1">of <span className="num">{formatRupees(cameIn)}</span> in {c.hops.length} credits</p>
                  <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
                    <m.div className="h-full rounded-full" style={{ background: "var(--hold-fill)" }} initial={false} animate={{ width: `${share * 100}%` }} transition={SPRING} />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <span className="relative grid place-items-center w-2.5 h-2.5">
                    {!done && <span className="absolute w-2.5 h-2.5 rounded-full animate-ping" style={{ background: "var(--hold-fill)" }} />}
                    <span className="relative w-2 h-2 rounded-full" style={{ background: done ? "var(--good)" : "var(--hold-fill)" }} />
                  </span>
                  {done ? "Trace complete" : step < 0 ? "Starting trace" : `Following credit ${step + 1} of ${hops.shown.length}`}
                </div>
                <AnimatePresence>
                  {done && (
                    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="rounded-xl p-3.5 text-[13.5px] leading-relaxed"
                      style={{ background: "var(--good-tint)", color: "#14532d" }} data-testid="trace-done">
                      {movedOn > 0 && <><b className="num">{formatRupees(movedOn)}</b> of it has already moved on. </>}
                      <b className="num">{formatRupees(c.tracedPaise)}</b> is still in the account, and that is exactly what is held. The other <b className="num">{formatRupees(c.balancePaise - c.heldPaise)}</b> in the account stays usable.
                    </m.div>
                  )}
                </AnimatePresence>
                <p className="text-[12px] muted">Credits ordered by time. Amounts are the engine&apos;s traced share of each credit, the same figures as the memo.</p>
              </aside>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
