/**
 * What the supervisor checks before approving a hold: only the evidence for this one account, pinpointed.
 * The money path is cut from the officer's own saved trail; the statement rows are the ones she pinned; the
 * spot-check picks one pinned payment and keeps the answer on the server, so he has to work it out himself.
 */
import { createHash } from "node:crypto";
import { model, holderName, W } from "./world";
import { statement } from "./bank";
import type { Desk } from "./desk";

export const REVIEW_CHECKS = ["path", "amount", "police", "impact"] as const;
export type ReviewCheck = (typeof REVIEW_CHECKS)[number];
export const SEND_BACK_CODES = [
  "Trail doesn't reach this account", "Amount doesn't match the trail", "Police request not usable yet",
  "Holder needs a carve-out (pension or salary)", "Looks innocent: don't hold", "Other",
] as const;

export interface ReviewStep { id: string; at: number; from: string; to: string; amount: number; kind: "payment" | "move" }
export interface ReviewRow { id: string; at: number; dir: "in" | "out"; amount: number; balance: number; other: string; narration: string; mark: "victim" | "out" | null }
export interface HoldReview {
  trailVersion: number | null; path: ReviewStep[]; rows: ReviewRow[]; opening: number;
  spot: { txn: string; at: number; amount: number; balanceBefore: number; victimBefore: number } | null;
  police: { id: string; issuer: string; signed: boolean; magistrate: number | null; asked: string; receivedAt: number; rules: string[] };
  impact: { balance: number; hold: number; left: number; before: string | null; monthly: number | null };
  sum: { traced: number; hold: number; asked: number | null };
  flags: string[];
}

const txById = new Map(W.txns.map((t) => [t.id, t]));
const caseShare = (caseId: string) => {
  const c = model().cases.find((x) => x.id === caseId);
  const vs = new Set(c?.complaints.map((x) => x.victim) ?? []);
  return (taint: Record<string, number>) => Object.entries(taint).reduce((s, [k, p]) => s + (vs.has(k) ? p : 0), 0);
};

/** One pinned payment out of the account, chosen by the proposal's id (same every time, unknown in advance). */
export function spotOf(pid: string, account: string, caseId: string, pinned: Set<string>, salt = "") {
  const m = model();
  const share = caseShare(caseId);
  const cands = [...m.trace.flows, ...m.trace.exits].filter((f) => f.from === account && pinned.has(f.txnId) && share(f.taint) >= 100_00);
  if (!cands.length) return null;
  const k = parseInt(createHash("sha256").update(pid + salt).digest("hex").slice(0, 8), 16) % cands.length;
  const f = cands.sort((a, b) => a.txnId.localeCompare(b.txnId))[k]!;
  return { f, expected: Math.round(share(f.taint)) };
}

