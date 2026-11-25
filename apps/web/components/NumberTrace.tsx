"use client";
/** Telco-A's number trace: the analyst runs it, the call records turn into a picture (handset → SIMs → people
 *  called → bank complaints), the network counters fill in, and only then does the decision open. */
import { useEffect, useState } from "react";
import { Check, Lock, PhoneOff, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Alert, TAction, TraceView, TNode } from "@/lib/server/telco";
import { ActForm } from "./ActForm";
import { policePacketAction, telcoDecideAction } from "@/app/actions";
import { inr, when } from "@/lib/format";

const PACE = 1500;
const STEPS = 6;

export interface DoneView { action: string; agreed: boolean; reason: string; note: string; by: string; at: number; reported: string[] }
export interface LinkedView { msisdn: string; name: string; account: string; caseId: string | null; band: string }

export function NumberTrace({ a, view, labels, reasons, done, packetAt, linked, now }: {
  a: Alert; view: TraceView; labels: Record<TAction, string>; reasons: readonly string[];
  done: DoneView | null; packetAt: number | null; linked: LinkedView[]; now: number;
}) {
  const [step, setStep] = useState(done ? STEPS : 0);
  const running = step > 0 && step < STEPS;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStep((s) => s + 1), PACE);
    return () => clearTimeout(t);
  }, [running, step]);
  const finished = step >= STEPS;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-5">
        <section className="card p-5" data-testid="trace">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Number trace</h2>
              <p className="mt-0.5 text-[13.5px] muted">From Telco-A&apos;s call records. They stay inside Telco-A: banks only ever see DoT&apos;s risk rating.</p>
            </div>
            {step === 0 ? (
              <button type="button" className="btn btn-phone" onClick={() => setStep(1)} data-testid="run-trace">Run the trace</button>
            ) : finished ? (
              <span className="chip chip-good" data-testid="trace-done"><Check size={13} aria-hidden />Trace complete</span>
            ) : (
              <span className="flex items-center gap-2 text-[13px] muted"><span className="spinner" />Tracing…</span>
            )}
          </div>
          <div className="thread mt-4"><div className="thread-fill" style={{ width: `${(step / STEPS) * 100}%`, background: "linear-gradient(90deg, #c2a8ff, var(--phone))" }} /></div>

          <Graph view={view} step={step} />

          <ol className="mt-4 space-y-1.5 text-[13.5px]" data-testid="trace-log">
            {view.log.map((line, i) => (
              <li key={i} className={`flex items-start gap-2 transition-opacity duration-500 ${step > i ? "opacity-100" : "opacity-25"}`}>
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${step > i ? "bg-[var(--phone)]" : "bg-[var(--line-strong)]"}`} />
                {line}
              </li>
            ))}
          </ol>
        </section>

        {(view.shown.length > 0 || view.cash.length > 0) && (
          <section className={`grid gap-5 transition-opacity duration-700 lg:grid-cols-2 ${step >= 5 ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {view.shown.length > 0 && (
              <div className="card p-5" data-testid="shown-numbers">
                <h2>Numbers victims saw</h2>
                <p className="mt-0.5 text-[13.5px] muted">The caller faked these. They belong to other people, so Scalpel never blocks them.</p>
                <ul className="mt-3 space-y-2">
                  {view.shown.map((s) => (
                    <li key={s.number} className="flex items-start justify-between gap-3 border-t border-[var(--line)] pt-2 text-[13.5px] first:border-0 first:pt-0">
                      <span><span className="mono font-semibold">{s.number}</span><span className="block muted">{s.kind === "protected" ? s.owner : `belongs to ${s.owner}`} · shown in {s.calls} call{s.calls > 1 ? "s" : ""}</span></span>
                      <span className="chip chip-grey shrink-0"><PhoneOff size={12} aria-hidden />Never block</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {view.cash.length > 0 && (
              <div className={`card p-5 transition-opacity duration-700 ${step >= 6 ? "opacity-100" : "opacity-0"}`} data-testid="call-to-cash">
                <h2>From the call to the payment</h2>
                <p className="mt-0.5 text-[13.5px] muted">Each victim paid soon after the call ended. This is what links the phone to the money.</p>
                <ul className="mt-3 space-y-2.5">
                  {view.cash.map((c) => (
                    <li key={c.who} className="text-[13.5px]">
                      <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{c.who}</span><span className="money">{inr(c.amount)}</span></div>
                      <div className="mt-1 flex items-center gap-2 text-[12.5px] muted">
                        <span className="whitespace-nowrap">call {when(c.at)}</span>
                        <span className="h-px flex-1 bg-[var(--phone)] opacity-40" />
                        <span className="whitespace-nowrap font-medium text-[var(--fg)]">{c.mins} min</span>
                        <span className="h-px flex-1 bg-[var(--accent)] opacity-40" />
                        <span className="whitespace-nowrap">paid {c.caseId ?? ""}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {view.totals.medianMins !== null && <p className="mt-3 text-[13px]">Half of the {view.totals.people} victims paid within <b>{view.totals.medianMins} minutes</b>. {inr(view.totals.paid)} lost in all.</p>}
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="min-w-0 space-y-5 xl:sticky xl:top-24">
        <section className="card p-5" data-testid="signals">
          <h2>Network counters</h2>
          <ul className="mt-3 space-y-3">
            {a.gauges.map((g, i) => (
              <li key={g.label} data-testid="gauge">
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]"><span>{g.label}</span><span className={`font-medium ${step >= 3 ? "" : "opacity-0"} transition-opacity`}>{g.text}</span></div>
                <div className="thread mt-1.5" style={{ height: 5 }}>
                  <div className="thread-fill" style={{ width: step >= 3 ? `${g.level * 100}%` : "0%", transitionDelay: `${i * 120}ms`, background: g.bad ? "linear-gradient(90deg, #f0b37a, var(--warn))" : "linear-gradient(90deg, #8fd3ae, var(--good))" }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5" data-testid="telco-ai">
          <div className="flex items-baseline justify-between gap-3">
            <h2>Telco-A&apos;s AI suggests</h2>
            <span className="money text-[15px]">{Math.round(a.ai.confidence * 100)}% sure</span>
          </div>
          <p className="mt-1 font-semibold text-[var(--phone)]">{labels[a.ai.suggest]}</p>
          <p className="mt-2 text-[13px] muted">Because of: {a.ai.drivers.join("; ")}.</p>
          <p className="mt-2 text-[12.5px] muted">It reads network counters only. It does not see company registrations, police letters or who owned the number before.</p>
        </section>

        <section className={`card p-5 transition-opacity duration-500 ${finished ? "opacity-100" : "opacity-60"}`} data-testid="telco-decide-panel">
          <h2>What the records show</h2>
          <ul className="mt-2 space-y-1.5 text-[13.5px]">
            {a.facts.map((f) => <li key={f} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" />{f}</li>)}
          </ul>
          {finished && a.clash && (
            <p className="mt-3 flex gap-2 rounded-lg bg-[var(--warn-tint)] px-3 py-2 text-[13.5px] text-[var(--warn)]" data-testid="telco-clash">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /><span><b>Check before acting:</b> {a.clash}</span>
            </p>
          )}

          {done ? (
            <div className="mt-4 border-t border-[var(--line)] pt-4 text-[13.5px]" data-testid="telco-decided">
              <p className="font-semibold">{done.action}</p>
              <p className="mt-1"><span className={`chip ${done.agreed ? "chip-good" : "chip-warn"}`}>{done.agreed ? "Agreed with the AI" : "Overruled the AI"}</span> <span className="muted">{done.reason}{done.note ? `: ${done.note}` : ""}</span></p>
              <p className="mt-1 muted">{done.by} · {when(done.at)}</p>
              {done.reported.length > 0 && <p className="mt-2 text-[var(--phone)]">Reported to DoT: {done.reported.length} linked number{done.reported.length > 1 ? "s" : ""} now rated High for banks.</p>}
            </div>
          ) : !finished ? (
            <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] muted"><Lock size={13} className="mr-1 inline" aria-hidden />Run the trace to decide.</p>
          ) : (
            <ActForm action={telcoDecideAction} hidden={{ alert: a.id }} label="Record decision" variant="phone" testid="telco-decide" className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
              <fieldset className="space-y-1.5">
                <legend className="label mb-1">Your call</legend>
                {a.options.map((o) => (
                  <label key={o} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-white/70">
                    <input type="radio" name="action" value={o} defaultChecked={o === a.ai.suggest} className="mt-1 accent-[var(--phone)]" data-testid={`t-option-${o}`} />
                    <span>{labels[o]}{o === a.ai.suggest && <span className="chip chip-phone ml-1.5">AI</span>}</span>
                  </label>
                ))}
              </fieldset>
              <label className="block"><span className="label">Reason</span>
                <select name="reason" className="input mt-1" defaultValue={reasons[0]} data-testid="t-reason">
                  {reasons.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <input name="note" placeholder="Note (what you checked)" className="input" />
              {a.reportable && linked.length > 0 && (
                <label className="flex items-start gap-2 rounded-lg bg-[var(--phone-tint)] px-3 py-2 text-[13px]">
                  <input type="checkbox" name="report" defaultChecked className="mt-0.5 accent-[var(--phone)]" data-testid="t-report" />
                  <span><b>Report to DoT</b> (through DIP). These phones were activated through the same retailer the same week and sit on mule accounts:
                    <span className="mt-1 block mono text-[12px]">{linked.map((l) => `${l.msisdn} (${l.name}, now ${l.band})`).join(" · ")}</span>
                    <span className="mt-1 block muted">DoT can raise their fraud-risk rating to High. Banks see only that rating.</span>
                  </span>
                </label>
              )}
            </ActForm>
          )}
        </section>

        {a.cases.length > 0 && a.calls.length > 0 && (
          <section className="card p-5" data-testid="police-panel">
            <h2 className="flex items-center gap-2"><ShieldAlert size={17} className="text-[var(--phone)]" aria-hidden />Police packet</h2>
            <p className="mt-1 text-[13.5px] muted">The {a.calls.length} call records, for the investigating officer on {a.cases.join(", ")} only. The bank never receives them.</p>
            {packetAt ? <p className="mt-3 chip chip-good" data-testid="packet-done">Prepared {when(packetAt)}</p>
              : finished ? <ActForm action={policePacketAction} hidden={{ alert: a.id }} label="Prepare for police" variant="ghost" size="sm" testid="police-packet" className="mt-3" />
              : <p className="mt-3 text-[13px] muted"><Lock size={13} className="mr-1 inline" aria-hidden />After the trace.</p>}
          </section>
        )}
        <p className="text-[12px] muted">Demo clock {when(now)}</p>
      </aside>
    </div>
  );
}

/** Four columns joined by threads. Columns appear as the trace reaches them. */
function Graph({ view, step }: { view: TraceView; step: number }) {
  const cols: { title: string; nodes: TNode[]; more: number; at: number }[] = [
    { title: "SIMs", nodes: view.sims, more: view.simsMore, at: 2 },
    { title: "People called", nodes: view.people, more: view.peopleMore, at: 4 },
    ...(view.bank.length ? [{ title: "At the bank", nodes: view.bank, more: 0, at: 6 }] : []),
  ];
  const ROW = 50, TOP = 34, W = 980;
  const rows = Math.max(1, ...cols.map((c) => c.nodes.length + (c.more ? 1 : 0)));
  const H = TOP + rows * ROW + 6;
  const xs = [20, 230, 520, 800].slice(0, cols.length + 1);
  const NW = [180, 230, 250, 170];
  const y = (i: number, n: number) => TOP + (rows - n) * ROW / 2 + i * ROW;
  const pos = new Map<string, { x: number; y: number; w: number }>();
  cols.forEach((c, ci) => { const n = c.nodes.length + (c.more ? 1 : 0); c.nodes.forEach((nd, i) => pos.set(nd.id, { x: xs[ci + 1]!, y: y(i, n), w: NW[ci + 1]! })); });
  const dev = { x: xs[0]!, y: y(0, 1), w: NW[0]! };
  const tone = (t: TNode["tone"]) => t === "victim" ? "var(--bad)" : t === "bank" ? "var(--accent)" : t === "forward" ? "var(--warn)" : t === "customer" ? "var(--good)" : "var(--phone)";
  return (
    <div className="mt-4 overflow-x-auto" data-testid="trace-graph">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px]" role="img" aria-label="Trace from the handset to its SIMs, the people called and the bank complaints">
        {cols.map((c, ci) => <text key={c.title} x={xs[ci + 1]} y={14} fontSize={12} fill="var(--muted)" opacity={step >= c.at ? 1 : 0.35}>{c.title}</text>)}
        <text x={xs[0]} y={14} fontSize={12} fill="var(--muted)">Device</text>
        {/* device → SIMs */}
        {view.sims.map((s, i) => { const p = pos.get(s.id)!; return <path key={s.id} d={curve(dev.x + dev.w, dev.y + 18, p.x, p.y + 18)} fill="none" stroke="var(--phone)" strokeWidth={1.3} opacity={step >= 2 ? 0.45 : 0} style={{ transition: `opacity .5s ${i * 60}ms` }} />; })}
        {view.edges.map(([f, t], i) => {
          const a = pos.get(f), b = pos.get(t);
          if (!a || !b) return null;
          const late = t.startsWith("b:");
          return <path key={i} d={curve(a.x + a.w, a.y + 18, b.x, b.y + 18)} fill="none" stroke={late ? "var(--accent)" : "var(--bad)"} strokeWidth={1.2} opacity={step >= (late ? 6 : 4) ? 0.4 : 0} style={{ transition: `opacity .6s ${i * 40}ms` }} />;
        })}
        <Node x={dev.x} y={dev.y} w={dev.w} label={view.device.label} sub={view.device.sub} color="var(--phone)" on={step >= 1} strong />
        {cols.map((c, ci) => {
          const n = c.nodes.length + (c.more ? 1 : 0);
          return (
            <g key={c.title}>
              {c.nodes.map((nd, i) => <Node key={nd.id} x={xs[ci + 1]!} y={y(i, n)} w={NW[ci + 1]!} label={nd.label} sub={nd.sub} color={tone(nd.tone)} on={step >= c.at} delay={i * 70} />)}
              {c.more > 0 && <text x={xs[ci + 1]! + 10} y={y(c.nodes.length, n) + 22} fontSize={12} fill="var(--muted)" opacity={step >= c.at ? 1 : 0}>+ {c.more} more</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Node({ x, y, w, label, sub, color, on, delay = 0, strong }: { x: number; y: number; w: number; label: string; sub: string; color: string; on: boolean; delay?: number; strong?: boolean }) {
  return (
    <g style={{ opacity: on ? 1 : 0.18, transition: `opacity .5s ${delay}ms` }}>
      <rect x={x} y={y} width={w} height={38} rx={9} fill="rgba(255,255,255,.85)" stroke={on ? color : "var(--line-strong)"} strokeWidth={strong ? 1.6 : 1} />
      <rect x={x} y={y + 8} width={3} height={22} rx={1.5} fill={color} />
      <text x={x + 11} y={y + 16} fontSize={12.5} fontWeight={600} fill="var(--fg)" fontFamily={label.startsWith("+") || /^\d/.test(label) ? "var(--font-mono)" : undefined}>{clip(label, Math.floor(w / 7.4))}</text>
      <text x={x + 11} y={y + 31} fontSize={11} fill="var(--muted)">{clip(sub, Math.floor(w / 6))}</text>
    </g>
  );
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const curve = (x1: number, y1: number, x2: number, y2: number) => { const m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; };
