"use client";
/** Telco-A's alert page. The engineer builds the trace by hand in the workbench; this page shows his saved trace,
 *  what the server's check says it supports, and only then opens the decision. The picture of the whole trace
 *  (handset → SIMs → people called → bank complaints) is a replay after the decision, never a shortcut before it. */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Lock, PhoneOff, Play, ShieldAlert, TriangleAlert, Wrench } from "lucide-react";
import type { Alert, TAction, TraceView, TNode } from "@/lib/server/telco";
import { ActForm } from "./ActForm";
import { policePacketAction, telcoDecideAction } from "@/app/actions";
import { inr, when } from "@/lib/format";
import { TelcoGroup, type GroupView, type GroupLogView, type ShopView } from "./TelcoGroup";

const PACE = 1500;
const STEPS = 6;

export interface DoneView { action: string; agreed: boolean; reason: string; note: string; by: string; at: number; reported: string[] }
export interface TraceSummary {
  version: number; by: string; at: number; pins: number; shows: string[]; offAlert: string[]; empty: string[];
  actions: { action: TAction; label: string; ready: boolean; missing: string[] }[];
}
export interface LinkedView { msisdn: string; name: string; account: string; caseId: string | null; band: string }

export interface BlastView { lines: string[]; genuine: number; second: boolean }

