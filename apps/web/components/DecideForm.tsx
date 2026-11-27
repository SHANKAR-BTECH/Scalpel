"use client";
/** Imran's decision, commit first. He picks an action, ticks the pins it rests on, and answers every pin of his that
 *  argues against it with another pin that supports it. The server checks all of this live (and again on save);
 *  nothing is pre-ticked and nothing is chosen for him. A step that cuts off genuine lines needs a second person. */
import { useEffect, useMemo, useState } from "react";
import { Lock, Scale } from "lucide-react";
import type { TAction } from "@/lib/server/telco";
import type { CallCheck, PinMeaning } from "@/lib/server/tracecheck";
import { ActForm } from "./ActForm";
import { callCheckAction, telcoDecideAction } from "@/app/actions";
import type { BlastView, LinkedView, TraceSummary } from "./NumberTrace";

export function DecideForm({ alert, aiPick, options, trace, labels, reasons, blasts, peers, ceirOffer, linked, reportable, Steps, BlastLine }: {
  alert: string; aiPick: TAction; options: TAction[]; trace: TraceSummary & { meanings: PinMeaning[] }; labels: Record<TAction, string>; reasons: readonly string[];
  blasts: Partial<Record<TAction, BlastView>>; peers: readonly string[]; ceirOffer: boolean; linked: LinkedView[]; reportable: boolean;
  Steps: React.ComponentType<{ x: TraceSummary["actions"][number]; alert: string; prefix: string }>;
  BlastLine: React.ComponentType<{ b?: BlastView; action: TAction }>;
}) {
  const ready = trace.actions.filter((x) => x.ready).map((x) => x.action);
  const [act, setAct] = useState<TAction | null>(null);
  const [cite, setCite] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<CallCheck | null>(null);
  const key = useMemo(() => JSON.stringify([act, [...cite].sort(), answers]), [act, cite, answers]);
  useEffect(() => {
    if (!act) { setCheck(null); return; }
    let live = true;
    const t = setTimeout(() => { callCheckAction(alert, act, [...cite], answers).then((c) => { if (live) setCheck(c); }).catch(() => {}); }, 150);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, alert]);
  const flip = (k: string) => setCite((x) => { const y = new Set(x); if (y.has(k)) y.delete(k); else y.add(k); return y; });
  const second = act ? blasts[act]?.second : false;
  const ok = Boolean(act && check?.ready);

  return (
    <ActForm action={telcoDecideAction} hidden={{ alert }} label="Record decision" variant="phone" testid="telco-decide" className="mt-3 space-y-4" disabled={!ok}>
      {ready.length === 0 ? (
        <p className="rounded-xl bg-[var(--warn-tint)] px-3 py-2 text-[13px] text-[var(--warn)]" data-testid="none-ready"><Lock size={13} className="mr-1 inline" aria-hidden />Your trace (version {trace.version}) doesn&apos;t hold enough clues for any option yet. Under each option, &quot;Find it&quot; opens the right tool in the workbench. Pin what you find, save again, and the option opens here.</p>
      ) : <p className="text-[12.5px] muted">Based on your trace, version {trace.version}. Pick your call, then show the pins it rests on.</p>}

      <fieldset className="space-y-1.5">
        <legend className="label mb-1">1 · Your call</legend>
        {trace.actions.filter((x) => options.includes(x.action)).map((x) => (
          <label key={x.action} data-ready={x.ready ? "yes" : "no"} data-testid={`opt-${x.action}`} className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-[14px] transition-colors ${x.ready ? "cursor-pointer hover:bg-white/70 has-[:checked]:bg-[var(--accent-tint)]" : "opacity-60"}`}>
            <input type="radio" name="action" value={x.action} disabled={!x.ready} checked={act === x.action} onChange={() => { setAct(x.action); setAnswers({}); }} className="mt-1 accent-[var(--phone)]" data-testid={`t-option-${x.action}`} />
            <span>{labels[x.action]}{x.action === aiPick && <span className="chip chip-phone ml-1.5">AI</span>}
              {!x.ready && <Steps x={x} alert={alert} prefix="Still missing" />}
              <BlastLine b={blasts[x.action]} action={x.action} />
            </span>
          </label>
        ))}
      </fieldset>

      {act && (
        <div className="space-y-4" data-testid="call-builder">
          <fieldset>
            <legend className="label mb-1">2 · The pins your call rests on</legend>
            <ul className="space-y-1 text-[13.5px]">
              {trace.meanings.map((m) => (
                <li key={m.key}>
                  <label className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/60">
                    <input type="checkbox" name="cite" value={m.key} checked={cite.has(m.key)} onChange={() => flip(m.key)} className="mt-1 accent-[var(--phone)]" data-testid="cite" data-key={m.key} />
                    <span>{m.label}<span className="block text-[12px] muted">{m.positive ? "Shows" : "Checked, and the record holds"}: {m.says}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          {check && check.against.length > 0 && (
            <fieldset className="rounded-2xl border border-[var(--line)] p-3" data-testid="against">
              <legend className="flex items-center gap-1.5 px-1 label"><Scale size={13} aria-hidden />3 · Your own pins that argue against this</legend>
              <ul className="space-y-3 text-[13.5px]">
                {check.against.map((x) => (
                  <li key={x.key} data-testid="against-row" data-answered={x.answer ? "yes" : "no"}>
                    <p><b>{x.label}</b> <span className="muted">shows {x.says}.</span></p>
                    {x.options.length ? (
                      <select name={`answer:${x.key}`} className="input mt-1.5" value={answers[x.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [x.key]: e.target.value }))} data-testid="answer">
                        <option value="">Answer it with one of your pins…</option>
                        {x.options.map((o) => <option key={o.key} value={o.key}>{o.label} ({o.says})</option>)}
                      </select>
                    ) : <p className="mt-1 text-[12.5px] text-[var(--warn)]">None of your pins answers this. Find evidence that does, or choose another call.</p>}
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {check && (() => {
            // Pins against him are already asked about above; list only what else stands in the way.
            const rest = check.problems.filter((p) => !check.against.some((x) => p.startsWith(x.label)));
            const open = check.against.filter((x) => !x.answer).length;
            return rest.length + open > 0 ? (
              <ul className="space-y-1 rounded-xl bg-[var(--warn-tint)] px-3 py-2 text-[12.5px] text-[var(--warn)]" data-testid="call-problems">
                {rest.map((p) => <li key={p}>{p}</li>)}
                {open > 0 && <li>{open} pin{open === 1 ? "" : "s"} against this call still need{open === 1 ? "s" : ""} an answer.</li>}
              </ul>
            ) : null;
          })()}
          {check?.ready && <p className="text-[12.5px] text-[var(--good)]" data-testid="call-ok">Your pins support this call, and every pin against it is answered.</p>}
        </div>
      )}

      <label className="block"><span className="label">Reason</span>
        <select name="reason" className="input mt-1" defaultValue={reasons[0]} data-testid="t-reason">
          {reasons.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <input name="note" placeholder="Note (what you checked)" className="input" />
      {second && (
        <label className="block rounded-2xl bg-[var(--warn-tint)] px-3.5 py-3 text-[13px]">
          <b>This needs a second person.</b> It cuts off lines that look genuine, so a colleague must check it with you. Their name goes into the record.
          <select name="second" className="input mt-2" defaultValue="" data-testid="t-second">
            <option value="">Who checked it with you…</option>
            {peers.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      )}
      {ceirOffer && (
        <label className="flex items-start gap-3 rounded-2xl bg-[var(--phone-tint)] px-3.5 py-3 text-[13px]">
          <input type="checkbox" name="ceir" className="switch mt-0.5" data-testid="t-ceir" />
          <span><b>Also ask DoT for a national block</b> (CEIR), if you bar the handset. Telco-A&apos;s bar works only on its own network; CEIR blocks the handset on every network in India.</span>
        </label>
      )}
      {reportable && linked.length > 0 && (
        <label className="flex items-start gap-3 rounded-2xl bg-[var(--phone-tint)] px-3.5 py-3 text-[13px]">
          <input type="checkbox" name="report" defaultChecked className="switch mt-0.5" data-testid="t-report" />
          <span><b>Report to DoT</b> (through DIP). These phones were activated through the same retailer the same week and sit on mule accounts:
            <span className="mt-1 block mono text-[12px]">{linked.map((l) => `${l.msisdn} (${l.name}, now ${l.band})`).join(" · ")}</span>
            <span className="mt-1 block muted">DoT can raise their fraud-risk rating to High. Banks see only that rating.</span>
          </span>
        </label>
      )}
    </ActForm>
  );
}
