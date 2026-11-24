/**
 * Tracing victim money through mixed accounts, in time order.
 *  - Default "rolling" (pro-rata): each debit takes victims' money and the holder's own money in proportion
 *    to the balance. This is the fair rule between innocent people whose money got mixed.
 *  - "by_role": a holder marked as a wrongdoer is presumed to spend his OWN money first (Re Hallett's Estate),
 *    so victim money stays in the account longer; everyone else is traced pro-rata.
 *  - Under every method a later clean credit never refills victim money: what is traced can never exceed the
 *    lowest balance the account fell to after the money arrived (lowest intermediate balance).
 *  - Money leaving the visible system (cash, other bank not visible, crypto, gold) is an "exit".
 * Who is a wrongdoer is never guessed here: the caller passes it from the case record (e.g. the police name the
 * holder as accused). The mule score is never used for it, so the model never sets a hold amount.
 */
import { type Paise, assertPaise, splitProportional, sum } from "./money";
import type { Instant } from "./time";

export type AccountId = string;
export type VictimId = string; // complaint / victim case id
export type Channel = "UPI" | "IMPS" | "NEFT" | "RTGS" | "ATM_CASH" | "POS" | "CARD" | "CRYPTO" | "GOLD" | "CHEQUE" | "OTHER";

export interface Txn {
  id: string;
  at: Instant;
  from: AccountId;
  to: AccountId;
  amount: Paise;
  channel?: Channel;
}

export type TraceMethod = "rolling" | "taint_first" | "clean_first" | "by_role";
export type HolderRole = "wrongdoer" | "innocent";

export interface TraceInput {
  /** Accounts the system can see, with balance at the start of the window. Anything else is outside. */
  opening: Record<AccountId, Paise>;
  txns: Txn[];
  /** Fraud payments: txn id -> victim id. These are the only source of taint. */
  victimTxns: Record<string, VictimId>;
  asOf?: Instant;
  method?: TraceMethod;
  /** Only for "by_role": holders the case record names as wrongdoers. Anyone not listed is treated as innocent. */
  roles?: Record<AccountId, HolderRole>;
}

export interface AccountTrace {
  balance: Paise;
  taint: Record<VictimId, Paise>;
  tainted: Paise;
  /** Number of tainted hops from the victim (1 = received directly from a victim). */
  hop: number | null;
  /** Total victim money that ever arrived here (the "disputed amount" a naive request would cite). */
  receivedTaint: Paise;
  receivedFromVictimsDirect: Paise;
}

export interface Flow { txnId: string; at: Instant; from: AccountId; to: AccountId; amount: Paise; taint: Record<VictimId, Paise>; channel?: Channel }
export interface Exit { txnId: string; at: Instant; from: AccountId; to: AccountId; channel?: Channel; taint: Record<VictimId, Paise> }

export interface TraceResult {
  method: TraceMethod;
  accounts: Record<AccountId, AccountTrace>;
  flows: Flow[];
  exits: Exit[];
  victimPaid: Record<VictimId, Paise>;
  warnings: string[];
}

const byTime = (a: Txn, b: Txn) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function allocate(method: Exclude<TraceMethod, "by_role">, amount: Paise, acct: AccountTrace, order: VictimId[]): Record<VictimId, Paise> {
  const tainted = acct.tainted;
  if (tainted === 0 || amount === 0) return {};
  if (method === "rolling") return splitProportional(amount, acct.taint, acct.balance);
  if (method === "taint_first") {
    const out: Record<VictimId, Paise> = {};
    let left = amount;
    for (const v of order) {
      const take = Math.min(left, acct.taint[v] ?? 0);
      if (take > 0) out[v] = take;
      left -= take;
      if (left === 0) break;
    }
    return out;
  }
  // clean_first: own money leaves first, the remainder comes from taint proportionally
  const clean = acct.balance - tainted;
  const fromTaint = Math.max(0, amount - clean);
  return fromTaint === 0 ? {} : splitProportional(fromTaint, acct.taint, tainted);
}