export function holdReview(d: Desk, pid: string): HoldReview | null {
  const p = d.proposals.find((x) => x.pid === pid);
  if (!p || p.kind !== "HOLD") return null;
  const m = model();
  const v = m.accounts.get(p.account)!;
  const dec = d.decisions.find((x) => x.pid === pid);
  const tr = d.trails.get(p.caseId);
  const pins = new Set((tr?.pins ?? []).map((x) => x.ref));

  // The money path: walk back from this account over her pinned payments, biggest first, to a victim's payment.
  const path: ReviewStep[] = [];
  let cur = p.account;
  const seen = new Set<string>();
  for (let i = 0; i < 8 && !seen.has(cur); i++) {
    seen.add(cur);
    const ins = (tr?.pins ?? []).filter((x) => x.kind === "payment" || x.kind === "move").map((x) => txById.get(x.ref)).filter((t) => t && t.to === cur).sort((a, b) => b!.amount - a!.amount);
    const t = ins[0];
    if (!t) break;
    const isPay = !m.accounts.has(t.from);
    const vic = isPay ? W.victims.find((x) => `EXT-${x.id}` === t.from) : undefined;
    path.unshift({ id: t.id, at: t.at, from: isPay ? (vic ? `${vic.name} (victim)` : "Victim") : holderName(m.accounts.get(t.from)!.a), to: holderName(m.accounts.get(t.to)!.a), amount: t.amount, kind: isPay ? "payment" : "move" });
    if (isPay) break;
    cur = t.from;
  }
  const reachesVictim = path.length > 0 && path[0]!.kind === "payment";

  // Her pinned rows on this account's statement, plus the credits on the path.
  const st = statement(p.account, null, null);
  const pathIds = new Set(path.map((x) => x.id));
  const rows: ReviewRow[] = st.found ? st.rows.filter((r) => pins.has(r.id) || pathIds.has(r.id)).slice(0, 40).map((r) => ({
    id: r.id, at: r.at, dir: r.dir, amount: r.amount, balance: r.balance, other: r.otherName, narration: r.narration,
    mark: r.dir === "in" ? "victim" : "out",
  })) : [];

  const sp = spotOf(pid, p.account, p.caseId, pins);
  let spot: HoldReview["spot"] = null;
  if (sp) {
    const t = txById.get(sp.f.txnId)!;
    const row = st.found ? st.rows.find((r) => r.id === t.id) : undefined;
    const balanceBefore = row ? row.balance + row.amount : t.amount;
    spot = { txn: t.id, at: t.at, amount: t.amount, balanceBefore, victimBefore: Math.round((sp.expected * balanceBefore) / t.amount) };
  }

  const r = v.request;
  const failed = v.gate.checks.filter((c) => !c.ok).map((c) => c.note);
  const before = (v.a as typeof v.a & { before?: { text: string; monthly?: number } }).before ?? null;
  const flags: string[] = [];
  if (p.amount > v.traced + 100) flags.push(`The hold (${fmt(p.amount)}) is more than the victims' money here (${fmt(v.traced)}).`);
  if (!tr) flags.push("No saved money trail for this case.");
  else if (!reachesVictim) flags.push("Gap: the officer's pins don't connect this account back to a victim's payment.");
  if (tr && reachesVictim && !rows.some((x) => x.dir === "out")) flags.push("The officer pinned no payment out of this account, so how much is still here rests on the rules engine's trace alone.");
  if (dec?.note === "Accepted with the clear group") flags.push("Accepted in a bulk group, not decided on its own.");
  if (!r.signed) flags.push("The police request is not signed.");
  if (!r.magistrateIntimatedAt) flags.push("The magistrate has not been told yet.");
  if (dec && !dec.agreed) flags.push("The officer went against the AI.");
  if (dec?.ai.clash) flags.push(`Evidence clashes: ${dec.ai.clash}`);
  if (before?.monthly) flags.push(`Regular ${before.text.toLowerCase().includes("pension") ? "pension" : "income"} into this account: check what the hold leaves.`);
  return {
    trailVersion: dec?.trail?.version ?? tr?.version ?? null, path, rows, opening: st.found ? st.opening : 0, spot,
    police: { id: r.id, issuer: `${r.issuer.rank} ${r.issuer.name}, ${r.issuer.station} (${r.issuer.state})`, signed: r.signed, magistrate: r.magistrateIntimatedAt ?? null,
      asked: r.asksWholeAccount ? "the whole account" : fmt(r.amountRequested ?? 0), receivedAt: r.receivedAt, rules: failed },
    impact: { balance: v.balance, hold: p.amount, left: Math.max(0, v.balance - p.amount), before: before?.text ?? null, monthly: before?.monthly ?? null },
    sum: { traced: v.traced, hold: p.amount, asked: r.asksWholeAccount ? null : r.amountRequested ?? null },
    flags,
  };
}

/** The spot-check's answer, kept on the server. */
export function spotAnswer(d: Desk, pid: string): number | null {
  const p = d.proposals.find((x) => x.pid === pid);
  if (!p) return null;
  const pins = new Set((d.trails.get(p.caseId)?.pins ?? []).map((x) => x.ref));
  return spotOf(pid, p.account, p.caseId, pins)?.expected ?? null;
}

function fmt(p: number) {
  const r = Math.round(p / 100), s = String(r), l = s.slice(-3), rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${rest ? `${rest},${l}` : l}`;
}
