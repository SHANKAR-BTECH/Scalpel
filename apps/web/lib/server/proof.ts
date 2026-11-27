/**
 * "The proof" for one case: what the team actually did, next to what freezing exactly as the police asked would
 * have done, counted on the same decided accounts. Harm is kept apart both ways: money held with no traced victim
 * link (over-freeze), and victims' money the team chose to leave free (the risk accepted). Phones too: genuine
 * lines a blind sweep would cut, against what the analyst cut.
 *
 * Everything is computed from the record (decisions, holds, reviews, traces) and Scalpel's pro-rata trace of the
 * reported complaints. Nothing uses the simulator's hidden knowledge of who is really a mule. Red marks only
 * mistakes the desk itself can check.
 */
import { createHash } from "node:crypto";
import { model, holderName, POLICIES, W } from "./world";
import { statement } from "./bank";
import type { Desk } from "./desk";
import { spotOf } from "./review";
import { alerts, ACTION_LABEL } from "./telco";
import { blast, sisters, protectedReason } from "./telcogroup";
import { norm } from "./telcodata";

export const PICKS = 3;
const MATCH = 100_00; // Rs 100

export type RowStatus = "held" | "waiting" | "no-hold" | "sent-back" | "released" | "undecided";
export interface ProofRow {
  account: string; holder: string; band: string; askedWhole: boolean; asked: number; fast: number; team: number; traced: number;
  status: RowStatus; decided: boolean; overFast: number; overTeam: number; accepted: number; issues: string[]; pid: string | null; owner: string | null;
}
export interface PhoneRow { alert: string; title: string; sweep: { action: string; genuine: number }; team: { action: string; genuine: number } | null }
export interface Pick { pid: string; account: string; holder: string; txn: string; at: number; amount: number; balanceBefore: number; victimBefore: number; check: { ok: boolean; typed: number; issues: string[]; sentTo: string[]; at: number } | null }
export interface Rule { label: string; source: string; ref: string; verified: boolean; proposed: boolean; assumed?: boolean }
export interface Proof {
  caseId: string; title: string; rows: ProofRow[]; phones: PhoneRow[]; picks: Pick[];
  totals: { decided: number; undecided: number; undecidedTraced: number; asked: number; fast: number; team: number; traced: number; overFast: number; overTeam: number; accepted: number; gone: number; phonesDecided: number; phones: number; sweepGenuine: number; teamGenuine: number; sweepIdOwners: number; red: number };
  rules: Record<"fast" | "exact" | "request" | "clocks" | "sop", Rule>;
  signed: { by: string; at: number; hash: string; issues: number } | null;
  hash: string;
}

const src = (id: string) => POLICIES.flatMap((p) => p.sources).find((s) => s.id === id);
const rule = (label: string, id: string, proposed = false): Rule => {
  const s = src(id);
  return { label, source: s?.title ?? id, ref: s?.ref ?? "", verified: Boolean(s?.verified), proposed };
};

/** Line issues the desk can check by itself (never hidden truth). */
function issuesOf(d: Desk, account: string): { issues: string[]; owner: string | null } {
  const issues: string[] = [];
  let owner: string | null = null;
  const dec = d.decisionByAccount.get(account);
  const tr = d.trailOfAccount.get(account);
  if (dec?.trail && tr && tr.version !== dec.trail.version) { issues.push(`Decided on trail version ${dec.trail.version}; the trail was saved again (version ${tr.version}) after the decision.`); owner = dec.by; }
  const p = dec?.pid ? d.proposals.find((x) => x.pid === dec.pid) : undefined;
  const rv = p?.review;
  if (p?.status === "approved" && rv) {
    if (rv.spot?.ok === false) { issues.push(`The supervisor's spot-check didn't match (typed ${Math.round((rv.spot.typed ?? 0) / 100)} vs ${Math.round(rv.spot.expected / 100)}) and the hold was approved anyway.`); owner = p.decidedBy ?? owner; }
    if (rv.seconds < 20) { issues.push(`Approved after ${rv.seconds} s of review.`); owner = p.decidedBy ?? owner; }
  }
  const h = d.holdByAccount.get(account);
  if (h && h.clocks.some((c) => c.state === "EXPIRED")) { issues.push("A legal deadline on this hold has passed."); owner = owner ?? h.placedBy; }
  return { issues, owner };
}

