"use client";
/** One account, the AI's suggestion and why, and the person's call. The call is recorded with its reason;
 *  overruling a confident AI goes to the supervisor. */
import { useState } from "react";
import type { AiView, Choice } from "@/lib/server/judge";
import { ActForm } from "./ActForm";
import { WhyBars } from "./WhyBars";
import { decideAccountAction } from "@/app/actions";
import { inr } from "@/lib/format";

const REASONS = ["Evidence matches the suggestion", "Long-standing account with normal history", "Looks like account takeover (SIM swap), not a mule", "Police request can't be used as it is", "Score unclear: hold now, check more", "Phone risk rating disagrees", "Other"];
const LABEL: Record<Choice, string> = { HOLD: "Hold the victims' money", NO_HOLD: "Don't hold, keep watching", SEND_BACK: "Send request back to police" };

export interface CardAccount { id: string; name: string; sub: string; traced: number; balance: number; asked: string; score: number | null; age: string; phone?: string }

export function DecisionCard({ acct, ai, returned, step }: { acct: CardAccount; ai: AiView; returned?: { by: string; note: string } | null; step?: string }) {
  const [choice, setChoice] = useState<Choice>(ai.suggest);
  const [why, setWhy] = useState(false);
  const overrule = choice !== ai.suggest;
  const options: Choice[] = ai.suggest === "SEND_BACK" ? ["SEND_BACK", "NO_HOLD"] : ["HOLD", "NO_HOLD"];
  return (
    <div className="card p-5 page-enter" data-testid="decision-card" data-account={acct.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {step && <p className="label text-[var(--accent-ink)]">{step}</p>}
          <h3 className="mt-0.5 text-[20px]">{acct.name}</h3>
          <p className="text-[12.5px] muted"><span className="mono">{acct.id}</span> · {acct.sub} · opened {acct.age}{acct.phone ? <> · phone <span className="mono">{acct.phone}</span></> : null}</p>
        </div>
        <dl className="flex gap-5 text-right">
          <div><dt className="text-[11.5px] muted">Victims&apos; money here</dt><dd className="money text-[17px] text-[var(--accent)]">{inr(acct.traced)}</dd></div>
          <div><dt className="text-[11.5px] muted">Balance</dt><dd className="money text-[17px]">{inr(acct.balance)}</dd></div>
          <div><dt className="text-[11.5px] muted">Police asked</dt><dd className="money text-[17px]">{acct.asked}</dd></div>
        </dl>
      </div>

      {returned && <p className="mt-3 rounded-xl border border-[#f3d29b] bg-[var(--warn-tint)] p-3 text-[13.5px] text-[var(--warn)]" data-testid="returned-note">Sent back by {returned.by}: &ldquo;{returned.note}&rdquo;. Please decide again.</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="panel self-start p-4">
          <h4 className="text-[13px] font-semibold">Scalpel suggests</h4>
          <p className="mt-1 text-[15px] font-semibold">{ai.headline}</p>
          <div className="mt-2 flex items-center gap-2 text-[12.5px]">
            <span className="muted">How sure</span>
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--line)]"><span className="bar-grow block h-full rounded-full bg-[var(--accent)]" style={{ width: `${ai.confidence * 100}%` }} /></span>
            <span className="mono">{Math.round(ai.confidence * 100)}%</span>
          </div>
          {ai.rules.length > 0 && <ul className="mt-2 list-disc pl-5 text-[13px] text-[var(--warn)]">{ai.rules.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>}
          {ai.update && <p className="mt-3 rounded-lg bg-[var(--phone-tint)] p-2.5 text-[13px] text-[var(--phone)]" data-testid="fri-update">{ai.update}</p>}
          {ai.clash && <p className="mt-3 rounded-lg bg-[var(--warn-tint)] p-2.5 text-[13px] text-[var(--warn)]" data-testid="clash"><b>Evidence clashes: </b>{ai.clash}</p>}
          <button type="button" className="btn btn-sm mt-3" onClick={() => setWhy((x) => !x)} aria-expanded={why} data-testid="why-toggle">{why ? "Hide why" : "Why?"}</button>
          {why && <div className="mt-3"><WhyBars why={ai.why} /></div>}
        </div>

        <ActForm action={decideAccountAction} hidden={{ account: acct.id }} label="Record my decision" testid={`decide-${acct.id}`} className="space-y-3">
          <h4 className="text-[13px] font-semibold">Your call</h4>
          <div className="grid gap-2">
            {options.map((c) => (
              <label key={c} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[14px] transition-all duration-300 ${choice === c ? "glass border-[var(--accent)]" : "border-white/70 bg-white/40 hover:bg-white/70"}`}>
                <input type="radio" name="choice" value={c} checked={choice === c} onChange={() => setChoice(c)} className="accent-[var(--accent)]" />
                <span className="font-medium">{LABEL[c]}{c === "HOLD" && ai.amount > 0 ? ` (${inr(ai.amount)})` : ""}</span>
                {c === ai.suggest && <span className="chip chip-blue ml-auto">AI&apos;s pick</span>}
              </label>
            ))}
          </div>
          <label className="block text-[13px] font-medium">Reason
            <select name="reason" key={choice} defaultValue={overrule ? "" : REASONS[choice === "SEND_BACK" ? 3 : 0]} className="input mt-1" required>
              <option value="" disabled>Pick a reason</option>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="block text-[13px] font-medium">Note (optional)
            <input name="note" className="input mt-1" placeholder={choice === "SEND_BACK" ? "What must the police fix?" : "Anything the supervisor should know"} />
          </label>
          {overrule && ai.confidence >= 0.8 && <p className="text-[12.5px] text-[var(--warn)]" data-testid="needs-signoff">You are overruling a confident AI ({Math.round(ai.confidence * 100)}%). The supervisor will check this.</p>}
        </ActForm>
      </div>
    </div>
  );
}
