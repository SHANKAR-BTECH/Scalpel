"use client";
/** Replays, step by step, how Scalpel worked out this case: reading the reports, finding the phone,
 *  following the money, scoring each account, and the network it ends with. All numbers are this case's real ones. */
import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/server/analysis";
import { TrailGraph } from "./TrailGraph";
import { CountUp } from "./CountUp";
import { inr, inrShort } from "@/lib/format";

const STEPS = [
  { t: "Reading the reports", d: "Complaints and police requests" },
  { t: "Finding the phone", d: "Calls matched to real SIMs" },
  { t: "Following the money", d: "Hop by hop through accounts" },
  { t: "Scoring each account", d: "The mule-score model" },
  { t: "The network", d: "Main road the money took" },
];
const MS = [3600, 4200, 5200, 4400, 4200];

export function CaseAnalysis({ a }: { a: Analysis }) {
  const [step, setStep] = useState(-1); // -1 = not started, STEPS.length = finished
  const [auto, setAuto] = useState(true);
  const [reveal, setReveal] = useState(1);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step < 0 || step >= STEPS.length || !auto) return;
    const t = setTimeout(() => setStep((s) => s + 1), MS[step]);
    return () => clearTimeout(t);
  }, [step, auto]);
  useEffect(() => {
    if (step !== 2) return;
    setReveal(1);
    const t = setInterval(() => setReveal((r) => (r >= a.graph.cols.length - 1 ? r : r + 1)), 650);
    return () => clearInterval(t);
  }, [step, a.graph.cols.length]);

  const start = () => { setAuto(true); setStep(0); top.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  const go = (i: number) => { setAuto(false); setStep(i); };
  const label = (id: string) => a.graph.nodes.find((n) => n.id === id)?.label ?? id;

  if (step < 0) {
    return (
      <section ref={top} className="card relative overflow-hidden p-5" data-testid="analysis">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-[var(--accent)]">Scalpel&apos;s analysis</p>
            <h2 className="mt-1">See how Scalpel worked this case out</h2>
            <p className="mt-1 text-[14px] muted">{a.complaints.length} complaints, {a.requests.count} police requests and {a.calls} calls, read and joined into one picture.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={start} data-testid="run-analysis">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4v16l13-8z" /></svg> Run analysis
          </button>
        </div>
      </section>
    );
  }

  const done = step >= STEPS.length;
  return (
    <section ref={top} className="card overflow-hidden p-0" data-testid="analysis">
      <div className="grid lg:grid-cols-[260px_1fr]">
        <ol className="border-b border-[var(--line)] bg-[rgba(246,248,251,.7)] p-4 lg:border-b-0 lg:border-r">
          <li className="eyebrow mb-3 text-[var(--accent)]">Scalpel&apos;s analysis</li>
          {STEPS.map((s, i) => {
            const state = done || i < step ? "done" : i === step ? "now" : "next";
            return (
              <li key={s.t}>
                <button type="button" onClick={() => go(i)} className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-300 ${state === "now" ? "glass" : "hover:bg-white/70"}`}>
                  <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-all duration-500 ${state === "done" ? "bg-[var(--accent)] text-white" : state === "now" ? "bg-white" : "border border-[var(--line-strong)] text-[var(--muted)]"}`}>
                    {state === "done" ? "✓" : state === "now" ? <span className="spinner" /> : i + 1}
                  </span>
                  <span><span className={`block text-[14px] font-semibold ${state === "next" ? "muted" : ""}`}>{s.t}</span><span className="block text-[12px] muted">{s.d}</span></span>
                </button>
                {state === "now" && auto && <div className="mx-2 mb-1 h-0.5 overflow-hidden rounded bg-[var(--line)]"><div key={step} className="h-full bg-[var(--accent)]" style={{ animation: `grow-x ${MS[i]}ms linear both`, transformOrigin: "left" }} /></div>}
              </li>
            );
          })}
          <li className="mt-3 flex gap-2">
            {done ? <button type="button" className="btn btn-sm" onClick={start}>Replay</button>
              : <><button type="button" className="btn btn-sm" onClick={() => setAuto((x) => !x)}>{auto ? "Pause" : "Play"}</button><button type="button" className="btn btn-sm" onClick={() => go(STEPS.length)} data-testid="skip-analysis">Skip to result</button></>}
          </li>
        </ol>

        <div key={step} className="min-h-[420px] min-w-0 p-5 page-enter">
          {step === 0 && (
            <div>
              <h3 className="title text-[20px]">Reading {a.complaints.length} complaints and {a.requests.count} police requests</h3>
              <div className="relative mt-3 rounded-xl border border-white/80 bg-white/60">
                <div className="scan" />
                <table className="table text-[13.5px]">
                  <thead><tr><th className="!pl-4">Complaint (NCRP)</th><th>Victim</th><th className="!pr-4 text-right">Paid</th></tr></thead>
                  <tbody>
                    {a.complaints.slice(0, 7).map((k, i) => (
                      <tr key={k.id} className="pop-in" style={{ animationDelay: `${200 + i * 260}ms` }}>
                        <td className="!pl-4"><span className="mono">{k.ack}</span></td><td>{k.victim}, {k.city}</td><td className="money !pr-4 text-right">{inr(k.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {a.complaints.length > 7 && <p className="px-3 pb-2 text-[12.5px] muted">and {a.complaints.length - 7} more</p>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 pop-in" style={{ animationDelay: "2s" }}>
                <span className="chip chip-blue">{a.requests.count} police requests from {a.requests.stations} stations</span>
                {a.requests.whole > 0 && <span className="chip chip-warn">{a.requests.whole} ask to freeze the whole account</span>}
                {a.requests.unsigned > 0 && <span className="chip chip-bad">{a.requests.unsigned} not signed</span>}
                <span className="chip chip-grey">Police asked for <span className="money"><CountUp value={a.requests.asked} format="inrShort" /></span> in total</span>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h3 className="title text-[20px]">{a.calls} scam calls, matched to the SIMs that really made them</h3>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {a.devices.slice(0, 2).map((dv, di) => (
                  <div key={dv.id} className="rounded-xl border border-[rgba(109,58,214,.25)] bg-[var(--phone-tint)] p-4 pop-in" style={{ animationDelay: `${di * 300}ms` }}>
                    <p className="font-semibold text-[var(--phone)]">{dv.label}</p>
                    <p className="mono text-[12px] muted">{dv.simbox || dv.sims > 1 ? "IMEI " : ""}{dv.id}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${dv.used} of ${dv.sims} SIMs used for these calls`}>
                      {Array.from({ length: Math.min(dv.sims, 60) }, (_, i) => (
                        <span key={i} className={`sim ${i < dv.used ? "on" : ""}`} style={i < dv.used ? { animationDelay: `${500 + i * 140}ms` } : undefined} />
                      ))}
                    </div>
                    <p className="mt-3 text-[13.5px]"><b>{dv.calls}</b> calls to <b>{dv.victims}</b> victims came from <b>{dv.used}</b> {dv.used === 1 ? "SIM" : "SIMs"} in this one {dv.simbox ? "SIM box" : dv.sims > 1 ? "handset" : "phone"}.</p>
                  </div>
                ))}
              </div>
              {a.spoofed.map((s, i) => (
                <div key={s.shown} className="mt-3 rounded-xl border border-[#f1b8b1] bg-[var(--bad-tint)] p-3 text-[13.5px] pop-in" style={{ animationDelay: `${1800 + i * 300}ms` }}>
                  Victims saw <span className="mono line-through decoration-[var(--bad)] decoration-2">{s.shown}</span> on their screen, but the network shows a different SIM. That number {s.protected ? "is a registered bank helpline" : "belongs to an innocent customer"}, so Scalpel will not ask to block it.
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="title text-[20px]">Following the victims&apos; money, one hop at a time</h3>
                <p className="text-[13px] muted">{a.graph.cols[Math.min(reveal, a.graph.cols.length - 1)]}</p>
              </div>
              <div className="mt-3"><TrailGraph g={a.graph} reveal={reveal} showChain={false} legend={false} /></div>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {a.hops.map((h, i) => (
                  <div key={h.label} className={`panel p-3 transition-opacity duration-500 ${reveal >= i + 2 ? "opacity-100" : "opacity-30"}`}>
                    <p className="text-[12px] muted">{h.label}</p>
                    <p className="money text-[17px]">{reveal >= i + 2 ? <CountUp value={h.money} format="inrShort" /> : "…"}</p>
                    <p className="text-[12px] muted">{h.accounts} accounts</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="title text-[20px]">The mule-score model checks 17 clues on every account</h3>
              <p className="mt-1 text-[13.5px] muted">High score: the account behaves like one rented out to pass scam money on. Low score: it looks like a real shop or person who got paid.</p>
              <ul className="mt-3 space-y-2.5">
                {a.scored.slice(0, 7).map((s, i) => (
                  <li key={s.id} className="grid items-center gap-x-3 gap-y-0.5 md:grid-cols-[180px_1fr_52px] pop-in" style={{ animationDelay: `${i * 220}ms` }}>
                    <span className="truncate text-[14px] font-medium">{s.name}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-[var(--line)]">
                      <span className="bar-grow block h-full rounded-full" style={{ width: `${Math.max(3, s.score * 100)}%`, background: s.mule ? "var(--bad)" : s.score < 0.2 ? "var(--good)" : "#9aa3b2", animationDelay: `${200 + i * 220}ms` }} />
                    </span>
                    <span className="money text-right text-[14px]"><CountUp value={Math.round(s.score * 100)} /></span>
                    <span className="text-[12.5px] muted md:col-start-2 md:col-span-2 fade-late" style={{ animationDelay: `${700 + i * 220}ms` }}>{s.reasons.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="title text-[20px]">The network behind {a.caseId}</h3>
              {a.graph.chain.length > 1 && <p className="mt-1 text-[13.5px]"><span className="muted">Main road: </span>{a.graph.chain.map(label).join(" → ")}</p>}
              <div className="mt-3"><TrailGraph g={a.graph} legend /></div>
            </div>
          )}

          {done && (
            <div>
              <h3 className="title text-[20px]">What Scalpel suggests</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="panel p-4"><p className="text-[12.5px] muted">Hold, across {a.verdict.holdAccounts} accounts</p><p className="money text-[26px] text-[var(--accent)]"><CountUp value={a.verdict.hold} format="inrShort" /></p><p className="text-[12.5px] muted">Police asked for {inrShort(a.verdict.asked)}</p></div>
                <div className="panel p-4"><p className="text-[12.5px] muted">Already gone from the bank</p><p className="money text-[26px]"><CountUp value={a.movedOut} format="inrShort" /></p><p className="text-[12.5px] muted">Cash, crypto, gold and other banks</p></div>
                <div className="panel p-4"><p className="text-[12.5px] muted">Likely mules / likely innocent</p><p className="money text-[26px]"><CountUp value={a.verdict.mules} /> <span className="muted">/</span> <span className="text-[var(--good)]"><CountUp value={a.verdict.innocents} /></span></p><p className="text-[12.5px] muted">Innocent ones are held only for the traced amount</p></div>
                <div className="panel p-4"><p className="text-[12.5px] muted">Phones</p><p className="text-[15px] font-semibold text-[var(--phone)]">Block {a.devices.length === 1 ? "1 device" : `${a.devices.length} devices`}</p><p className="text-[12.5px] muted">{a.spoofed.length > 0 ? `Not the ${a.spoofed.length} spoofed number${a.spoofed.length > 1 ? "s" : ""} victims saw` : "Ask Telco-A from the phone panel"}</p></div>
              </div>
              {a.verdict.routeBack > 0 && <p className="mt-3 text-[13.5px] text-[var(--warn)]">{a.verdict.routeBack} police {a.verdict.routeBack === 1 ? "request goes" : "requests go"} back to the officer: they can&apos;t be used as they are.</p>}
              <div className="mt-4 flex flex-wrap gap-2"><a href="#accounts" className="btn btn-primary">Go to the accounts</a><button type="button" className="btn" onClick={() => go(4)}>See the network again</button></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
