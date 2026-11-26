/**
 * Telco-A's side of the work: the alert queue, the signals behind each alert, and Telco-A's AI suggestion.
 *
 * The calls, SIM boxes, handsets and swapped SIMs come from the same fictional world as the bank's cases.
 * A few alerts are planted on purpose (a delivery company's call centre, a hospital's reminder line, a mule's
 * phone the police want kept live, a SIM-swap victim) because real fraud desks spend most of their judgement
 * on lookalikes like these. On those, the AI's scorecard points the wrong way and the analyst has to see why.
 *
 * Telco-A's AI is a signal scorecard (the way telecom fraud systems flag SIM boxes): it weighs network
 * counters and gives a suggestion with the counters that drove it. It does not read KYC paperwork, DLT
 * registrations or police letters: that is the analyst's job, and where the clash shows up.
 *
 * What leaves Telco-A: a report to DoT, which sets the Financial Fraud Risk Indicator that banks receive.
 * Call records never go to the bank; they go to police only, on a police request.
 */
import { W, model, type WCall } from "./world";
import { callRecords } from "./lookup";

export type TAction = "BAR_IMEI" | "BLOCK_ROUTE" | "DISCONNECT" | "REVERIFY" | "KEEP_LIVE" | "LABEL_SPAM" | "CLEAR_REPORT" | "GENUINE";

export const ACTION_LABEL: Record<TAction, string> = {
  BAR_IMEI: "Bar the handset (CEIR) and disconnect its SIMs",
  BLOCK_ROUTE: "Block the whole gateway route",
  DISCONNECT: "Disconnect the SIM and add it to the revoked list",
  REVERIFY: "Stop outgoing calls and re-verify the owner",
  KEEP_LIVE: "Keep the line live for police and watch it",
  LABEL_SPAM: "Label the number as spam for callers",
  CLEAR_REPORT: "Clear the spam reports: a genuine sender",
  GENUINE: "Mark as a genuine business, no block",
};

export const TREASONS = [
  "Signals match the suggestion",
  "Registered business traffic",
  "Genuine owner lost the SIM (swap)",
  "Police asked to keep it live",
  "Would cut off genuine customers",
  "Other",
] as const;

export interface Gauge { label: string; text: string; level: number; bad: boolean }
export interface TraceSim { msisdn: string; kycName: string; activatedAt: number; calls: number }
export interface TraceCall { id: string; at: number; to: string; toName: string | null; shown: string; shownKind: "own" | "spoofed" | "protected"; seconds: number; sim: string; scam: boolean; caseId: string | null; paidAt: number | null; paid: number | null }
export interface Linked { msisdn: string; account: string; name: string; caseId: string | null }
export interface Alert {
  id: string; kind: "IMEI" | "MSISDN"; value: string; title: string; sub: string; rule: string; tone: "fraud" | "lookalike";
  gauges: Gauge[]; ai: { suggest: TAction; confidence: number; drivers: string[] }; options: TAction[];
  facts: string[]; clash: string | null; cases: string[]; sims: TraceSim[]; calls: TraceCall[]; linked: Linked[]; reportable: boolean;
}

const DAY = 86_400_000;
const pct = (x: number) => (x > 0 && x < 0.01 ? "under 1%" : `${Math.round(x * 100)}%`);
/** Counters straight from Telco-A's call records, so the alert page and the workbench never disagree. */
/** "9 hours", "1 day", "3 days" from a fraction of days. */
const gap = (d: number) => { const h = Math.max(1, Math.round(d * 24)), n = Math.round(d); return d < 1 ? `${h} hour${h === 1 ? "" : "s"}` : `${n} day${n === 1 ? "" : "s"}`; };
const rec = (v: string) => callRecords(v, null, null).stats;
const g = (label: string, text: string, level: number, bad: boolean): Gauge => ({ label, text, level: Math.max(0.04, Math.min(1, level)), bad });