export function caseProof(d: Desk, caseId: string): Proof | null {
  const m = model();
  const c = m.cases.find((x) => x.id === caseId);
  if (!c) return null;
  const rows: ProofRow[] = c.accounts.map((acct) => {
    const v = m.accounts.get(acct)!;
    const askedWhole = v.request.asksWholeAccount;
    const asked = askedWhole ? v.balance : Math.min(v.balance, v.request.amountRequested ?? 0);
    const dec = d.decisionByAccount.get(acct);
    const hold = d.holdByAccount.get(acct);
    const pend = d.pendingByAccount.get(acct);
    const released = d.holds.find((h) => h.hold.account === acct && h.hold.state === "RELEASED");
    const status: RowStatus = hold ? "held" : pend?.kind === "HOLD" ? "waiting" : released ? "released" : dec ? (dec.choice === "SEND_BACK" ? "sent-back" : dec.choice === "HOLD" ? "waiting" : "no-hold") : "undecided";
    const team = hold?.hold.amount ?? (pend?.kind === "HOLD" ? pend.amount : 0);
    const decided = status !== "undecided";
    const s = v.a.score?.muleScore ?? null;
    const band = s === null ? "No score" : s >= 0.5 ? "Likely mule (model)" : s < 0.2 ? "Ordinary customer (model)" : "Unclear (model)";
    const { issues, owner } = decided ? issuesOf(d, acct) : { issues: [], owner: null };
    return {
      account: acct, holder: holderName(v.a), band, askedWhole, asked, fast: asked, team, traced: v.traced, status, decided,
      overFast: Math.max(0, asked - v.traced), overTeam: Math.max(0, team - v.traced), accepted: decided ? Math.max(0, v.traced - team) : 0,
      issues, pid: dec?.pid ?? null, owner,
    };
  }).sort((a, b) => Number(b.decided) - Number(a.decided) || b.asked - a.asked);

  // Phones: what acting blindly on Telco-A's AI (and blocking every SIM on the reused IDs) would cut, against Imran's call.
  const phones: PhoneRow[] = [];
  const idOwners = new Set<string>();
  for (const a of alerts().filter((x) => x.cases.includes(caseId))) {
    const t = d.telcoByAlert.get(a.id);
    phones.push({
      alert: a.id, title: a.title,
      sweep: { action: ACTION_LABEL[a.ai.suggest], genuine: blast(a, a.ai.suggest).genuine },
      team: t ? { action: ACTION_LABEL[t.action], genuine: blast(a, t.action).genuine } : null,
    });
    for (const sim of a.sims) for (const r of sisters(sim.msisdn).rows) if (r.why.includes("same ID") && protectedReason(r.msisdn)) idOwners.add(norm(r.msisdn));
  }
  const decidedRows = rows.filter((r) => r.decided);
  const sum = (xs: ProofRow[], k: "asked" | "fast" | "team" | "traced" | "overFast" | "overTeam" | "accepted") => xs.reduce((s, r) => s + r[k], 0);
  // Group actions never cut a protected owner (the server refuses), so the team's count is only what its alert decisions cut.
  const decidedPhones = phones.filter((p) => p.team);

  // Meera's sample: up to 3 approved holds, picked by a hash of the case (same every time, unknown in advance).
  const tr = d.trails.get(caseId);
  const pins = new Set((tr?.pins ?? []).map((x) => x.ref));
  const approved = rows.filter((r) => r.status === "held" && r.pid).map((r) => r.pid!);
  const order = approved.sort((x, y) => createHash("sha256").update(caseId + x).digest("hex").localeCompare(createHash("sha256").update(caseId + y).digest("hex")));
  const picks: Pick[] = [];
  for (const pid of order) {
    if (picks.length >= PICKS) break;
    const p = d.proposals.find((x) => x.pid === pid)!;
    const sp = spotOf(pid, p.account, caseId, pins, "meera");
    if (!sp) continue;
    const t = W.txns.find((x) => x.id === sp.f.txnId)!;
    const before = beforeOf(p.account, t.id, t.amount);
    const last = [...d.proofChecks].reverse().find((x) => x.caseId === caseId && x.pid === pid && x.ok);
    picks.push({
      pid, account: p.account, holder: holderName(m.accounts.get(p.account)!.a), txn: t.id, at: t.at, amount: t.amount, balanceBefore: before,
      victimBefore: Math.round((sp.expected * before) / t.amount), check: last ? { ok: true, typed: last.typed, issues: last.issues, sentTo: last.sentTo, at: last.at } : null,
    });
  }

  const red = rows.filter((r) => r.issues.length).length;
  const totals = {
    decided: decidedRows.length, undecided: rows.length - decidedRows.length, undecidedTraced: sum(rows.filter((r) => !r.decided), "traced"),
    asked: sum(decidedRows, "asked"), fast: sum(decidedRows, "fast"), team: sum(decidedRows, "team"), traced: sum(decidedRows, "traced"),
    overFast: sum(decidedRows, "overFast"), overTeam: sum(decidedRows, "overTeam"), accepted: sum(decidedRows, "accepted"), gone: c.movedOut,
    phonesDecided: decidedPhones.length, phones: phones.length,
    sweepGenuine: decidedPhones.length ? decidedPhones.reduce((s, p) => s + p.sweep.genuine, 0) + idOwners.size : 0, teamGenuine: decidedPhones.reduce((s, p) => s + (p.team?.genuine ?? 0), 0),
    sweepIdOwners: decidedPhones.length ? idOwners.size : 0, red,
  };
  const hash = createHash("sha256").update(JSON.stringify({ caseId, totals, rows: rows.map((r) => [r.account, r.status, r.team, r.traced, r.issues.length]) })).digest("hex").slice(0, 16);
  const sg = d.proofSigned.get(caseId);
  return {
    caseId, title: c.title, rows, phones, picks, totals, hash,
    rules: {
      fast: { label: "Freeze as asked: hold the whole account or the full amount the police name, with no check", source: POLICIES.find((x) => x.id === "legacy-practice")?.title ?? "Common practice before 2026", ref: "policies/legacy-practice.yaml", verified: false, proposed: false, assumed: true },
      exact: rule("Hold only the victims' money in the account, not the whole account", "himanshu-gupta"),
      request: rule("Check the police request first (signed, exact amount, Magistrate told)", "allahabad-protocol"),
      clocks: rule("Tell the holder within a day; 60-day maximum for a bank hold", "rbi-draft-mule-2026", true),
      sop: rule("Police holds: grievance and release steps", "mha-sop-2026-01"),
    },
    signed: sg ? { by: sg.by, at: sg.at, hash: sg.hash, issues: sg.issues } : null,
  };
}

/** The balance just before a payment left the account (from the bank statement). */
function beforeOf(account: string, txn: string, amount: number): number {
  const st = statement(account, null, null);
  const row = st.found ? st.rows.find((r) => r.id === txn) : undefined;
  return row ? row.balance + row.amount : amount;
}

/** The answer to one of Meera's picks, kept on the server. */
export function pickAnswer(d: Desk, caseId: string, pid: string): number | null {
  const p = d.proposals.find((x) => x.pid === pid);
  if (!p || p.caseId !== caseId) return null;
  const pins = new Set((d.trails.get(caseId)?.pins ?? []).map((x) => x.ref));
  return spotOf(pid, p.account, caseId, pins, "meera")?.expected ?? null;
}
export { MATCH };
