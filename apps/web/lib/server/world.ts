/**
 * The fictional world (data/world.json, written by pipeline/scalpel_sim/product.py) turned into cases.
 * Everything here is worked out by the Scalpel engine from what the bank and Telco-A can see:
 * money tracing, linking complaints into cases, police-request checks and the rule checks (Gate).
 * Nothing in the file says who is really a mule.
 */
import raw from "@/data/world.json";
import {
  trace, linkCampaigns, priority, checkRequisition, evaluateGate, parsePolicy, parseOverlay, policyAt,
  type TraceResult, type PolicySet, type Overlay, type Requisition, type RequisitionResult, type GateResult, type Signal,
  type AccountType, type StateCode, type Action, type GateContext,
} from "@scalpel/engine";
import { POLICY_YAML, OVERLAY_YAML } from "@/lib/policies.generated";

export interface Holder { name: string; city: string; state: string; group: string; business?: string }
export interface WAccount {
  id: string; type: AccountType; openedAt: number; kycChangedAt: number | null; opening: number; holder: Holder; phone: string;
  score: { muleScore: number; reasons: string[] } | null; signals: Signal[];
}
export interface WTxn { id: string; at: number; from: string; to: string; amount: number; channel: string }
export interface WComplaint { id: string; ack: string; victim: string; txnId: string; reportedAt: number; story: string; scamType: string }
export interface WVictim { id: string; name: string; city: string; state: string; phone: string; telco: string; bank: string }
export interface WPhone { msisdn: string; imei: string; telco: string; account: string; swappedAt: number | null; forwarding: boolean; mnrl: boolean; fri: string; simboxRoute: boolean }
export interface WSim { msisdn: string; telco: string; activatedAt: number; kycName: string }
export interface WRig { id: string; kind: "simbox" | "handset"; imei: string; cell: string; state: string; sims: WSim[]; route: string | null; genuineLinesOnRoute: number }
export interface WSolo { msisdn: string; telco: string; imei: string; swappedAt: number }
export interface WCall { id: string; at: number; to: string; shownCaller: string; realSim: string; imei: string; seconds: number }
export interface WRequest extends Omit<Requisition, "linkedTxnIds" | "issuer" | "account" | "signedAt" | "magistrateIntimatedAt"> {
  issuer: { name: string; rank: Requisition["issuer"]["rank"]; station: string; state: string };
  account: { id: string; branchState: string };
  signedAt: number | null; magistrateIntimatedAt: number | null;
}
export interface WorldFile {
  now: number; bank: { name: string; code: string }; telco: { name: string };
  accounts: WAccount[]; txns: WTxn[]; complaints: WComplaint[]; victims: WVictim[]; requests: WRequest[];
  phones: WPhone[]; spoofedOwners: { msisdn: string; account: string; holder: Holder }[];
  protectedNumbers: { msisdn: string; owner: string }[]; rigs: WRig[]; soloSims: WSolo[]; calls: WCall[];
}

export const W = raw as unknown as WorldFile;
export const START = W.now;

export const POLICIES: PolicySet[] = POLICY_YAML.map(parsePolicy);
export const OVERLAYS: Overlay[] = OVERLAY_YAML.map(parseOverlay);
export const policyNow = (at: number) => policyAt(POLICIES.filter((p) => p.id.startsWith("scalpel")), at);

const EXIT_LABEL: Record<string, string> = { "EXT-ATM": "ATM cash", "EXT-CRYPTO": "Crypto exchange", "EXT-GOLD": "Gold dealer", "EXT-SETTLEMENT": "Shop's own settlement", "EXT-MERCHANT": "Online merchant", "EXT-OWNBANK": "Own account elsewhere", "EXT-RENT": "Rent", "EXT-FAMILY": "Family" };
export const exitLabel = (id: string) => EXIT_LABEL[id] ?? "Outside the bank";