/** The scorecard. Each counter that looks like a SIM box or a fraud line adds weight; the top ones are the drivers. */
function score(s: { sims: number; inRatio: number; cells: number; distinctPerDay: number; avgSec: number; reports: number; swappedDays: number | null; forwarding: boolean; route: string | null }) {
  const hits: [number, string][] = [];
  if (s.sims > 5) hits.push([0.22, `${s.sims} SIMs used in one handset`]);
  if (s.inRatio < 0.12) hits.push([0.18, `almost no incoming calls (${pct(s.inRatio)})`]);
  if (s.cells === 1) hits.push([0.12, "never moves from one cell tower"]);
  if (s.distinctPerDay > 40) hits.push([0.12, `${s.distinctPerDay} different numbers called a day`]);
  if (s.reports >= 5) hits.push([0.2, `${s.reports} citizen spam reports (Chakshu)`]);
  if (s.swappedDays !== null && s.swappedDays < 7) hits.push([0.3, `SIM swapped ${gap(s.swappedDays)} before the calls`]);
  if (s.forwarding) hits.push([0.3, "call forwarding to an unknown number"]);
  const w = hits.reduce((a, [x]) => a + x, 0);
  const confidence = Math.min(0.97, 0.45 + w * 0.6);
  const drivers = hits.sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, t]) => t);
  return { confidence: Math.round(confidence * 100) / 100, drivers };
}

let cache: Alert[] | null = null;