export function NumberTrace({ a, view, labels, reasons, done, packetAt, linked, now, trace, needs, blasts = {}, groups = [], groupLog = [], shops = [], groupLabels = {} }: {
  a: Alert; view: TraceView; labels: Record<TAction, string>; reasons: readonly string[];
  done: DoneView | null; packetAt: number | null; linked: LinkedView[]; now: number; trace: TraceSummary | null; needs?: TraceSummary["actions"];
  blasts?: Partial<Record<TAction, BlastView>>; groups?: GroupView[]; groupLog?: GroupLogView[]; shops?: ShopView[]; groupLabels?: Record<string, string>;
}) {
  const needSecond = Object.values(blasts).some((b) => b?.second);
  // The replay only exists after the decision; before it the engineer works from his own pins.
  const [step, setStep] = useState(0);
  const running = step > 0 && step < STEPS;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStep((s) => s + 1), PACE);
    return () => clearTimeout(t);
  }, [running, step]);
  const finished = step >= STEPS;
  const bench = `/telco/work?alert=${a.id}`;
  const readyOpts = trace ? trace.actions.filter((x) => x.ready).map((x) => x.action) : [];
  const pick = readyOpts.includes(a.ai.suggest) ? a.ai.suggest : readyOpts[0];

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-5">
        <section className="card p-5" data-testid="my-trace">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Your trace</h2>
              <p className="mt-0.5 text-[13.5px] muted">Built by hand in the workbench from Telco-A&apos;s own records. They stay inside Telco-A: banks only ever see DoT&apos;s risk rating.</p>
            </div>
            {!done && <Link href={bench} className="btn btn-phone" data-testid="open-workbench"><Wrench size={15} aria-hidden />{trace ? "Keep working in the workbench" : "Open the workbench"}</Link>}
          </div>
          {!trace ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[14px]" data-testid="trace-empty">
              <p className="font-medium">No trace saved yet.</p>
              <p className="mt-1 muted">Look up the {a.kind === "IMEI" ? "handset" : "number"} {a.value}, read its call records, follow the SIMs, towers and shops, and pin what matters. Then save it here.</p>
            </div>
          ) : (
            <div className="mt-4" data-testid="trace-saved">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] muted">Version {trace.version} · {trace.pins} pin{trace.pins === 1 ? "" : "s"} · saved by {trace.by} · {when(trace.at)}</p>
                <a href={`/api/telco-evidence/${a.id}`} className="btn btn-sm" download data-testid="download-calls">Download call records + summary (CSV)</a>
              </div>
              {trace.shows.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-[13.5px]" data-testid="trace-shows">
                  {trace.shows.map((f) => <li key={f} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--phone)]" />{f}</li>)}
                </ul>
              ) : <p className="mt-3 text-[13.5px] muted">Your pins don&apos;t show anything about this alert yet.</p>}
              {trace.empty.length > 0 && <p className="mt-3 text-[13px] text-[var(--warn)]" data-testid="trace-empty-pins"><b>Pinned, but the record holds nothing:</b> {trace.empty.join("; ")}.</p>}
              {trace.offAlert.length > 0 && (
                <p className="mt-3 flex gap-2 rounded-xl bg-[var(--warn-tint)] px-3 py-2 text-[13px] text-[var(--warn)]" data-testid="trace-offalert">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /><span><b>Not part of this alert:</b> {trace.offAlert.join("; ")}. They don&apos;t count as evidence here.</span>
                </p>
              )}
            </div>
          )}
        </section>

        <section className="card p-5" data-testid="telco-decide-panel">
          <h2>Decision</h2>
          {done ? (
            <div className="mt-3 text-[13.5px]" data-testid="telco-decided">
              <p className="font-semibold">{done.action}</p>
              <p className="mt-1"><span className={`chip ${done.agreed ? "chip-good" : "chip-warn"}`}>{done.agreed ? "Agreed with the AI" : "Overruled the AI"}</span> <span className="muted">{done.reason}{done.note ? `: ${done.note}` : ""}</span></p>
              <p className="mt-1 muted">{done.by} · {when(done.at)}</p>
              {done.reported.length > 0 && <p className="mt-2 text-[var(--phone)]">Reported to DoT: {done.reported.length} linked number{done.reported.length > 1 ? "s" : ""} now rated High for banks.</p>}
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <p className="label">What the records hold</p>
                <ul className="mt-1.5 space-y-1.5" data-testid="telco-facts">
                  {a.facts.map((f) => <li key={f} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" />{f}</li>)}
                </ul>
                {a.clash && (
                  <p className="mt-3 flex gap-2 rounded-xl bg-[var(--warn-tint)] px-3 py-2 text-[13.5px] text-[var(--warn)]" data-testid="telco-clash">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /><span><b>The trap on this alert:</b> {a.clash}</span>
                  </p>
                )}
              </div>
            </div>
          ) : !trace ? (
            <div className="mt-3" data-testid="decide-locked">
              <p className="text-[13.5px]"><Lock size={13} className="mr-1 inline" aria-hidden />Your options open once you save a trace in the workbench with the clues each one needs:</p>
              <ul className="mt-2 space-y-1.5 text-[13.5px]">
                {(needs ?? []).map((x) => (
                  <li key={x.action} data-testid={`opt-${x.action}`} data-ready="no" className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 opacity-70">
                    <input type="radio" disabled className="mt-1" aria-label={labels[x.action]} />
                    <span><span className="font-medium">{labels[x.action]}</span><span className="mt-0.5 block text-[12px] muted">Needs: {x.missing.join("; ")}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ) : readyOpts.length === 0 ? (
            <div className="mt-3" data-testid="none-ready">
              <p className="text-[13.5px]"><Lock size={13} className="mr-1 inline" aria-hidden />Your trace (version {trace.version}) doesn&apos;t hold enough clues for any option yet. Add what each one needs in the workbench, save again, and it opens here.</p>
              <ul className="mt-2 space-y-1.5 text-[13.5px]">
                {trace.actions.map((x) => (
                  <li key={x.action} data-testid={`opt-${x.action}`} data-ready="no" className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 opacity-70">
                    <input type="radio" disabled className="mt-1" aria-label={labels[x.action]} />
                    <span><span className="font-medium">{labels[x.action]}</span>{x.action === a.ai.suggest && <span className="chip chip-phone ml-1.5">AI</span>}<span className="mt-0.5 block text-[12px] muted">Still needs: {x.missing.join("; ")}</span><BlastLine b={blasts[x.action]} action={x.action} /></span>
                  </li>
                ))}
              </ul>
              <Link href={bench} className="btn btn-phone btn-sm mt-2">Add the missing clues</Link>
            </div>
          ) : (
            <ActForm action={telcoDecideAction} hidden={{ alert: a.id }} label="Record decision" variant="phone" testid="telco-decide" className="mt-3 space-y-3">
              <p className="text-[12.5px] muted">Based on your trace, version {trace.version}. An action opens only when your pins hold the evidence it needs.</p>
              <fieldset className="space-y-1.5">
                <legend className="label mb-1">Your call</legend>
                {trace.actions.map((x) => (
                  <label key={x.action} data-ready={x.ready ? "yes" : "no"} data-testid={`opt-${x.action}`} className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-[14px] transition-colors ${x.ready ? "cursor-pointer hover:bg-white/70 has-[:checked]:bg-[var(--accent-tint)]" : "opacity-60"}`}>
                    <input type="radio" name="action" value={x.action} disabled={!x.ready} defaultChecked={x.action === pick} className="mt-1 accent-[var(--phone)]" data-testid={`t-option-${x.action}`} />
                    <span>{labels[x.action]}{x.action === a.ai.suggest && <span className="chip chip-phone ml-1.5">AI</span>}
                      {!x.ready && <span className="mt-0.5 block text-[12px] muted">Still missing: {x.missing.join("; ")}</span>}
                      <BlastLine b={blasts[x.action]} action={x.action} />
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="block"><span className="label">Reason</span>
                <select name="reason" className="input mt-1" defaultValue={reasons[0]} data-testid="t-reason">
                  {reasons.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <input name="note" placeholder="Note (what you checked)" className="input" />
              {needSecond && (
                <label className="block rounded-2xl bg-[var(--warn-tint)] px-3.5 py-3 text-[13px]">
                  <b>Blocking the route needs a second person.</b> It also cuts off genuine lines, so someone else must check it with you. Leave empty for any other choice.
                  <input name="second" className="input mt-2" placeholder="Who checked it with you (name and role)" data-testid="t-second" />
                </label>
              )}
              {a.options.includes("BAR_IMEI") && (
                <label className="flex items-start gap-3 rounded-2xl bg-[var(--phone-tint)] px-3.5 py-3 text-[13px]">
                  <input type="checkbox" name="ceir" className="switch mt-0.5" data-testid="t-ceir" />
                  <span><b>Also ask DoT for a national block</b> (CEIR), if you bar the handset. Telco-A&apos;s bar works only on its own network; CEIR blocks the handset on every network in India.</span>
                </label>
              )}
              {a.reportable && linked.length > 0 && (
                <label className="flex items-start gap-3 rounded-2xl bg-[var(--phone-tint)] px-3.5 py-3 text-[13px]">
                  <input type="checkbox" name="report" defaultChecked className="switch mt-0.5" data-testid="t-report" />
                  <span><b>Report to DoT</b> (through DIP). These phones were activated through the same retailer the same week and sit on mule accounts:
                    <span className="mt-1 block mono text-[12px]">{linked.map((l) => `${l.msisdn} (${l.name}, now ${l.band})`).join(" · ")}</span>
                    <span className="mt-1 block muted">DoT can raise their fraud-risk rating to High. Banks see only that rating.</span>
                  </span>
                </label>
              )}
            </ActForm>
          )}
        </section>

        {trace && <TelcoGroup alert={a.id} groups={groups} log={groupLog} shops={shops} labels={groupLabels} />}

        {done && (
        <section className="card p-5" data-testid="trace">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>The whole picture</h2>
              <p className="mt-0.5 text-[13.5px] muted">After the decision: everything the records link to this {a.kind === "IMEI" ? "handset" : "number"}, to check your trace against.</p>
            </div>
            {step === 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} data-testid="replay-trace"><Play size={14} aria-hidden />Replay</button>
            ) : finished ? (
              <span className="chip chip-good" data-testid="trace-done"><Check size={13} aria-hidden />Replayed</span>
            ) : (
              <span className="flex items-center gap-2 text-[13px] muted"><span className="spinner" />Replaying…</span>
            )}
          </div>
          <div className="thread mt-4"><div className="thread-fill" style={{ width: `${(step / STEPS) * 100}%`, background: "#0d0d0d" }} /></div>
          {step > 0 && <Graph view={view} step={step} />}

          <ol className={`${step === 0 ? "hidden" : ""} mt-4 space-y-1.5 text-[13.5px]`} data-testid="trace-log">
            {view.log.map((line, i) => (
              <li key={i} className={`flex items-start gap-2 transition-all duration-500 ${step > i ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-[#0d0d0d]" />
                {line}
              </li>
            ))}
          </ol>
        </section>
        )}

        {done && (view.shown.length > 0 || view.cash.length > 0) && (
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
        {!trace ? (
          <section className="card p-5 text-[13.5px]" data-testid="ai-locked">
            <h2>Network counters and Telco-A&apos;s AI</h2>
            <p className="mt-2 muted"><Lock size={13} className="mr-1 inline" aria-hidden />They open once you have saved a trace, so your first read of the records is your own.</p>
          </section>
        ) : <>
        <section className="card p-5" data-testid="signals">
          <h2>Network counters</h2>
          <ul className="mt-3 space-y-3">
            {a.gauges.map((g, i) => (
              <li key={g.label} data-testid="gauge">
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]"><span>{g.label}</span><span className="font-medium">{g.text}</span></div>
                <div className="thread mt-1.5" style={{ height: 5 }}>
                  <div className="thread-fill" style={{ width: `${g.level * 100}%`, transitionDelay: `${i * 120}ms`, background: g.bad ? "var(--warn)" : "var(--good)" }} />
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
          <p className="mt-1 text-[17px] font-semibold">{labels[a.ai.suggest]}</p>
          <p className="mt-2 text-[13px] muted">Because of: {a.ai.drivers.join("; ")}.</p>
          <p className="mt-2 text-[12.5px] muted">It reads network counters only. It does not see company registrations, police letters or who owned the number before. That part is your trace.</p>
        </section>
        </>}

        {a.cases.length > 0 && a.calls.length > 0 && (
          <section className="card p-5" data-testid="police-panel">
            <h2 className="flex items-center gap-2"><ShieldAlert size={17} className="text-[var(--phone)]" aria-hidden />Police packet</h2>
            <p className="mt-1 text-[13.5px] muted">The {a.calls.length} call records, for the investigating officer on {a.cases.join(", ")} only. The bank never receives them.</p>
            {packetAt ? <p className="mt-3 chip chip-good" data-testid="packet-done">Prepared {when(packetAt)}</p>
              : trace ? <ActForm action={policePacketAction} hidden={{ alert: a.id }} label="Prepare for police" variant="ghost" size="sm" testid="police-packet" className="mt-3" />
              : <p className="mt-3 text-[13px] muted"><Lock size={13} className="mr-1 inline" aria-hidden />After you save a trace.</p>}
          </section>
        )}
        <p className="text-[12px] muted">Demo clock {when(now)}</p>
      </aside>
    </div>
  );
}

function BlastLine({ b, action }: { b?: BlastView; action: TAction }) {
  if (!b) return null;
  return (
    <span className={`mt-1 block rounded-lg px-2 py-1 text-[12px] ${b.genuine ? "bg-[var(--warn-tint)] text-[var(--warn)]" : "bg-white/60 muted"}`} data-testid={`blast-${action}`} data-genuine={b.genuine}>
      <b>Who else gets cut off:</b> {b.lines.join(" ")}
    </span>
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
        {cols.map((c, ci) => <text key={c.title} x={xs[ci + 1]} y={14} fontSize={12} fill="var(--muted)" opacity={step >= c.at ? 1 : 0} style={{ transition: "opacity .4s" }} fontFamily="var(--font-mono)" letterSpacing=".06em">{c.title.toUpperCase()}</text>)}
        <text x={xs[0]} y={14} fontSize={12} fill="var(--muted)" opacity={step >= 1 ? 1 : 0} fontFamily="var(--font-mono)" letterSpacing=".06em">DEVICE</text>
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
              {c.more > 0 && <text x={xs[ci + 1]! + 10} y={y(c.nodes.length, n) + 22} fontSize={12} fill="var(--muted)" opacity={step >= c.at ? 1 : 0} style={{ transition: "opacity .4s" }}>+ {c.more} more</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Node({ x, y, w, label, sub, color, on, delay = 0, strong }: { x: number; y: number; w: number; label: string; sub: string; color: string; on: boolean; delay?: number; strong?: boolean }) {
  // Waiting nodes stay readable (grey edge); when the trace reaches them they spring in with their colour.
  return (
    <motion.g initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.9, x: on ? 0 : -12 }} transition={{ type: "spring", stiffness: 420, damping: 26, delay: on ? delay / 1000 : 0 }} style={{ transformOrigin: `${x + w / 2}px ${y + 19}px` }}>
      <rect x={x} y={y} width={w} height={38} rx={4} fill="#fff" stroke={on ? color : "#d4d4d4"} strokeWidth={on && strong ? 1.6 : 1} />
      <rect x={x} y={y + 8} width={3} height={22} fill={on ? color : "#c8c8c8"} />
      <text x={x + 11} y={y + 16} fontSize={12.5} fontWeight={600} fill="var(--fg)" fontFamily={label.startsWith("+") || /^\d/.test(label) ? "var(--font-mono)" : undefined}>{clip(label, Math.floor(w / 7.4))}</text>
      <text x={x + 11} y={y + 31} fontSize={11} fill="var(--muted)">{clip(sub, Math.floor(w / 6))}</text>
    </motion.g>
  );
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const curve = (x1: number, y1: number, x2: number, y2: number) => { const m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; };
