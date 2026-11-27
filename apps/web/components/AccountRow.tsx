/** One account on the case board: a one-line status that opens to what the police asked, what Scalpel suggests, and why. */
import type { AccountView } from "@/lib/server/world";
import type { Desk } from "@/lib/server/desk";
import { holderName } from "@/lib/server/world";
import { inr } from "@/lib/format";
import { userById } from "@/lib/users";
import { Check, ChevronDown, TriangleAlert, X } from "lucide-react";
import { CHOICE_LABEL } from "@/lib/server/judge";

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

export function AccountRow({ v, desk }: { v: AccountView; desk: Desk }) {
  const held = desk.holdByAccount.get(v.a.id);
  const pending = desk.pendingByAccount.get(v.a.id);
  const dec = desk.decisionByAccount.get(v.a.id);
  const back = desk.returned.get(v.a.id);
  const s = suggestion(v);
  const score = v.a.score?.muleScore;
  const ph = v.phone;
  const phoneSigns = ph ? [ph.swappedAt && desk.now - ph.swappedAt < 72 * 3_600_000 && "SIM swapped in last 3 days", ph.forwarding && "call forwarding on", ph.simboxRoute && "number used on a SIM-box route", ph.fri === "VERY_HIGH" && "DoT fraud-risk very high", ph.mnrl && "on revoked list"].filter(Boolean) as string[] : [];
  const badge = (k: "allowed" | "sized" | "timed", label: string) => {
    const st = v.gate.badgeStates[k];
    return <span className={`chip ${st === "pass" ? "chip-good" : st === "caution" ? "chip-warn" : "chip-bad"}`} title={v.gate.badgeReasons[k].join(" ")}>{st === "pass" ? <Check size={13} strokeWidth={2.4} aria-hidden /> : st === "caution" ? <TriangleAlert size={12} strokeWidth={2.2} aria-hidden /> : <X size={13} strokeWidth={2.4} aria-hidden />} {label}</span>;
  };
  const status = held ? <span className="chip chip-blue" data-testid="held-chip">Held {inr(held.hold.amount)}</span>
    : pending ? <span className="chip chip-warn" data-testid="pending-chip">Waiting approval</span>
    : back && !dec ? <span className="chip chip-warn">Sent back to Priya</span>
    : dec ? <span className={`chip ${dec.agreed ? "chip-good" : "chip-warn"}`} data-testid="decided-chip">{CHOICE_LABEL[dec.choice]}</span>
    : <span className="chip chip-grey">Not decided</span>;
  return (
    <details id={`acct-${v.a.id}`} className={`board-row scroll-mt-24 ${held ? "board-row-held" : ""}`} data-testid="account-row" data-account={v.a.id}>
      <summary className="board-grid">
        <span className="min-w-0">
          <span className="flex items-center gap-2"><span className="truncate font-semibold">{holderName(v.a)}</span>{v.role === "mule" && <span className="dot-bad" title="Likely mule" />}</span>
          <span className="block text-[12.5px] muted"><span className="mono">{v.a.id}</span> · {TYPE[v.a.type] ?? v.a.type}, {v.a.holder.city}</span>
        </span>
        <span className="num text-[13.5px] muted">{v.hop ?? "?"}</span>
        <span className="num text-[13.5px]">{score === undefined ? <span className="muted">none</span> : <ScoreBar value={score} />}</span>
        <span className="money text-right text-[14.5px] text-[var(--accent-ink)]">{inr(v.traced)}</span>
        <span className="text-right">{status}</span>
        <ChevronDown size={16} className="board-caret justify-self-end text-[var(--muted)]" aria-hidden />
      </summary>
      <div className="grid gap-4 px-4 pb-4 pt-1 text-[13.5px] md:grid-cols-[1fr_300px]">
        <div className="space-y-2">
          <p className={s.tone === "blue" ? "" : s.tone === "warn" ? "text-[var(--warn)]" : "text-[var(--bad)]"} data-testid="suggestion"><span className="font-semibold">Scalpel suggests: </span>{s.text}</p>
          <div className="flex flex-wrap gap-1.5">{badge("allowed", "Allowed")}{badge("sized", "Right amount")}{badge("timed", "Has deadlines")}</div>
          {v.a.score && <p><span className="muted">Mule score {Math.round(score! * 100)}/100 because: </span><span data-testid="reasons">{v.a.score.reasons.join(" · ")}</span></p>}
          {ph && <p className="muted">Phone <span className="mono">{ph.msisdn}</span>{phoneSigns.length > 0 && <span className="text-[var(--phone)]"> · {phoneSigns.join(", ")}</span>}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 self-start">
          <div><dt className="label">Balance</dt><dd className="money">{inr(v.balance)}</dd></div>
          <div><dt className="label">Police asked</dt><dd className="money">{"amount" in v.asked ? inr(v.asked.amount) : "Whole account"}</dd></div>
          {held && <div className="col-span-2"><dt className="label">Hold</dt><dd>{held.ref}, approved by {userById(held.approvedBy)?.name ?? held.approvedBy}; holder told</dd></div>}
          {dec && <div className="col-span-2"><dt className="label">Decision</dt><dd>{userById(dec.by)?.name}: {CHOICE_LABEL[dec.choice]} ({dec.agreed ? "agreed with AI" : "overruled AI"}). {dec.reason}</dd></div>}
        </dl>
      </div>
    </details>
  );
}

function ScoreBar({ value }: { value: number }) {
  const pc = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--line)]"><span className="block h-full rounded-full" style={{ width: `${pc}%`, background: value >= 0.5 ? "var(--bad)" : "var(--good)" }} /></span>
      <span>{pc}</span>
    </span>
  );
}