export function alerts(): Alert[] {
  if (cache) return cache;
  const m = model();
  const victimByPhone = new Map([...m.victimById.values()].map((v) => [v.phone, v]));
  const complaintOf = (phone: string) => { const v = victimByPhone.get(phone); return v ? m.complaintByVictim.get(v.id) : undefined; };
  const caseOfComplaint = new Map(m.cases.flatMap((c) => c.complaints.map((k) => [k.id, c.id] as const)));
  const spoofed = new Set(W.spoofedOwners.map((s) => s.msisdn));
  const protectedNums = new Set(W.protectedNumbers.map((p) => p.msisdn));
  const traceCalls = (calls: WCall[]): TraceCall[] => calls.map((c): TraceCall => {
    const k = complaintOf(c.to);
    const t = k ? W.txns.find((x) => x.id === k.txnId) : undefined;
    return {
      id: c.id, at: c.at, to: c.to, toName: victimByPhone.get(c.to)?.name ?? null, shown: c.shownCaller,
      shownKind: protectedNums.has(c.shownCaller) ? "protected" : spoofed.has(c.shownCaller) ? "spoofed" : "own",
      seconds: c.seconds, sim: c.realSim, scam: Boolean(k), caseId: k ? caseOfComplaint.get(k.id) ?? null : null, paidAt: t?.at ?? null, paid: t?.amount ?? null,
    };
  }).sort((a, b) => a.at - b.at);
  const days = (calls: WCall[]) => Math.max(1, Math.round((Math.max(...calls.map((c) => c.at)) - Math.min(...calls.map((c) => c.at))) / DAY));
  // Mule accounts on the same cases whose phones were activated through the same retailer the week the box's SIMs were:
  // Telco-A can see that link; the bank can't. Reporting it lets DoT raise those phones' risk rating.
  const linkedFor = (cases: string[]): Linked[] => {
    const out: Linked[] = [];
    for (const cid of cases) {
      const c = m.cases.find((x) => x.id === cid)!;
      for (const a of c.accounts) {
        const v = m.accounts.get(a)!;
        if (v.role === "mule" && v.phone && v.phone.telco === "Telco-A" && v.phone.fri === "LOW" && (v.a.score?.muleScore ?? 0) >= 0.5) out.push({ msisdn: v.phone.msisdn, account: a, name: v.a.holder.name, caseId: cid });
      }
    }
    return out.filter((x, i) => out.findIndex((y) => y.msisdn === x.msisdn) === i).slice(0, 4);
  };

  const list: Alert[] = [];
  for (const r of W.rigs) {
    const calls = W.calls.filter((c) => c.imei === r.imei);
    const victims = new Set(calls.map((c) => c.to)).size;
    const avg = Math.round(calls.reduce((s, c) => s + c.seconds, 0) / Math.max(1, calls.length));
    // The counters are Telco-A's own records for the handset, the same ones the engineer reads in the workbench.
    const st = callRecords(r.imei, null, null).stats;
    const perDay = Math.round(st.perDay);
    const inRatio = st.inRatio;
    const activations = r.sims.map((s) => s.activatedAt);
    const spread = Math.max(1, Math.round((Math.max(...activations) - Math.min(...activations)) / DAY));
    const sc = score({ sims: r.sims.length, inRatio, cells: st.towers.length, distinctPerDay: perDay, avgSec: avg, reports: 0, swappedDays: null, forwarding: false, route: r.route });
    const cases = m.casesOfRig.get(r.id) ?? [];
    const suggest: TAction = r.route ? "BLOCK_ROUTE" : "BAR_IMEI";
    const clash = r.route && r.genuineLinesOnRoute > 0
      ? `${r.genuineLinesOnRoute} genuine business lines also use ${r.route}. Blocking the route cuts them off too; barring the handset stops the box alone.`
      : null;
    list.push({
      id: r.id, kind: "IMEI", value: r.imei, tone: "fraud",
      title: `${r.kind === "simbox" ? "SIM box" : "Handset"} with ${r.sims.length} SIMs`, sub: `IMEI ${r.imei} · cell ${r.cell}`,
      rule: r.kind === "simbox" ? "Bypass rule: many SIMs, one device, no incoming" : "Many SIMs rotating in one handset",
      gauges: [
        g("SIMs in this handset", `${r.sims.length}`, r.sims.length / 50, r.sims.length > 5),
        g("Incoming calls", pct(inRatio), inRatio * 4, inRatio < 0.12),
        g("Different numbers a day", `${perDay}`, perDay / 120, perDay > 40),
        g("Cell towers seen", `${st.towers.length}`, Math.min(1, st.towers.length / 8), st.towers.length <= 1),
        g("SIMs activated within", `${spread} days, one retailer`, 1 - spread / 60, spread < 30),
        g("Data and SMS use", "none", 0.05, true),
      ],
      ai: { suggest, confidence: sc.confidence, drivers: sc.drivers }, options: r.route ? ["BLOCK_ROUTE", "BAR_IMEI", "KEEP_LIVE"] : ["BAR_IMEI", "KEEP_LIVE"],
      facts: [`${calls.length} of its calls reached ${victims} people who later reported fraud, ${avg >= 120 ? `${Math.round(avg / 60)} min` : `${avg} s`} on average`, `Linked to bank cases ${cases.join(", ") || "none"}`, r.route ? `Calls leave through ${r.route}` : "No gateway route"],
      clash, cases, sims: r.sims.map((s) => ({ msisdn: s.msisdn, kycName: s.kycName, activatedAt: s.activatedAt, calls: calls.filter((c) => c.realSim === s.msisdn).length })),
      calls: traceCalls(calls), linked: linkedFor(cases), reportable: true,
    });
  }
  W.soloSims.forEach((s, i) => {
    const calls = W.calls.filter((c) => c.imei === s.imei);
    const first = Math.min(...calls.map((c) => c.at));
    const swappedDays = Math.max(0, (first - s.swappedAt) / DAY);
    const longOwner = i === 1; // planted: this number has had one owner for 9 years before the swap
    const st = rec(s.msisdn);
    const sc = score({ sims: 1, inRatio: st.inRatio, cells: st.towers.length, distinctPerDay: Math.round(st.perDay), avgSec: 0, reports: 0, swappedDays, forwarding: false, route: null });
    const cases = m.casesOfRig.get(s.msisdn) ?? [];
    list.push({
      id: `SIM-${i + 1}`, kind: "MSISDN", value: s.msisdn, tone: longOwner ? "lookalike" : "fraud",
      title: "One SIM, swapped just before the calls", sub: `${s.msisdn} · IMEI ${s.imei}`, rule: "SIM swap followed by calls to victims",
      gauges: [
        g("SIM swapped before calls", gap(swappedDays), 1 - swappedDays / 10, swappedDays < 7),
        g("Number owned for", longOwner ? "9 years" : "12 days", longOwner ? 0.95 : 0.05, !longOwner),
        g("Incoming calls", pct(st.inRatio), st.inRatio * 2, st.inRatio < 0.12),
        g("Cell towers seen", `${st.towers.length}`, Math.min(1, st.towers.length / 12), st.towers.length <= 1),
        g("Victims called", `${new Set(calls.map((c) => c.to)).size}`, calls.length / 50, true),
      ],
      ai: { suggest: "DISCONNECT", confidence: sc.confidence, drivers: sc.drivers }, options: ["DISCONNECT", "REVERIFY", "KEEP_LIVE"],
      facts: [`${calls.length} calls, showing ${calls.every((c) => c.shownCaller === s.msisdn) ? "its own number" : "other numbers"}`, `Linked to bank cases ${cases.join(", ") || "none"}`],
      clash: longOwner ? "The same person has owned this number for 9 years. The swap was made at a different retailer two days before the calls. This looks like the owner lost the SIM to the scammers: disconnecting punishes a victim." : null,
      cases, sims: [{ msisdn: s.msisdn, kycName: "(owner on record)", activatedAt: s.swappedAt, calls: calls.length }], calls: traceCalls(calls), linked: [], reportable: true,
    });
  });

  // Planted lookalikes and a mule's phone.
  const mulePhone = W.phones.find((p) => p.forwarding && p.fri === "LOW" && (m.accounts.get(p.account)?.a.score?.muleScore ?? 0) >= 0.9);
  if (mulePhone) {
    const v = m.accounts.get(mulePhone.account)!;
    const caseId = m.caseOfAccount.get(mulePhone.account) ?? null;
    const st = rec(mulePhone.msisdn);
    const sc = score({ sims: 1, inRatio: st.inRatio, cells: st.towers.length, distinctPerDay: Math.round(st.perDay), avgSec: 60, reports: 0, swappedDays: null, forwarding: true, route: null });
    list.push({
      id: "FWD-1", kind: "MSISDN", value: mulePhone.msisdn, tone: "fraud",
      title: "Bank-account phone forwarding its calls", sub: `${mulePhone.msisdn} · IMEI ${mulePhone.imei}`, rule: "Call forwarding on a number tied to a reported account",
      gauges: [
        g("Call forwarding", "on, to an unknown number", 0.9, true),
        g("OTP messages forwarded", "11 in 3 days", 0.7, true),
        g("Incoming calls", pct(st.inRatio), st.inRatio, st.inRatio < 0.12),
        g("Cell towers seen", `${st.towers.length}`, Math.min(1, st.towers.length / 12), st.towers.length <= 1),
      ],
      ai: { suggest: "DISCONNECT", confidence: sc.confidence, drivers: sc.drivers }, options: ["DISCONNECT", "KEEP_LIVE"],
      facts: [`Registered to the holder of account ${mulePhone.account} at Bharat Demo Bank`, caseId ? `That account is on ${caseId}` : "No bank case yet", "Police letter on file: keep the line live, the gang is being traced through it"],
      clash: "The investigating officer's letter asks Telco-A to keep this line live while they trace who it forwards to. Disconnecting now warns the gang.",
      cases: caseId ? [caseId] : [], sims: [], calls: [], linked: [{ msisdn: mulePhone.msisdn, account: mulePhone.account, name: v.a.holder.name, caseId }], reportable: true,
    });
  }
  const biz = rec("006120774318842"), spam = rec("+91 20 4477 0812");
  const bizDay = Math.round(biz.perDay), spamDay = Math.round(spam.perDay);
  list.push({
    id: "BIZ-1", kind: "IMEI", value: "006120774318842", tone: "lookalike",
    title: "SIM bank with 24 SIMs", sub: "IMEI 006120774318842 · cell TA-KA-0112", rule: "Bypass rule: many SIMs, one device, no incoming",
    gauges: [
      g("SIMs in this handset", "24", 24 / 50, true),
      g("Incoming calls", pct(biz.inRatio), biz.inRatio * 4, true),
      g("Different numbers a day", `${bizDay}`, Math.min(1, bizDay / 120), true),
      g("Cell towers seen", "1", 0.15, true),
      g("SIMs registered to", "one company (enterprise KYC)", 0.9, false),
      g("Data and SMS use", "SMS with registered header", 0.7, false),
    ],
    ai: { suggest: "BAR_IMEI", confidence: 0.86, drivers: ["24 SIMs used in one handset", `almost no incoming calls (${pct(biz.inRatio)})`, `${bizDay} different numbers called a day`] },
    options: ["BAR_IMEI", "GENUINE", "REVERIFY"],
    facts: ["SIMs registered under enterprise KYC to Swift Parcel Logistics Pvt Ltd, Bengaluru", "Messages go out under a registered DLT header (SWFTPL)", "Called numbers are customers with a delivery that day; 0 fraud complaints"],
    clash: "Every counter looks like a SIM box, but this is a delivery company's call centre calling its own customers, on SIMs registered to the company. Barring it stops deliveries, not fraud.",
    cases: [], sims: [], calls: [], linked: [], reportable: false,
  });
  list.push({
    id: "SPAM-1", kind: "MSISDN", value: "+91 20 4477 0812", tone: "lookalike",
    title: "Number reported as spam 14 times", sub: "+91 20 4477 0812 · cell TA-MH-0410", rule: "Spam reports above the review threshold",
    gauges: [
      g("Citizen spam reports", "14 in 7 days", 0.8, true),
      g("Different numbers a day", `${spamDay}`, Math.min(1, spamDay / 160), true),
      g("Average call", `${spam.avgSec} s`, 0.3, false),
      g("Registered sender", "yes, transactional (DLT)", 0.9, false),
    ],
    ai: { suggest: "LABEL_SPAM", confidence: 0.74, drivers: ["14 citizen spam reports (Chakshu)", `${spamDay} different numbers called a day`] },
    options: ["LABEL_SPAM", "CLEAR_REPORT"],
    facts: ["Registered to City Care Hospital as a transactional sender", "Calls are appointment reminders to patients on the hospital's list", "Reports started after a reminder campaign for a vaccination drive"],
    clash: "Citizens reported it, but it is a registered hospital line sending appointment reminders. Labelling it spam means patients ignore real reminders.",
    cases: [], sims: [], calls: [], linked: [], reportable: false,
  });
  cache = list;
  return list;
}

