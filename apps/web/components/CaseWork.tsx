"use client";
/** Working a case: the officer starts the trace (the rules engine runs it now), watches it reach each layer,
 *  then decides every account with the AI. Accounts where the evidence clashes come one at a time;
 *  clear ones can be accepted together. Decisions are saved, so a reload picks up where she left off. */
import { useEffect, useRef, useState } from "react";
import type { Graph } from "@/lib/server/graph";
import type { AiView, Choice } from "@/lib/server/judge";
import { TrailGraph } from "./TrailGraph";
import { DecisionCard, type CardAccount } from "./DecisionCard";
import { ActForm } from "./ActForm";
import { decideClearAction } from "@/app/actions";
import { inr, inrShort } from "@/lib/format";

export interface PointItem { acct: CardAccount; ai: AiView; returned: { by: string; note: string } | null }
export interface ClearItem { id: string; name: string; suggest: Choice; amount: number; confidence: number }
export interface DoneItem { id: string; name: string; choice: Choice; agreed: boolean; status: string }
interface TraceInfo { ms: number; txnsRead: number; flows: number; hops: { hop: number; accounts: number; money: number }[]; movedOut: number; catchable: number }

const PACE = 1400;
const CHOICE: Record<Choice, string> = { HOLD: "Hold", NO_HOLD: "No hold, watch", SEND_BACK: "Sent back to police" };

