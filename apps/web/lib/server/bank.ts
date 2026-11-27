/** Bharat Demo Bank's own records, as an officer looks them up: a payment by its UTR, an account's statement for
 *  a window, and the account's KYC card. Nothing here marks money as the victims': she works that out herself. */
import { W, model, holderName, exitLabel, type WTxn } from "./world";

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;
const istDay = (d: string) => Date.parse(`${d}T00:00:00Z`) - IST;
const acctById = new Map(W.accounts.map((a) => [a.id, a]));
const victimById = new Map(W.victims.map((v) => [v.id, v]));
const complaintByTxn = new Map(W.complaints.map((c) => [c.txnId, c]));

export interface StatementRow {
  id: string; at: number; dir: "in" | "out"; amount: number; balance: number; channel: string;
  other: string; otherName: string; ours: boolean; narration: string; where?: string; exit: boolean;
}

/** Who is on the other side of a row, as the statement shows it. */
function party(id: string): { name: string; ours: boolean; exit: boolean } {
  const a = acctById.get(id);
  if (a) return { name: holderName(a), ours: true, exit: false };
  if (id.startsWith("EXT-R")) { const v = victimById.get(id.slice(4)); return { name: v ? `${v.name} (${v.bank})` : "Customer of another bank", ours: false, exit: false }; }
  if (id === "EXT-EMPLOYER") return { name: "Employer (salary)", ours: false, exit: false };
  if (id === "EXT-PENSION") return { name: "State pension office", ours: false, exit: false };
  if (id.startsWith("EXT-CUST") || id.startsWith("EXT-PEER")) return { name: "Customer, another bank", ours: false, exit: false };
  return { name: exitLabel(id), ours: false, exit: ["EXT-ATM", "EXT-CRYPTO", "EXT-GOLD"].includes(id) };
}

function narration(t: WTxn & { where?: string }, dir: "in" | "out", other: string, name: string): string {
  const ref = t.id.slice(-6);
  if (t.channel === "ATM_CASH") return `ATM WDL ${t.where ?? ""} ${ref}`.trim();
  if (t.channel === "CRYPTO") return `CRYPTO/${t.where ?? "exchange"}/${ref}`;
  if (t.channel === "GOLD") return `POS/${t.where ?? "gold dealer"}/${ref}`;
  if (t.channel === "CARD") return `POS/online merchant/${ref}`;
  return `${t.channel}/${dir === "in" ? "CR" : "DR"}/${name.toUpperCase().slice(0, 22)}${acctById.has(other) ? `/${other}` : ""}/${ref}`;
}

/** A payment by its UTR (the transaction ID on the victim's complaint). */
export function payment(q: string) {
  const id = q.trim().toUpperCase();
  const t = W.txns.find((x) => x.id === id);
  if (!t) return { found: false as const, note: "No payment with this UTR. UTRs look like TP0002624." };
  const c = complaintByTxn.get(t.id);
  const v = c ? victimById.get(c.victim) : undefined;
  const to = acctById.get(t.to);
  return {
    found: true as const, id: t.id, at: t.at, amount: t.amount, channel: t.channel, to: t.to, toName: to ? holderName(to) : party(t.to).name,
    from: v ? `${v.name} (${v.bank})` : party(t.from).name, complaint: c ? { id: c.id, ack: c.ack, reportedAt: c.reportedAt } : null,
    note: c ? `Reported by the payer on NCRP (ack ${c.ack}).` : "Not on any complaint.",
  };
}

/** One account's statement for a window (IST days, both inclusive). Opening balance is worked out for the window. */
export function statement(acct: string, from: string | null, to: string | null) {
  const a = acctById.get(acct.trim().toUpperCase());
  if (!a) return { found: false as const, note: "Not an account at Bharat Demo Bank. Account IDs look like P00157." };
  const lo = from ? istDay(from) : -Infinity, hi = to ? istDay(to) + DAY - 1 : Infinity;
  let bal = a.opening, opening = a.opening;
  const rows: StatementRow[] = [];
  for (const t of W.txns as (WTxn & { where?: string })[]) {
    if (t.from !== a.id && t.to !== a.id) continue;
    const dir: "in" | "out" = t.to === a.id ? "in" : "out";
    bal += dir === "in" ? t.amount : -t.amount;
    if (t.at < lo) { opening = bal; continue; }
    if (t.at > hi) break;
    const other = dir === "in" ? t.from : t.to;
    const p = party(other);
    rows.push({ id: t.id, at: t.at, dir, amount: t.amount, balance: bal, channel: t.channel, other, otherName: p.name, ours: p.ours, exit: p.exit,
      narration: narration(t, dir, other, p.name), ...(t.where ? { where: t.where } : {}) });
  }
  return { found: true as const, id: a.id, name: holderName(a), opening, closing: rows.length ? rows[rows.length - 1]!.balance : opening, total: rows.length, rows: rows.slice(0, 250) };
}

/** The account's KYC card: what the bank knows about the holder, the phone, and the police request on it. */
export function kyc(acct: string) {
  const a = acctById.get(acct.trim().toUpperCase());
  if (!a) return { found: false as const, note: "Not an account at Bharat Demo Bank." };
  const v = model().accounts.get(a.id)!;
  const r = v.request;
  const before = (a as typeof a & { before?: { kind: string; text: string; monthly?: number } }).before ?? null;
  return {
    found: true as const, id: a.id, name: holderName(a), type: a.type, group: a.holder.group, city: `${a.holder.city}, ${a.holder.state}`,
    openedAt: a.openedAt, kycChangedAt: a.kycChangedAt, phone: a.phone, before,
    request: { id: r.id, issuer: `${r.issuer.rank} ${r.issuer.name}, ${r.issuer.station} (${r.issuer.state})`, asked: r.asksWholeAccount ? "the whole account" : r.amountRequested ?? 0,
      signed: r.signed, receivedAt: r.receivedAt, magistrate: r.magistrateIntimatedAt },
  };
}
export type PaymentResult = ReturnType<typeof payment>;
export type StatementResult = ReturnType<typeof statement>;
export type KycResult = ReturnType<typeof kyc>;