export interface AccountView {
  a: WAccount;
  balance: number;        // today's balance
  traced: number;         // victim money still in the account (pro-rata trace)
  received: number;       // victim money that ever came in
  hop: number | null;
  victimShares: Record<string, number>;
  request: WRequest;
  req: RequisitionResult;
  role: "mule" | "shield" | "normal";
  asked: Action;          // what the police asked for
  gate: GateResult;       // the rule checks on what the police asked
  suggested: number;      // the hold Scalpel suggests (0 = none)
  phone?: WPhone;
}

export interface Edge { from: string; to: string; amount: number; exit: boolean }
export interface CaseView {
  id: string; title: string; scamType: string; complaints: WComplaint[]; victims: WVictim[];
  reported: number; firstAt: number; lastReportAt: number;
  accounts: string[];             // our accounts on the trail
  catchable: number;              // victim money still in our accounts
  movedOut: number;               // victim money already gone (cash, crypto, gold, other banks)
  minutesToCashOut: number;       // how fast the first accounts usually pass money on
  priority: number;
  edges: Edge[];                  // money trail for this case's victims only
  rigs: string[];                 // calling rigs / SIMs behind this case's calls
  calls: WCall[];
  shownCallers: { msisdn: string; calls: number; spoofed: boolean; protected: boolean; owner?: string }[];
}

export interface Model {
  trace: TraceResult; accounts: Map<string, AccountView>; cases: CaseView[]; caseOfAccount: Map<string, string>;
  victimById: Map<string, WVictim>; complaintByVictim: Map<string, WComplaint>; phoneByNumber: Map<string, WPhone>;
  rigByImei: Map<string, WRig>; rigOfSim: Map<string, WRig>; soloByNumber: Map<string, WSolo>;
  casesOfRig: Map<string, string[]>; spoofed: Set<string>;
}

const digits = (n: string) => n.replace(/\D/g, "");
export const isProtectedNumber = (n: string) => ["140", "1600", "1601"].some((p) => digits(n).replace(/^91(?=\d{10,})/, "").startsWith(p));

let cached: Model | null = null;

