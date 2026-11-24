"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as m from "motion/react-m";
import type { DemoData } from "@/lib/demo-schema";
import { LANE_KEYS } from "@/lib/demo-schema";
import { LAST_HOUR, LANE_LABEL, hourIndex, valuesAt } from "@/lib/replay";
import { formatRupees } from "@/lib/money";
import { ReplayLane, LANE_COLOR } from "@/components/ReplayLane";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { SPRING } from "@/components/ui/motion";
import { FullData } from "@/components/ui/Explain";

type LaneKey = (typeof LANE_KEYS)[number];

export function Replay({ replay, total }: { replay: DemoData["replay"]; total: number }) {
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pick, setPick] = useState<LaneKey>("scalpel");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setHour((h) => {
        if (h >= LAST_HOUR) { setPlaying(false); return LAST_HOUR; }
        return h + 1;
      });
    }, 80);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);


  const chosen = valuesAt(replay.lanes[pick], hour);
  const axe = valuesAt(replay.lanes.axe, hour);
  const fill = `${(hour / LAST_HOUR) * 100}%`;
  const scaleMax = useMemo(() => Math.max(1, ...LANE_KEYS.flatMap((k) => { const v = valuesAt(replay.lanes[k], LAST_HOUR); return [v.secured, v.innocentLocked]; })), [replay]);

  return (
    <>
      <div className="card mt-6 p-5 sm:p-6 grid gap-5 no-print" data-testid="policy-tool">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-[17px]">Policy to test</p>
            <p className="text-[13.5px] muted">Everything else stays the same: the officer acts on {replay.k} accounts an hour in every policy.</p>
          </div>
          <Segmented label="Policy to test" value={pick} onChange={setPick} options={LANE_KEYS.map((k) => ({ value: k, label: LANE_LABEL[k], testid: `pick-${k}` }))} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Victim money secured" value={formatRupees(chosen.secured)} sub={`${Math.round((chosen.secured / total) * 100)}% of all victim money`} color={LANE_COLOR[pick]} />
          <Stat label="Innocent money locked" value={formatRupees(chosen.innocentLocked)} sub={pick === "axe" ? "whole balances, scam or not" : `whole freeze at this hour: ${formatRupees(axe.innocentLocked)}`} color={chosen.innocentLocked > 0 ? "var(--freeze)" : "var(--good)"} />
          <Stat label="People wrongly restricted" value={String(chosen.people)} sub={`of them shopkeepers: ${chosen.shops}`} color={chosen.people > 0 ? "var(--freeze)" : "var(--good)"} />
        </div>

        <div className="grid gap-3" data-testid="replay-chart" aria-label={`Money at hour ${hour}, by policy`}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] muted">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-2 rounded-sm" style={{ background: "var(--accent)" }} />Victim money secured</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-2 rounded-sm" style={{ background: "repeating-linear-gradient(135deg, var(--freeze) 0 3px, #f2b8b3 3px 6px)" }} />Innocent money locked</span>
            <span className="ml-auto num">Hour {hour} of {LAST_HOUR}</span>
          </div>
          {LANE_KEYS.map((k) => {
            const v = valuesAt(replay.lanes[k], hour);
            const on = k === pick;
            return (
              <button key={k} type="button" onClick={() => setPick(k)} aria-pressed={on}
                className="group grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg)]"
                style={on ? { background: "var(--accent-tint)", boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}>
                <span className={`text-[14px] ${on ? "font-semibold" : "font-medium"}`}>{LANE_LABEL[k]}</span>
                <span className="grid gap-1.5">
                  <Bar value={v.secured} max={scaleMax} color={LANE_COLOR[k]} label={formatRupees(v.secured)} />
                  <Bar value={v.innocentLocked} max={scaleMax} color="repeating-linear-gradient(135deg, var(--freeze) 0 3px, #f2b8b3 3px 6px)" label={v.innocentLocked ? `${formatRupees(v.innocentLocked)} innocent` : "₹0 innocent"} muted={!v.innocentLocked} />
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[12.5px] muted -mt-1">
          All bars use one scale. In this small month most holds land in the first hour, so the policies differ less in speed than in <b>who they hurt</b>.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" className="min-w-28" onClick={() => { if (hour >= LAST_HOUR) setHour(0); setPlaying((p) => !p); }}>
            <PlayIcon playing={playing} />{playing ? "Pause" : hour >= LAST_HOUR ? "Replay" : "Play"}
          </Button>
          <div className="flex-1 min-w-48">
            <div className="flex items-baseline justify-between text-sm">
              <label htmlFor="hour" className="muted">Hours after the bank decides</label>
              <span className="mono font-medium text-lg"><b data-testid="hour">{hour}</b><span className="muted text-sm font-normal"> / {LAST_HOUR}</span></span>
            </div>
            <input id="hour" type="range" min={0} max={LAST_HOUR} step={1} value={hour} aria-label="Hours after the bank decides"
              onChange={(e) => { setPlaying(false); setHour(hourIndex(Number(e.target.value))); }}
              className="scrub w-full mt-2" style={{ ["--fill" as string]: fill }} />
          </div>
        </div>
        <p className="text-xs muted">
          <span className="tag">known only afterwards</span> These counters use what really happened in the invented world, which no officer could see at the time.
        </p>
      </div>

      <FullData title={<>Each policy in detail at hour <span className="num">{hour}</span></>} testid="lanes">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {LANE_KEYS.map((k) => <ReplayLane key={k} id={k} lane={replay.lanes[k]} hour={hour} total={total} picked={k === pick} />)}
        </div>
        <p className="mt-4 text-[14px] muted">Whole freeze vs Exact hold differ only in hold size; Exact hold vs Scalpel differ only in order.</p>
      </FullData>
      <p className="mt-3 text-[15px]"><Link href="/memo?a=D00191" className="link font-medium" data-testid="to-memo">See the hold memo for one shop in this world</Link></p>
    </>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card-flat lift px-4 py-3.5">
      <p className="text-[12.5px] muted">{label}</p>
      <m.p key={value} initial={{ opacity: 0.5, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mono text-[24px] font-medium mt-0.5" style={{ color }}>{value}</m.p>
      <p className="text-[12.5px] muted mt-0.5">{sub}</p>
    </div>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing
    ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" /><rect x="7.2" y="1.5" width="2.8" height="9" rx="0.8" fill="currentColor" /></svg>
    : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5Z" fill="currentColor" /></svg>;
}

function Bar({ value, max, color, label, muted }: { value: number; max: number; color: string; label: string; muted?: boolean }) {
  const w = Math.max(value > 0 ? 0.6 : 0, (value / max) * 100);
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span className="relative h-2.5 flex-1 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
        <m.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} initial={false} animate={{ width: `${w}%` }} transition={SPRING} />
      </span>
      <span className={`num text-[12.5px] w-[150px] shrink-0 truncate ${muted ? "muted" : "font-semibold"}`}>{label}</span>
    </span>
  );
}
