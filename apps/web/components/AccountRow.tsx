/** One account on a case: how much victim money is still in it, what the police asked, what Scalpel suggests, and why. */
import type { AccountView } from "@/lib/server/world";
import type { Desk } from "@/lib/server/desk";
import { holderName } from "@/lib/server/world";
import { ActForm } from "./ActForm";
import { proposeHoldAction } from "@/app/actions";
import { inr } from "@/lib/format";
import { userById } from "@/lib/users";

const GROUP: Record<string, string> = { small_shop: "small shop", salaried: "salaried", gig_worker: "gig worker", student: "student", pensioner: "pensioner", homemaker: "homemaker", other: "customer" };
const TYPE: Record<string, string> = { SAVINGS: "Savings", CURRENT: "Current (business)", SALARY: "Salary" };

export function suggestion(v: AccountView): { text: string; tone: "blue" | "warn" | "bad"; canHold: boolean } {
  const g = v.gate;
  const askedAmt = "amount" in v.asked ? v.asked.amount : null;
  const asked = askedAmt === null ? "the whole account" : inr(askedAmt);
  if (g.decision === "ROUTE") {
    const note = g.checks.find((c) => c.rule === "R0" && !c.ok)?.note ?? "The request can't be used as it is.";
    return { text: `Send back to the police. ${note.replace(/Send the memo to the officer now\.?/, "").replace(/the memo goes back to the officer\.?/, "")}`.trim(), tone: "warn", canHold: false };
  }
  if (g.decision === "DENY") return { text: g.checks.filter((c) => !c.ok).map((c) => c.note).join(" "), tone: "bad", canHold: false };
  const fallback = g.flags.includes("Bank-initiated fallback hold");
  const base = v.suggested < (askedAmt ?? Infinity)
    ? `Hold ${inr(v.suggested)}, not ${asked}: that is the victims' money still here.`
    : `Hold ${inr(v.suggested)} as asked.`;
  return { text: fallback ? `${base} Police alone can't freeze here, so the bank holds it under its own (draft RBI) power.` : base, tone: "blue", canHold: v.suggested > 0 };
}

export function AccountRow({ v, desk, canPropose }: { v: AccountView; desk: Desk; canPropose: boolean }) {
  const held = desk.holdByAccount.get(v.a.id);
  const pending = desk.pendingByAccount.get(v.a.id);
  const s = suggestion(v);
  const score = v.a.score?.muleScore;
  const ph = v.phone;
  const phoneSigns = ph ? [ph.swappedAt && desk.now - ph.swappedAt < 72 * 3_600_000 && "SIM swapped in last 3 days", ph.forwarding && "call forwarding on", ph.simboxRoute && "number used on a SIM-box route", ph.fri === "VERY_HIGH" && "DoT fraud-risk very high", ph.mnrl && "on revoked list"].filter(Boolean) as string[] : [];
  const badge = (k: "allowed" | "sized" | "timed", label: string) => {
    const st = v.gate.badgeStates[k];
    return <span className={`chip ${st === "pass" ? "chip-good" : st === "caution" ? "chip-warn" : "chip-bad"}`} title={v.gate.badgeReasons[k].join(" ")}>{st === "pass" ? "✓" : st === "caution" ? "!" : "✗"} {label}</span>;
  };
  return (
    <div id={`acct-${v.a.id}`} className={`card scroll-mt-24 p-4 ${held ? "border-[var(--accent)]" : ""}`} data-testid="account-row" data-account={v.a.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{holderName(v.a)}</span>
            {v.role === "mule" ? <span className="chip chip-bad">Likely mule</span> : v.role === "shield" ? <span className="chip chip-good">Likely innocent</span> : <span className="chip chip-grey">Unclear</span>}
            <span className="text-[12px] muted">Layer {v.hop ?? "?"}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] muted">{TYPE[v.a.type] ?? v.a.type} · <span className="mono">{v.a.id}</span> · {v.a.holder.business ? `${v.a.holder.name}, ` : ""}{GROUP[v.a.holder.group] ?? "customer"}, {v.a.holder.city}</p>
        </div>
        <dl className="flex gap-5 text-right">
          <div><dt className="text-[11.5px] muted">Victims' money here</dt><dd className="money text-[17px] text-[var(--accent)]">{inr(v.traced)}</dd></div>
          <div><dt className="text-[11.5px] muted">Balance</dt><dd className="money text-[17px]">{inr(v.balance)}</dd></div>
          <div><dt className="text-[11.5px] muted">Police asked</dt><dd className="money text-[17px]">{"amount" in v.asked ? inr(v.asked.amount) : "Whole a/c"}</dd></div>
        </dl>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          <p className={`text-[14px] ${s.tone === "blue" ? "" : s.tone === "warn" ? "text-[var(--warn)]" : "text-[var(--bad)]"}`} data-testid="suggestion"><span className="font-semibold">Scalpel suggests: </span>{s.text}</p>
          <div className="flex flex-wrap gap-1.5">{badge("allowed", "Allowed")}{badge("sized", "Right amount")}{badge("timed", "Has deadlines")}</div>
          {v.a.score && (
            <div className="text-[13px]">
              <span className="muted">Mule score {score! >= 0.5 ? "high" : "low"} ({Math.round(score! * 100)}/100) because: </span>
              <span data-testid="reasons">{v.a.score.reasons.join(" · ")}</span>
            </div>
          )}
          {ph && <p className="text-[12.5px] muted">Phone <span className="mono">{ph.msisdn}</span>{phoneSigns.length > 0 && <span className="text-[var(--phone)]"> · {phoneSigns.join(", ")}</span>}</p>}
        </div>
        <div className="md:text-right">
          {desk.decisionByAccount.get(v.a.id) && !held && !pending ? (
            <p className={`chip ${desk.decisionByAccount.get(v.a.id)!.agreed ? "chip-good" : "chip-warn"}`} data-testid="decided-chip">Decided: {desk.decisionByAccount.get(v.a.id)!.choice === "HOLD" ? "hold" : desk.decisionByAccount.get(v.a.id)!.choice === "SEND_BACK" ? "sent back to police" : "no hold, watch"} · {desk.decisionByAccount.get(v.a.id)!.agreed ? "agreed with AI" : "overruled AI"}</p>
          ) : held ? (
            <div><p className="chip chip-blue" data-testid="held-chip">Held {inr(held.hold.amount)} · {held.ref}</p><p className="mt-1 text-[12px] muted">Approved by {userById(held.approvedBy)?.name ?? held.approvedBy}; holder told.</p></div>
          ) : pending ? (
            <p className="chip chip-warn" data-testid="pending-chip">Waiting for {pending.kind === "HOLD" ? "approval" : "release approval"}: {inr(pending.amount)}</p>
          ) : canPropose && s.canHold ? (
            <ActForm action={proposeHoldAction} hidden={{ account: v.a.id, note: `Police request ${v.request.id}` }} label="Propose hold" testid={`propose-${v.a.id}`} className="flex flex-wrap items-center gap-2 md:justify-end">
              <label className="sr-only" htmlFor={`amt-${v.a.id}`}>Amount in rupees</label>
              <input id={`amt-${v.a.id}`} name="amount" defaultValue={(v.suggested / 100).toFixed(2).replace(/\.00$/, "")} inputMode="decimal" className="input w-[130px] text-right money" />
            </ActForm>
          ) : null}
        </div>
      </div>
    </div>
  );
}