export const alertById = (id: string) => alerts().find((a) => a.id === id);

/** The right call on each alert, for the audit sample only (never shown to the analyst before they decide). */
export const EXPECTED: Record<string, TAction> = { "RIG-1": "BAR_IMEI", "RIG-2": "BAR_IMEI", "RIG-3": "BLOCK_ROUTE", "SIM-1": "DISCONNECT", "SIM-2": "REVERIFY", "FWD-1": "KEEP_LIVE", "BIZ-1": "GENUINE", "SPAM-1": "CLEAR_REPORT" };

// ---- The number trace: what the analyst's screen draws when they open an alert ----

export interface TNode { id: string; label: string; sub: string; tone: "sim" | "victim" | "customer" | "forward" | "bank" }
export interface Shown { number: string; kind: "spoofed" | "protected"; owner: string; calls: number }
export interface CashLink { at: number; who: string; paidAt: number; amount: number; mins: number; caseId: string | null }
export interface TraceView {
  device: { label: string; sub: string };
  sims: TNode[]; simsMore: number; people: TNode[]; peopleMore: number; bank: TNode[];
  edges: [string, string][]; shown: Shown[]; cash: CashLink[]; log: string[];
  totals: { calls: number; people: number; paid: number; medianMins: number | null };
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

export function traceView(a: Alert): TraceView {
  if (a.calls.length) {
    // People who lost the most first; then the SIMs that called them.
    const byPerson = new Map<string, TraceCall[]>();
    for (const c of a.calls) byPerson.set(c.to, [...(byPerson.get(c.to) ?? []), c]);
    const persons = [...byPerson.entries()].map(([to, cs]) => ({ to, cs, paid: Math.max(0, ...cs.map((c) => c.paid ?? 0)) })).sort((x, y) => y.paid - x.paid);
    const topP = persons.slice(0, 7);
    const simRank = new Map<string, number>();
    for (const p of topP) for (const c of p.cs) simRank.set(c.sim, (simRank.get(c.sim) ?? 0) + 1);
    const simIds = [...simRank.keys()].slice(0, 8);
    for (const s of a.sims) if (simIds.length < Math.min(8, a.sims.length) && !simIds.includes(s.msisdn)) simIds.push(s.msisdn);
    const simOf = new Map(a.sims.map((s) => [s.msisdn, s]));
    const sims: TNode[] = simIds.map((n) => ({ id: `s:${n}`, label: n, sub: a.kind === "IMEI" ? `KYC “${simOf.get(n)?.kycName ?? "unknown"}” · ${simOf.get(n)?.calls ?? 0} call${simOf.get(n)?.calls === 1 ? "" : "s"}` : `${a.calls.length} calls`, tone: "sim" }));
    const people: TNode[] = topP.map((p) => ({ id: `p:${p.to}`, label: p.cs[0]!.toName ?? p.to, sub: p.paid ? `paid ${Math.round(p.paid / 100).toLocaleString("en-IN")} rupees after the call` : `${p.cs.length} calls`, tone: "victim" }));
    const caseIds = [...new Set(topP.flatMap((p) => p.cs.map((c) => c.caseId)).filter(Boolean) as string[])];
    const bank: TNode[] = caseIds.map((cid) => ({ id: `b:${cid}`, label: cid, sub: "Bharat Demo Bank complaint", tone: "bank" }));
    const edges: [string, string][] = [];
    for (const p of topP) {
      for (const sim of new Set(p.cs.map((c) => c.sim))) if (simIds.includes(sim)) edges.push([`s:${sim}`, `p:${p.to}`]);
      for (const cid of new Set(p.cs.map((c) => c.caseId).filter(Boolean) as string[])) edges.push([`p:${p.to}`, `b:${cid}`]);
    }
    const shownMap = new Map<string, Shown>();
    for (const c of a.calls) {
      if (c.shownKind === "own") continue;
      const owner = W.spoofedOwners.find((o) => o.msisdn === c.shown)?.holder.name ?? W.protectedNumbers.find((p) => p.msisdn === c.shown)?.owner ?? "a genuine subscriber";
      const x = shownMap.get(c.shown) ?? { number: c.shown, kind: c.shownKind, owner, calls: 0 };
      x.calls++; shownMap.set(c.shown, x);
    }
    const shown = [...shownMap.values()].sort((x, y) => y.calls - x.calls).slice(0, 6);
    const paidCalls = a.calls.filter((c) => c.paidAt !== null && c.paid !== null);
    const cash = paidCalls.map((c) => ({ at: c.at, who: c.toName ?? c.to, paidAt: c.paidAt!, amount: c.paid!, mins: Math.max(1, Math.round((c.paidAt! - c.at - c.seconds * 1000) / 60_000)), caseId: c.caseId }))
      .sort((x, y) => y.amount - x.amount);
    const uniqueCash = cash.filter((c, i) => cash.findIndex((d) => d.who === c.who) === i);
    const paid = persons.reduce((s, p) => s + p.paid, 0);
    const med = median(uniqueCash.map((c) => c.mins));
    const spoofN = shownMap.size;
    return {
      device: { label: a.kind === "IMEI" ? a.title : a.value, sub: a.kind === "IMEI" ? `IMEI ${a.value}` : "the SIM that really made the calls" },
      sims, simsMore: Math.max(0, a.sims.length - sims.length), people, peopleMore: Math.max(0, persons.length - people.length), bank, edges, shown, cash: uniqueCash.slice(0, 5),
      totals: { calls: a.calls.length, people: persons.length, paid, medianMins: med },
      log: [
        `Read ${a.calls.length} call records for ${a.kind === "IMEI" ? `IMEI ${a.value}` : a.value}`,
        a.kind === "IMEI" ? `${a.sims.length} SIMs have been used inside this one handset` : "One SIM, one handset: checking when the SIM was last changed",
        "Scored the network counters against the SIM-box and fraud-line patterns",
        `${persons.length} people called; every one of them later reported fraud to a bank`,
        spoofN ? `${spoofN} number${spoofN > 1 ? "s" : ""} shown on victims' screens belong to other people: spoofed, never block` : "Calls showed the SIM's own number: no spoofing",
        med !== null ? `Matched calls to payments: half the victims paid within ${med} minutes of the call` : "No payments matched",
      ],
    };
  }
  if (a.id === "BIZ-1") {
    const sims: TNode[] = Array.from({ length: 6 }, (_, i) => ({ id: `s:${i}`, label: `+91 80471 820${String(i + 11)}`, sub: "Swift Parcel Logistics · enterprise KYC", tone: "sim" }));
    const people: TNode[] = ["Customer, Indiranagar", "Customer, Koramangala", "Customer, HSR Layout", "Customer, Whitefield", "Customer, Jayanagar"].map((l, i) => ({ id: `p:${i}`, label: l, sub: "parcel out for delivery today", tone: "customer" }));
    return {
      device: { label: a.title, sub: `IMEI ${a.value}` }, sims, simsMore: 18, people, peopleMore: 305, bank: [],
      edges: people.map((p, i) => [sims[i % sims.length]!.id, p.id]), shown: [], cash: [],
      totals: { calls: 2140, people: 310, paid: 0, medianMins: null },
      log: [
        `Read 2,140 call records for IMEI ${a.value} (last 7 days)`,
        "24 SIMs used inside one device",
        "Scored the network counters: they match the SIM-box pattern",
        "310 people called a day; none of them reported fraud",
        "Every call showed a number registered to the same company",
        "No payments to match: no bank complaints on any called number",
      ],
    };
  }
  if (a.id === "SPAM-1") {
    const people: TNode[] = ["Patient, Kothrud", "Patient, Aundh", "Patient, Baner", "Patient, Hadapsar", "Patient, Wakad"].map((l, i) => ({ id: `p:${i}`, label: l, sub: i < 2 ? "reported the call as spam" : "appointment reminder, 38 s", tone: "customer" }));
    const sims: TNode[] = [{ id: "s:0", label: a.value, sub: "City Care Hospital · transactional sender", tone: "sim" }];
    return {
      device: { label: a.value, sub: "City Care Hospital, Pune" }, sims, simsMore: 0, people, peopleMore: 175, bank: [],
      edges: people.map((p) => ["s:0", p.id]), shown: [], cash: [],
      totals: { calls: 1260, people: 180, paid: 0, medianMins: null },
      log: [
        `Read 1,260 call records for ${a.value} (last 7 days)`,
        "One registered line, one exchange: no SIM rotation",
        "Scored the counters: many short calls and 14 spam reports",
        "180 people called a day; 14 pressed “report spam”",
        "The number shown is the hospital's own registered number",
        "No payments to match: no bank complaints on any called number",
      ],
    };
  }
  // FWD-1: a mule's own phone.
  const l = a.linked[0];
  return {
    device: { label: a.value, sub: "phone on a reported bank account" },
    sims: [{ id: "s:0", label: a.value, sub: "registered to the account holder", tone: "sim" }], simsMore: 0,
    people: [{ id: "p:0", label: "+91 70019 4xxxx", sub: "unknown number: calls and OTP messages forwarded here", tone: "forward" }], peopleMore: 0,
    bank: l ? [{ id: `b:${l.account}`, label: l.account, sub: `${l.name} · ${l.caseId ?? "no case"}`, tone: "bank" }] : [],
    edges: [["s:0", "p:0"], ...(l ? [["s:0", `b:${l.account}`] as [string, string]] : [])], shown: [], cash: [],
    totals: { calls: 0, people: 1, paid: 0, medianMins: null },
    log: [
      `Read 3 days of records for ${a.value}`,
      "One SIM in one handset, registered to the account holder",
      "Scored the counters: call forwarding switched on to an unknown number",
      "11 OTP messages forwarded on, the pattern of a rented-out bank account",
      "The phone is tied to a mule account at Bharat Demo Bank",
      "Police letter on file for this number",
    ],
  };
}