export function model(): Model {
  if (cached) return cached;
  const at = W.now;
  const policy = policyNow(at);
  const txById = new Map(W.txns.map((t) => [t.id, t]));
  const victimTxns = Object.fromEntries(W.complaints.map((c) => [c.txnId, c.victim]));
  const tr = trace({ opening: Object.fromEntries(W.accounts.map((a) => [a.id, a.opening])), txns: W.txns as never, victimTxns, asOf: at });

  // Calls: who really called (the network knows the real SIM), and which shown numbers were fake.
  const rigByImei = new Map(W.rigs.map((r) => [r.imei, r]));
  const rigOfSim = new Map(W.rigs.flatMap((r) => r.sims.map((s) => [s.msisdn, r] as const)));
  const soloByNumber = new Map(W.soloSims.map((s) => [s.msisdn, s]));
  const spoofed = new Set(W.calls.filter((c) => c.shownCaller !== c.realSim).map((c) => c.shownCaller));
  const victimById = new Map(W.victims.map((v) => [v.id, v]));
  const complaintByVictim = new Map(W.complaints.map((c) => [c.victim, c]));
  const callsTo = new Map<string, WCall[]>();
  for (const c of W.calls) callsTo.set(c.to, [...(callsTo.get(c.to) ?? []), c]);

  // Cases: complaints whose money went into the same account are one case (the engine's union-find). Two first
  // accounts are also joined when their victims' money met again in a likely-mule account further down (never a
  // shop: an innocent shop paid by two rings does not make them one case).
  const scoreOf = new Map(W.accounts.map((a) => [a.id, a.score?.muleScore ?? 0]));
  const firstOf = new Map(W.complaints.map((c) => [c.victim, txById.get(c.txnId)!.to]));
  const meet = new Map<string, Set<string>>();
  for (const f of tr.flows) {
    if ((scoreOf.get(f.to) ?? 0) < 0.5) continue;
    for (const [v, p] of Object.entries(f.taint)) if (p >= 1000_00) meet.set(f.to, (meet.get(f.to) ?? new Set()).add(firstOf.get(v)!));
  }
  const links: [string, string][] = [];
  for (const firsts of meet.values()) { const xs = [...firsts]; for (let i = 1; i < xs.length; i++) links.push([xs[0]!, xs[i]!]); }
  const camps = linkCampaigns(W.complaints.map((c) => ({ id: c.id, at: c.reportedAt, amount: txById.get(c.txnId)!.amount, firstReceiver: txById.get(c.txnId)!.to })), links);

  const accounts = new Map<string, AccountView>();
  const reqByAcct = new Map(W.requests.map((r) => [r.account.id, r]));
  const phoneByNumber = new Map(W.phones.map((p) => [p.msisdn, p]));
  const phoneOfAcct = new Map(W.phones.map((p) => [p.account, p]));
  const linked = new Map<string, string[]>();
  for (const f of tr.flows) if (Object.keys(f.taint).length) linked.set(f.to, [...(linked.get(f.to) ?? []), f.txnId]);
  for (const a of W.accounts) {
    const t = tr.accounts[a.id]!;
    const r = reqByAcct.get(a.id)!;
    const requisition: Requisition = {
      ...r, issuer: { ...r.issuer, state: r.issuer.state as StateCode }, account: { id: r.account.id, branchState: r.account.branchState as StateCode },
      signedAt: r.signedAt ?? undefined, magistrateIntimatedAt: r.magistrateIntimatedAt, linkedTxnIds: linked.get(a.id) ?? [],
    };
    const req = checkRequisition(requisition, policy, OVERLAYS, at);
    const s = a.score?.muleScore ?? null;
    const role: AccountView["role"] = s === null ? "normal" : s >= 0.5 ? "mule" : s < 0.2 ? "shield" : "normal";
    const victimLosses = Object.fromEntries(Object.keys(t.taint).map((v) => [v, tr.victimPaid[v] ?? 0]));
    const ctx: GateContext = {
      at, requester: "POLICE", requisition: req,
      account: { id: a.id, type: a.type, balance: Math.max(0, t.balance), traced: t.tainted },
      assessment: { role, muleScore: s ?? 0, signals: a.signals }, officerConfirmed: false, evidenceRecordId: r.id, victimLosses,
    };
    const asked: Action = r.asksWholeAccount ? { kind: "WHOLE_FREEZE", account: a.id } : { kind: "EXACT_HOLD", account: a.id, amount: r.amountRequested ?? 0 };
    const gate = evaluateGate(asked, ctx, policy);
    const suggested = gate.action?.kind === "EXACT_HOLD" ? gate.action.amount : gate.action?.kind === "WHOLE_FREEZE" ? Math.max(0, t.balance) : 0;
    accounts.set(a.id, {
      a, balance: Math.max(0, t.balance), traced: t.tainted, received: t.receivedTaint, hop: t.hop, victimShares: t.taint,
      request: r, req, role, asked, gate, suggested, phone: phoneOfAcct.get(a.id),
    });
  }

  const cases: CaseView[] = [];
  const caseOfAccount = new Map<string, string>();
  const casesOfRig = new Map<string, string[]>();
  camps.forEach((cp, i) => {
    const id = `CASE-${String(i + 1).padStart(3, "0")}`;
    const complaints = cp.complaintIds.map((cid) => W.complaints.find((c) => c.id === cid)!);
    const vset = new Set(complaints.map((c) => c.victim));
    const share = (taint: Record<string, number>) => Object.entries(taint).reduce((s, [v, p]) => s + (vset.has(v) ? p : 0), 0);
    const agg = new Map<string, Edge>();
    for (const c of complaints) {
      const t = txById.get(c.txnId)!;
      const k = `${c.victim}>${t.to}`;
      agg.set(k, { from: `V:${c.victim}`, to: t.to, amount: (agg.get(k)?.amount ?? 0) + t.amount, exit: false });
    }
    for (const f of tr.flows) {
      if (victimTxns[f.txnId] !== undefined) continue;
      const amt = share(f.taint);
      if (amt < 500_00) continue; // under Rs 500 of this case's money: noise in a picture
      const k = `${f.from}>${f.to}`;
      agg.set(k, { from: f.from, to: f.to, amount: (agg.get(k)?.amount ?? 0) + amt, exit: false });
    }
    let movedOut = 0;
    for (const x of tr.exits) {
      const amt = share(x.taint);
      if (amt <= 0) continue;
      movedOut += amt;
      if (amt < 500_00) continue;
      const k = `${x.from}>${x.to}`;
      agg.set(k, { from: x.from, to: x.to, amount: (agg.get(k)?.amount ?? 0) + amt, exit: true });
    }
    const edges = [...agg.values()];
    const accts = [...new Set(edges.flatMap((e) => [e.from, e.to]).filter((n) => accounts.has(n)))];
    const catchable = accts.reduce((s, a) => s + share(accounts.get(a)!.victimShares), 0);
    // Golden hour: median minutes the first accounts held money before passing it on.
    const dwell: number[] = [];
    for (const c of complaints) {
      const t = txById.get(c.txnId)!;
      const out = tr.flows.find((f) => f.from === t.to && f.at >= t.at) ?? tr.exits.find((x) => x.from === t.to && x.at >= t.at);
      if (out) dwell.push((out.at - t.at) / 60_000);
    }
    dwell.sort((a, b) => a - b);
    const minutesToCashOut = dwell.length ? Math.round(dwell[Math.floor(dwell.length / 2)]!) : 60;
    const calls = complaints.flatMap((c) => callsTo.get(victimById.get(c.victim)!.phone) ?? []).sort((a, b) => a.at - b.at);
    const rigs = [...new Set(calls.map((c) => rigByImei.get(c.imei)?.id ?? c.realSim))];
    for (const r of rigs) casesOfRig.set(r, [...(casesOfRig.get(r) ?? []), id]);
    const shown = new Map<string, number>();
    for (const c of calls) shown.set(c.shownCaller, (shown.get(c.shownCaller) ?? 0) + 1);
    const scamCount = new Map<string, number>();
    for (const c of complaints) scamCount.set(c.scamType, (scamCount.get(c.scamType) ?? 0) + 1);
    const scamType = [...scamCount.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    for (const a of accts) if (!caseOfAccount.has(a)) caseOfAccount.set(a, id);
    cases.push({
      id, title: `${scamType} · ${complaints.length} ${complaints.length === 1 ? "victim" : "victims"}`, scamType, complaints,
      victims: complaints.map((c) => victimById.get(c.victim)!), reported: cp.reported, firstAt: cp.firstAt,
      lastReportAt: Math.max(...complaints.map((c) => c.reportedAt)), accounts: accts, catchable, movedOut, minutesToCashOut,
      priority: priority(catchable, complaints.length, minutesToCashOut), edges, rigs, calls,
      shownCallers: [...shown.entries()].map(([msisdn, n]) => ({
        msisdn, calls: n, spoofed: spoofed.has(msisdn), protected: isProtectedNumber(msisdn),
        owner: W.spoofedOwners.find((o) => o.msisdn === msisdn)?.holder.name ?? W.protectedNumbers.find((p) => p.msisdn === msisdn)?.owner,
      })),
    });
  });
  cached = { trace: tr, accounts, cases, caseOfAccount, victimById, complaintByVictim, phoneByNumber, rigByImei, rigOfSim, soloByNumber, casesOfRig, spoofed };
  return cached;
}

export const caseById = (id: string) => model().cases.find((c) => c.id === id);
export const holderName = (a: WAccount) => a.holder.business ?? a.holder.name;