export function CaseWork({ caseId, graph, points, clear, done, canDecide }: { caseId: string; graph: Graph; points: PointItem[]; clear: ClearItem[]; done: DoneItem[]; canDecide: boolean }) {
  const total = points.length + clear.length + done.length;
  const [phase, setPhase] = useState<"idle" | "tracing" | "work">(done.length > 0 || points.some((p) => p.returned) ? "work" : "idle");
  const [info, setInfo] = useState<TraceInfo | null>(null);
  const [reveal, setReveal] = useState(0);
  const [err, setErr] = useState("");
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const top = useRef<HTMLElement>(null);

  const start = async () => {
    setErr(""); setPhase("tracing"); setReveal(0); setInfo(null);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const r = await fetch(`/api/trace/${caseId}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Trace failed");
      setInfo(await r.json());
    } catch (e) { setErr(String((e as Error).message)); setPhase(done.length ? "work" : "idle"); }
  };
  useEffect(() => {
    if (phase !== "tracing" || !info) return;
    if (reveal >= graph.cols.length - 1) { const t = setTimeout(() => setPhase("work"), PACE * 1.6); return () => clearTimeout(t); }
    const t = setTimeout(() => setReveal((x) => x + 1), PACE);
    return () => clearTimeout(t);
  }, [phase, info, reveal, graph.cols.length]);

  if (phase === "idle") {
    return (
      <section ref={top} className="card p-5 scroll-mt-24" data-testid="casework">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-[var(--accent)]">Work this case</p>
            <h2 className="mt-1">{total} accounts to decide, together with the AI</h2>
            <p className="mt-1 text-[14px] muted">The rules engine traces the money now. Then you decide each account: {points.length} need your judgement because the evidence clashes, {clear.length} look clear.</p>
          </div>
          {canDecide ? <button type="button" className="btn btn-primary" onClick={start} data-testid="start-work">Start the trace</button> : <span className="chip chip-grey">The fraud officer works this case</span>}
        </div>
        {err && <p className="mt-2 text-[13px] text-[var(--bad)]">{err}</p>}
      </section>
    );
  }

  if (phase === "tracing") {
    const hopsShown = info ? info.hops.filter((h) => h.hop + 1 <= reveal) : [];
    return (
      <section ref={top} className="card p-5 scroll-mt-24" data-testid="casework">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2">{info ? <span className="live-dot" /> : <span className="spinner" />} Tracing the victims&apos; money</h2>
          <p className="text-[13px] muted">{graph.cols[Math.min(reveal, graph.cols.length - 1)]}</p>
        </div>
        <div className="mt-3 grid gap-4 xl:grid-cols-[1fr_300px]">
          <TrailGraph g={graph} reveal={info ? reveal : 0} showChain={false} legend={false} />
          <ol className="panel space-y-2 p-4 text-[13px]" data-testid="trace-log">
            {!info && <li className="muted">Asking the rules engine…</li>}
            {info && <li className="pop-in">Read {info.txnsRead.toLocaleString("en-IN")} payments and followed {info.flows} money movements in <b>{info.ms} ms</b>. Shown slowly so you can follow.</li>}
            {info && reveal >= 1 && <li className="pop-in">{graph.nodes.filter((n) => n.kind === "phone").length} phone{graph.nodes.filter((n) => n.kind === "phone").length === 1 ? "" : "s"} called {graph.nodes.filter((n) => n.col === 1).length} victims.</li>}
            {hopsShown.map((h) => <li key={h.hop} className="pop-in">{h.hop === 4 ? "Layer 4+" : h.hop === 1 ? "First accounts" : `Layer ${h.hop}`}: {h.accounts} accounts, <b className="money">{inrShort(h.money)}</b> of victims&apos; money still there.</li>)}
            {info && reveal >= graph.cols.length - 1 && <li className="pop-in">{inrShort(info.movedOut)} already left the bank. <b>{points.length}</b> accounts need your judgement.</li>}
          </ol>
        </div>
      </section>
    );
  }

  const decided = done.length;
  const next = points[0];
  const clearShown = clear.filter((c) => !unticked.has(c.id));
  return (
    <section ref={top} className="card p-5 scroll-mt-24" data-testid="casework">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-[var(--accent)]">Work this case</p>
          <h2 className="mt-1">{decided} of {total} accounts decided</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-48 overflow-hidden rounded-full bg-[var(--line)]"><span className="block h-full rounded-full bg-[var(--accent)] transition-all duration-700" style={{ width: `${total ? (decided / total) * 100 : 0}%` }} /></span>
          <button type="button" className="btn btn-sm" onClick={start}>Replay the trace</button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {next && canDecide && <DecisionCard key={next.acct.id} acct={next.acct} ai={next.ai} returned={next.returned} step={`Needs your judgement · ${points.length} left`} />}

        {!next && clear.length > 0 && canDecide && (
          <div className="card p-5 page-enter" data-testid="clear-group">
            <p className="eyebrow">These look clear</p>
            <h3 className="title mt-0.5 text-[20px]">Accept the AI&apos;s suggestion for {clearShown.length} account{clearShown.length === 1 ? "" : "s"}</h3>
            <p className="mt-1 text-[13.5px] muted">No clash in the evidence. Untick any you want to look at yourself; it will come back as its own card.</p>
            <ActForm action={decideClearAction} label={`Accept ${clearShown.length}`} testid="accept-clear" className="mt-3 space-y-3">
              <ul className="grid gap-1.5 md:grid-cols-2">
                {clear.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/50 px-3 py-2 text-[13.5px]">
                      <input type="checkbox" name="account" value={c.id} checked={!unticked.has(c.id)} onChange={(e) => setUnticked((u) => { const n = new Set(u); if (e.target.checked) n.delete(c.id); else n.add(c.id); return n; })} />
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-auto muted">{c.suggest === "HOLD" ? `Hold ${inr(c.amount)}` : CHOICE[c.suggest]} · {Math.round(c.confidence * 100)}%</span>
                    </label>
                  </li>
                ))}
              </ul>
            </ActForm>
          </div>
        )}

        {!next && clear.length === 0 && (
          <div className="panel p-4 page-enter" data-testid="case-done">
            <p className="font-semibold">Every account on this case is decided.</p>
            <p className="mt-1 text-[13.5px] muted">Holds and any overrules of a confident AI are with the supervisor now. Compliance sees every decision and its reason.</p>
          </div>
        )}

        {done.length > 0 && (
          <details className="panel p-3" open={!next && clear.length === 0}>
            <summary className="text-[14px] font-medium">Decided so far ({done.length})</summary>
            <ul className="mt-2 grid gap-1 text-[13px] md:grid-cols-2">
              {done.map((x) => (
                <li key={x.id} className="flex items-center gap-2">
                  <span className="font-medium">{x.name}</span>
                  <span className="muted">{CHOICE[x.choice]}</span>
                  <span className={`chip ${x.agreed ? "chip-good" : "chip-warn"} ml-auto`}>{x.agreed ? "agreed with AI" : "overruled AI"}</span>
                  <span className="chip chip-grey">{x.status}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