export function trace(input: TraceInput): TraceResult {
  const method = input.method ?? "rolling";
  const warnings: string[] = [];
  const accounts: Record<AccountId, AccountTrace> = {};
  const order: Record<AccountId, VictimId[]> = {};
  for (const [id, bal] of Object.entries(input.opening)) {
    assertPaise(bal, `opening ${id}`);
    accounts[id] = { balance: bal, taint: {}, tainted: 0, hop: null, receivedTaint: 0, receivedFromVictimsDirect: 0 };
    order[id] = [];
  }
  const flows: Flow[] = [];
  const exits: Exit[] = [];
  const victimPaid: Record<VictimId, Paise> = {};
  const txns = input.txns.filter((t) => input.asOf === undefined || t.at <= input.asOf).sort(byTime);
  const seen = new Set<string>();

  for (const t of txns) {
    if (seen.has(t.id)) { warnings.push(`duplicate txn ${t.id} ignored`); continue; }
    seen.add(t.id);
    assertPaise(t.amount, `txn ${t.id}`);
    if (t.from === t.to) { warnings.push(`self-transfer ${t.id} ignored`); continue; }
    const victim = input.victimTxns[t.id];
    let moved: Record<VictimId, Paise> = {};
    let fromHop = 0;

    const src = accounts[t.from];
    if (victim !== undefined) {
      moved = { [victim]: t.amount };
      victimPaid[victim] = (victimPaid[victim] ?? 0) + t.amount;
      if (src) { // victim account is itself visible: its balance drops, it holds no taint of its own victim
        if (src.balance < t.amount) { warnings.push(`balance gap on ${t.from} at ${t.id}: added ${t.amount - src.balance} unexplained clean money`); src.balance = t.amount; }
        src.balance -= t.amount;
      }
    } else if (src) {
      if (src.balance < t.amount) {
        // incomplete statement: treat the gap as unexplained clean money (never invent taint)
        warnings.push(`balance gap on ${t.from} at ${t.id}: added ${t.amount - src.balance} unexplained clean money`);
        src.balance = t.amount;
      }
      const m = method === "by_role" ? (input.roles?.[t.from] === "wrongdoer" ? "clean_first" : "rolling") : method;
      moved = Object.fromEntries(Object.entries(allocate(m, t.amount, src, order[t.from]!)).filter(([, p]) => p > 0));
      for (const [v, p] of Object.entries(moved)) {
        src.taint[v] = (src.taint[v] ?? 0) - p;
        if (src.taint[v] === 0) delete src.taint[v];
      }
      src.tainted -= sum(Object.values(moved));
      src.balance -= t.amount;
      fromHop = src.hop ?? 0;
    } // else: outside clean source (salary, customer, other bank) -> moved stays {}

    const dst = accounts[t.to];
    const movedTotal = sum(Object.values(moved));
    if (dst) {
      dst.balance += t.amount;
      for (const [v, p] of Object.entries(moved)) {
        if (!order[t.to]!.includes(v)) order[t.to]!.push(v);
        dst.taint[v] = (dst.taint[v] ?? 0) + p;
      }
      dst.tainted += movedTotal;
      dst.receivedTaint += movedTotal;
      if (victim !== undefined) dst.receivedFromVictimsDirect += t.amount;
      if (movedTotal > 0) {
        const h = victim !== undefined ? 1 : fromHop + 1;
        dst.hop = dst.hop === null ? h : Math.min(dst.hop, h);
      }
      flows.push({ txnId: t.id, at: t.at, from: t.from, to: t.to, amount: t.amount, taint: moved, channel: t.channel });
    } else if (movedTotal > 0) {
      exits.push({ txnId: t.id, at: t.at, from: t.from, to: t.to, channel: t.channel, taint: moved });
    }
  }
  return { method, accounts, flows, exits, victimPaid, warnings };
}

/** Comparator: what each approach would hold on one account. */
export function compareMethods(input: Omit<TraceInput, "method">, account: AccountId) {
  const r = Object.fromEntries((["rolling", "taint_first", "clean_first"] as const).map((m) => [m, trace({ ...input, method: m })]));
  const a = r.rolling!.accounts[account];
  if (!a) throw new RangeError(`unknown account ${account}`);
  return {
    whole_account: a.balance,
    disputed_amount: Math.min(a.receivedFromVictimsDirect, a.balance),
    taint_first: r.taint_first!.accounts[account]!.tainted,
    clean_first: r.clean_first!.accounts[account]!.tainted,
    rolling: a.tainted,
  };
}

/**
 * The two figures a hold memo shows for one account: traced pro-rata (holder innocent, the default) and traced
 * own-money-first (holder found to be a wrongdoer). The second is never smaller than the first.
 */
export function tracedByRole(input: Omit<TraceInput, "method" | "roles">, account: AccountId) {
  const pro = trace({ ...input, method: "rolling" }).accounts[account];
  const own = trace({ ...input, method: "by_role", roles: { [account]: "wrongdoer" } }).accounts[account];
  if (!pro || !own) throw new RangeError(`unknown account ${account}`);
  return { balance: pro.balance, proRata: pro.tainted, ownMoneyFirst: own.tainted };
}
