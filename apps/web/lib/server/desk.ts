/**
 * The desk: what has happened so far, worked out from the audit log, and the actions people can take.
 * Every action re-reads the log and checks the rules again before it writes, so two people clicking at once
 * cannot approve the same proposal twice or approve their own proposal.
 */
import {
  verifyChain, createHold, applyEvent, clockViews, settle, evaluateGate, formatINR,
  type AuditEntry, type Hold, type ClockView, type HoldEvent, type Signal, type GateResult,
} from "@scalpel/engine";
import { cache } from "react";
import { store, type Store, type Note } from "./store";
import { model, policyNow, START, W, isProtectedNumber, holderName, type AccountView, type WRig } from "./world";
import type { User } from "@/lib/users";
import { aiView, REASONS, SIGNOFF_AT, CHOICE_LABEL, type Choice } from "./judge";
import { alertById, ACTION_LABEL, TREASONS, type TAction } from "./telco";
import { checkTrace, cleanPins, traceHash, type PinRef } from "./tracecheck";

export const DAY = 86_400_000;

export async function demoNow(s?: Store): Promise<number> {
  const c = await (s ?? (await store())).clock();
  return START + c.offsetMs + (Date.now() - c.startedAt);
}

export interface Proposal {
  pid: string; kind: "HOLD" | "RELEASE"; account: string; caseId: string; amount: number; holdId?: string; note: string;
  by: string; at: number; status: "pending" | "approved" | "rejected"; decidedBy?: string; decidedAt?: number; decisionNote?: string;
}
export interface HoldRow { hold: Hold; ref: string; caseId: string; requestId: string; clocks: ClockView[]; reply?: { text: string; fileName: string; at: number }; grmUploaded: boolean; placedBy: string; approvedBy: string }
export interface TelcoAsk { aid: string; caseId: string; kind: "IMEI" | "MSISDN" | "ROUTE"; value: string; note: string; by: string; at: number; done?: TelcoAction }
export interface TelcoAction { kind: "IMEI" | "MSISDN" | "ROUTE"; value: string; outcome: "BLOCKED" | "REFUSED"; reasons: string[]; by: string; at: number; aid?: string }
export interface SimCheck { msisdn: string; swappedHoursAgo: number | null; at: number; by: string }

/** One person-vs-AI decision on an account. Overruling a confident AI needs the supervisor's sign-off. */
export interface Decision {
  did: string; account: string; caseId: string; by: string; at: number;
  ai: { suggest: Choice; confidence: number; clash: string | null };
  choice: Choice; reason: string; note: string; agreed: boolean; needsSignoff: boolean; pid?: string;
  signoff?: { by: string; at: number; approved: boolean; note: string };
  open: boolean; // false once a send-back reopened the account
}

/** Imran's call on one Telco-A alert, next to what Telco-A's AI suggested. */
export interface TelcoDecision {
  tid: string; alert: string; by: string; at: number; ai: { suggest: TAction; confidence: number };
  action: TAction; reason: string; note: string; agreed: boolean; reported: string[]; packet: boolean;
  trace: { version: number; hash: string } | null; ceir: boolean;
}

/** An engineer's saved trace for one alert (latest version wins; every version stays in the record). */
export interface SavedTrace { alert: string; version: number; hash: string; pins: PinRef[]; ticks: string[]; note: string; by: string; at: number }

export interface Desk {
  now: number; chain: AuditEntry[];
  telco: TelcoDecision[]; telcoByAlert: Map<string, TelcoDecision>;
  /** DoT's fraud-risk rating for a number, raised after Telco-A reported it (overrides the starting rating). */
  fri: Map<string, { band: string; at: number; alert: string }>;
  /** Alerts whose call records were packed for the police, and when. */
  packets: Map<string, number>;
  traces: Map<string, SavedTrace>;
  decisions: Decision[]; decisionByAccount: Map<string, Decision>; returned: Map<string, Decision>;
  proposals: Proposal[]; holds: HoldRow[]; asks: TelcoAsk[]; actions: TelcoAction[]; checks: SimCheck[];
  holdByAccount: Map<string, HoldRow>; pendingByAccount: Map<string, Proposal>;
}

export const holdRef = (seq: number) => `H-${((48211 + seq * 7919) % 90000) + 10000}`;

export function fold(chain: AuditEntry[], now: number): Desk {
  const proposals = new Map<string, Proposal>();
  const holds = new Map<string, HoldRow>();
  const asks = new Map<string, TelcoAsk>();
  const actions: TelcoAction[] = [];
  const checks: SimCheck[] = [];
  const decisions = new Map<string, Decision>();
  const telco: TelcoDecision[] = [];
  const fri = new Map<string, { band: string; at: number; alert: string }>();
  const packets = new Map<string, number>();
  const traces = new Map<string, SavedTrace>();
  const ev = (row: HoldRow, type: HoldEvent, e: AuditEntry, note?: string) => {
    row.hold = applyEvent(row.hold, { type, at: e.at, by: e.actor, note }, policyNow(row.hold.events[0]!.at));
  };
  for (const e of chain) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = e.payload as Record<string, any>;
    switch (e.type) {
      case "PROPOSE":
        proposals.set(p.pid, { pid: p.pid, kind: p.kind, account: p.account, caseId: e.caseId, amount: p.amount, holdId: p.holdId, note: p.note ?? "", by: e.actor, at: e.at, status: "pending" });
        break;
      case "DECIDE": {
        const x = proposals.get(p.pid);
        if (x) Object.assign(x, { status: p.approved ? "approved" : "rejected", decidedBy: e.actor, decidedAt: e.at, decisionNote: p.note ?? "" });
        // Deciding the hold that came from a decision is also the sign-off on that decision.
        for (const dd of decisions.values()) if (dd.pid === p.pid && dd.open) {
          dd.signoff = { by: e.actor, at: e.at, approved: p.approved, note: p.note ?? "" };
          if (!p.approved) dd.open = false;
        }
        break;
      }
      case "DECISION":
        decisions.set(p.did, { did: p.did, account: p.account, caseId: e.caseId, by: e.actor, at: e.at, ai: p.ai, choice: p.choice, reason: p.reason, note: p.note ?? "", agreed: p.agreed, needsSignoff: p.needsSignoff, pid: p.pid ?? undefined, open: true });
        break;
      case "SIGNOFF": {
        const dd = decisions.get(p.did);
        if (dd && dd.open && !dd.signoff) {
          dd.signoff = { by: e.actor, at: e.at, approved: p.approved, note: p.note ?? "" };
          if (!p.approved) dd.open = false;
        }
        break;
      }
      case "HOLD_PLACED": {
        const policy = policyNow(e.at);
        const pr = proposals.get(p.pid);
        holds.set(p.holdId, {
          hold: createHold({ id: p.holdId, account: p.account, amount: p.amount, regime: "MHA_POLICE", at: e.at, by: e.actor, policy }),
          ref: p.ref, caseId: e.caseId, requestId: p.requestId, clocks: [], grmUploaded: false, placedBy: pr?.by ?? "", approvedBy: e.actor,
        });
        break;
      }
      case "NOTICE_SENT": case "GRM_UPLOADED": case "RELEASED": case "REVIEWED": {
        const row = holds.get(p.holdId);
        if (!row || row.hold.state === "RELEASED") break;
        ev(row, e.type as HoldEvent, e, p.note);
        if (e.type === "GRM_UPLOADED") row.grmUploaded = true;
        break;
      }
      case "REPLY_RECEIVED": {
        const row = holds.get(p.holdId);
        if (!row || row.hold.state === "RELEASED") break;
        ev(row, "REPLY_RECEIVED", e);
        row.reply = { text: p.text, fileName: p.fileName, at: e.at };
        break;
      }
      case "TELCO_ASK":
        asks.set(p.aid, { aid: p.aid, caseId: e.caseId, kind: p.kind, value: p.value, note: p.note ?? "", by: e.actor, at: e.at });
        break;
      case "TELCO_ACTION": {
        const a: TelcoAction = { kind: p.kind, value: p.value, outcome: p.outcome, reasons: p.reasons, by: e.actor, at: e.at, aid: p.aid };
        actions.push(a);
        for (const k of asks.values()) if (!k.done && k.kind === a.kind && k.value === a.value) k.done = a;
        break;
      }
      case "TELCO_DECISION":
        telco.push({ tid: p.tid, alert: p.alert, by: e.actor, at: e.at, ai: p.ai, action: p.action, reason: p.reason, note: p.note ?? "", agreed: p.agreed, reported: p.reported ?? [], packet: Boolean(p.packet), trace: p.trace ?? null, ceir: Boolean(p.ceir) });
        break;
      case "TRACE_SAVED":
        traces.set(p.alert, { alert: p.alert, version: p.version, hash: p.hash, pins: p.pins, ticks: p.ticks ?? [], note: p.note ?? "", by: e.actor, at: e.at });
        break;
      case "DOT_FRI":
        for (const n of p.msisdns as string[]) fri.set(n, { band: p.band, at: e.at, alert: p.alert });
        break;
      case "POLICE_PACKET":
        packets.set(p.alert, e.at);
        break;
      case "SIM_CHECK":
        checks.push({ msisdn: p.msisdn, swappedHoursAgo: p.swappedHoursAgo, at: e.at, by: e.actor });
        break;
    }
  }
  for (const row of holds.values()) {
    const policy = policyNow(row.hold.events[0]!.at);
    row.hold = settle(row.hold, policy, now).hold;
    row.clocks = clockViews(row.hold, policy, now);
  }
  const holdByAccount = new Map<string, HoldRow>();
  for (const h of holds.values()) if (h.hold.state === "ACTIVE") holdByAccount.set(h.hold.account, h);
  const pendingByAccount = new Map<string, Proposal>();
  for (const pr of proposals.values()) if (pr.status === "pending") pendingByAccount.set(pr.account, pr);
  const decisionByAccount = new Map<string, Decision>();
  const returned = new Map<string, Decision>();
  for (const dd of decisions.values()) {
    if (dd.open) { decisionByAccount.set(dd.account, dd); returned.delete(dd.account); }
    else if (!decisionByAccount.has(dd.account)) returned.set(dd.account, dd);
  }
  const telcoByAlert = new Map(telco.map((t) => [t.alert, t] as const));
  return { now, chain, telco, telcoByAlert, fri, packets, traces, decisions: [...decisions.values()], decisionByAccount, returned, proposals: [...proposals.values()], holds: [...holds.values()], asks: [...asks.values()], actions, checks, holdByAccount, pendingByAccount };
}

/** Read once per page render: the header and the page share it instead of each asking the database. */
export const desk = cache(async (): Promise<Desk> => {
  const s = await store();
  const [chain, now] = await Promise.all([s.chain(), demoNow(s)]);
  return fold(chain, now);
});

// ---------- telecom ----------

export interface PhoneTarget { kind: "IMEI" | "MSISDN" | "ROUTE"; value: string; label: string; signals: Signal[]; gate: GateResult | null; refusal: string[]; collateral: string | null }

/** The rules on a telecom block: R5 (protected numbers), R6 (spoofed numbers), R7 (enough signs, one from the network), plus a collateral check for routes. */
export function phoneTarget(kind: PhoneTarget["kind"], value: string, now: number, checks: SimCheck[] = []): PhoneTarget {
  const m = model();
  const policy = policyNow(now);
  const rig: WRig | undefined = kind === "IMEI" ? m.rigByImei.get(value) : kind === "ROUTE" ? W.rigs.find((r) => r.route === value) : m.rigOfSim.get(value);
  const solo = kind === "MSISDN" ? m.soloByNumber.get(value) : undefined;
  const calls = W.calls.filter((c) => (kind === "IMEI" ? c.imei === value : kind === "ROUTE" ? c.imei === rig?.imei : c.realSim === value || c.shownCaller === value));
  const victimsCalled = new Set(calls.map((c) => c.to)).size;
  const signals: Signal[] = [];
  if (rig && rig.sims.length > 5) signals.push("HANDSET_GT5_SIMS");
  if (rig?.kind === "simbox") signals.push("SIMBOX_ROUTE");
  const swapAt = solo?.swappedAt ?? m.phoneByNumber.get(value)?.swappedAt ?? null;
  const checked = checks.filter((c) => c.msisdn === value).at(-1);
  if ((checked ? checked.swappedHoursAgo !== null && checked.swappedHoursAgo <= 72 : swapAt !== null && now - swapAt <= 72 * 3_600_000)) signals.push("SIM_SWAP_LT_72H");
  if (victimsCalled >= 3) signals.push("GE3_CASE_LINKED_SENDERS");
  const shownOnly = kind === "MSISDN" && m.spoofed.has(value) && !calls.some((c) => c.realSim === value);
  const label = kind === "IMEI" ? `Handset ${value}${rig ? ` (${rig.kind === "simbox" ? "SIM box" : "phone"} with ${rig.sims.length} SIMs)` : ""}`
    : kind === "ROUTE" ? value : `Number ${value}`;
  const refusal: string[] = [];
  let collateral: string | null = null;
  let gate: GateResult | null = null;
  if (kind === "ROUTE") {
    if (!rig) refusal.push("Unknown route");
    else if (rig.genuineLinesOnRoute > 0) {
      collateral = `${rig.genuineLinesOnRoute} genuine business lines also use this route. Blocking it would cut them off: block the SIM box handset instead.`;
      refusal.push(collateral);
    }
    if (signals.length < 2) refusal.push(`Only ${signals.length} warning sign(s); a block needs 2, one of them from the network`);
  } else {
    const action = kind === "IMEI" ? { kind: "IMEI_BLOCK" as const, imei: value } : { kind: "MSISDN_BLOCK" as const, msisdn: value };
    gate = evaluateGate(action, {
      at: now, requester: "TELCO_SELF", assessment: { role: "normal", muleScore: 0, signals }, officerConfirmed: false,
      evidenceRecordId: `CDR-${value}`, msisdn: kind === "MSISDN" ? { number: value, spoofSuspected: shownOnly } : undefined,
    }, policy);
    if (gate.decision === "DENY" || gate.decision === "ROUTE") refusal.push(...gate.checks.filter((c) => !c.ok).map((c) => c.note));
  }
  return { kind, value, label, signals, gate, refusal, collateral };
}

export function simSwapLookup(msisdn: string, now: number): number | null {
  const m = model();
  const at = m.soloByNumber.get(msisdn)?.swappedAt ?? m.phoneByNumber.get(msisdn)?.swappedAt ?? null;
  if (at === null || at > now) return null;
  return Math.round((now - at) / 3_600_000);
}

// ---------- actions ----------

export class DeskError extends Error {}
function must(ok: unknown, msg: string): asserts ok { if (!ok) throw new DeskError(msg); }
const id = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface ActionResult { message: string }

export async function proposeHold(u: User, account: string, amount: number, note: string): Promise<ActionResult> {
  must(u.role === "officer", "Only the fraud officer proposes holds.");
  const m = model();
  const v = m.accounts.get(account);
  must(v, "Unknown account.");
  const caseId = m.caseOfAccount.get(account) ?? "CASE-?";
  must(Number.isSafeInteger(amount) && amount > 0, "Enter an amount.");
  must(amount <= v.traced, `The hold can't be more than the victim money still in the account (${formatINR(v.traced)}).`);
  const s = await store();
  const now = await demoNow(s);
  const pid = id("P");
  const ai = aiView(v, now);
  must(ai.suggest !== "SEND_BACK", "The police request can't be used as it is: send it back instead of holding.");
  const agreed = ai.suggest === "HOLD";
  await s.append([
    { at: now, actor: u.id, type: "DECISION", caseId, payload: { did: id("D"), account, ai: { suggest: ai.suggest, confidence: ai.confidence, clash: ai.clash }, choice: "HOLD", reason: agreed ? REASONS[0] : "Other", note, agreed, needsSignoff: !agreed && ai.confidence >= SIGNOFF_AT, pid } },
    { at: now, actor: u.id, type: "PROPOSE", caseId, payload: { pid, kind: "HOLD", account, amount, note } },
  ], (chain) => {
    const d = fold(chain, now);
    must(!d.pendingByAccount.has(account), "A proposal for this account is already waiting for the supervisor.");
    must(!d.holdByAccount.has(account), "This account already has an active hold.");
  });
  await s.notify([{ at: now, to: "vikram", text: `${u.name} proposed a hold of ${formatINR(amount)} on ${holderName(v.a)} (${caseId})`, link: "/approvals" }]);
  return { message: `Sent to the supervisor: hold ${formatINR(amount)} on ${holderName(v.a)}.` };
}

export async function proposeRelease(u: User, holdId: string, note: string): Promise<ActionResult> {
  must(u.role === "officer", "Only the fraud officer proposes a release.");
  const s = await store();
  const now = await demoNow(s);
  const row = fold(await s.chain(), now).holds.find((h) => h.hold.id === holdId);
  must(row && row.hold.state === "ACTIVE", "This hold is not active.");
  const label = holderName(model().accounts.get(row.hold.account)!.a);
  await s.append([{ at: now, actor: u.id, type: "PROPOSE", caseId: row.caseId, payload: { pid: id("P"), kind: "RELEASE", account: row.hold.account, amount: row.hold.amount, holdId, note } }], (c) => {
    must(!fold(c, now).pendingByAccount.has(row.hold.account), "A proposal for this account is already waiting.");
  });
  await s.notify([{ at: now, to: "vikram", text: `${u.name} proposed releasing the hold on ${label} (${row.ref})`, link: "/approvals" }]);
  return { message: `Release of ${row.ref} sent to the supervisor.` };
}

export async function decide(u: User, pid: string, approved: boolean, note: string): Promise<ActionResult> {
  must(u.role === "supervisor", "Only the supervisor approves.");
  const s = await store();
  const now = await demoNow(s);
  let msg = "";
  const notes: { to: string; text: string; link: string }[] = [];
  const chain = await s.chain();
  const pre = fold(chain, now).proposals.find((p) => p.pid === pid);
  must(pre, "Unknown proposal.");
  must(pre.by !== u.id, "You proposed this yourself. Someone else must approve it (two-person rule).");
  const v = model().accounts.get(pre.account)!;
  const drafts: Omit<AuditEntry, "seq" | "prevHash" | "hash">[] = [{ at: now, actor: u.id, type: "DECIDE", caseId: pre.caseId, payload: { pid, approved, note } }];
  if (approved && pre.kind === "HOLD") {
    const holdId = id("HOLD");
    const seq = chain.length + 1;
    const ref = holdRef(seq);
    drafts.push({ at: now, actor: u.id, type: "HOLD_PLACED", caseId: pre.caseId, payload: { pid, holdId, ref, account: pre.account, amount: pre.amount, requestId: v.request.id } });
    drafts.push({ at: now, actor: "system", type: "NOTICE_SENT", caseId: pre.caseId, payload: { holdId, ref, channel: "SMS and email" } });
    notes.push({ to: `holder:${ref}`, text: `Bharat Demo Bank: ${formatINR(pre.amount)} in your account is on hold because of a police request linked to a fraud complaint. The rest of your money is free to use. Reference ${ref}. You can explain at the Scalpel portal.`, link: "/portal/status" });
    notes.push({ to: pre.by, text: `${u.name} approved your hold of ${formatINR(pre.amount)} on ${holderName(v.a)}. Hold ${ref} placed and the holder told.`, link: `/case/${pre.caseId}` });
    notes.push({ to: "meera", text: `New hold ${ref}: ${formatINR(pre.amount)} on ${holderName(v.a)}`, link: "/assure" });
    msg = `Approved. Hold ${ref} placed and the account holder notified.`;
  } else if (approved && pre.kind === "RELEASE") {
    drafts.push({ at: now, actor: u.id, type: "RELEASED", caseId: pre.caseId, payload: { holdId: pre.holdId!, note: pre.note } });
    const row = fold(chain, now).holds.find((h) => h.hold.id === pre.holdId);
    if (row) notes.push({ to: `holder:${row.ref}`, text: `Bharat Demo Bank: the hold ${row.ref} on your account has been lifted. Your full balance is available.`, link: "/portal/status" });
    notes.push({ to: pre.by, text: `${u.name} approved the release on ${holderName(v.a)}.`, link: "/holds" });
    msg = "Approved. Hold released and the holder told.";
  } else {
    notes.push({ to: pre.by, text: `${u.name} rejected your ${pre.kind === "HOLD" ? "hold" : "release"} on ${holderName(v.a)}${note ? `: "${note}"` : ""}`, link: `/case/${pre.caseId}` });
    msg = "Rejected. The officer has been told.";
  }
  await s.append(drafts, (c) => {
    const p = fold(c, now).proposals.find((x) => x.pid === pid);
    must(p && p.status === "pending", "Someone already decided this proposal.");
  });
  await s.notify(notes.map((n) => ({ ...n, at: now })));
  return { message: msg };
}

export async function decideAccount(u: User, account: string, choice: Choice, reason: string, note: string): Promise<ActionResult> {
  must(u.role === "officer", "Only the fraud officer decides on accounts.");
  must(["HOLD", "NO_HOLD", "SEND_BACK"].includes(choice), "Pick what to do.");
  must((REASONS as readonly string[]).includes(reason), "Pick a reason.");
  const m = model();
  const v = m.accounts.get(account);
  must(v, "Unknown account.");
  const caseId = m.caseOfAccount.get(account) ?? "CASE-?";
  const s = await store();
  const now = await demoNow(s);
  const ai = aiView(v, now, fold(await s.chain(), now).fri.get(v.phone?.msisdn ?? "")?.band);
  must(!(choice === "HOLD" && ai.suggest === "SEND_BACK"), `This police request can't be used as it is (${ai.rules[0] ?? "rules"}). Send it back, or wait for a valid one.`);
  must(!(choice === "HOLD" && ai.amount <= 0), "There is no victims' money left here to hold.");
  must(!(choice === "HOLD" && v.gate.decision === "DENY"), `The rules don't allow a hold here: ${ai.rules[0] ?? ""}`);
  must(choice !== "SEND_BACK" || ai.rules.length > 0 || note.trim().length >= 5, "Say what the police must fix.");
  must(reason !== "Other" || note.trim().length >= 5, "Write a short note for 'Other'.");
  const agreed = choice === ai.suggest;
  const needsSignoff = !agreed && ai.confidence >= SIGNOFF_AT;
  const did = id("D"), pid = choice === "HOLD" ? id("P") : undefined;
  const drafts: Omit<AuditEntry, "seq" | "prevHash" | "hash">[] = [
    { at: now, actor: u.id, type: "DECISION", caseId, payload: { did, account, ai: { suggest: ai.suggest, confidence: ai.confidence, clash: ai.clash }, choice, reason, note: note.trim().slice(0, 500), agreed, needsSignoff, pid: pid ?? null } },
  ];
  if (pid) drafts.push({ at: now, actor: u.id, type: "PROPOSE", caseId, payload: { pid, kind: "HOLD", account, amount: ai.amount, note: `${reason}${note ? `: ${note}` : ""}` } });
  await s.append(drafts, (c) => {
    const d = fold(c, now);
    must(!d.decisionByAccount.has(account), "This account has already been decided.");
    must(!d.holdByAccount.has(account) && !d.pendingByAccount.has(account), "This account already has a hold or one waiting.");
  });
  const who = holderName(v.a);
  if (pid) await s.notify([{ at: now, to: "vikram", text: `${u.name} proposed a hold of ${formatINR(ai.amount)} on ${who} (${caseId})${agreed ? "" : ", overruling the AI"}`, link: "/approvals" }]);
  else if (needsSignoff) await s.notify([{ at: now, to: "vikram", text: `${u.name} overruled a confident AI on ${who} (${caseId}): ${CHOICE_LABEL[choice]}. Needs your sign-off.`, link: "/approvals" }]);
  return { message: pid ? `Sent to the supervisor: hold ${formatINR(ai.amount)} on ${who}.` : needsSignoff ? `Recorded. You overruled a confident AI, so the supervisor will check it.` : `Recorded: ${CHOICE_LABEL[choice].toLowerCase()} for ${who}.` };
}

/** Accept the AI's suggestion for several clear accounts at once (the officer can untick any). */
export async function decideClear(u: User, accounts: string[]): Promise<ActionResult> {
  must(u.role === "officer", "Only the fraud officer decides on accounts.");
  must(accounts.length > 0, "Tick at least one account.");
  let n = 0;
  for (const a of accounts) {
    const v = model().accounts.get(a);
    must(v, "Unknown account.");
    const now2 = await demoNow();
    const ai = aiView(v, now2, (await desk()).fri.get(v.phone?.msisdn ?? "")?.band);
    must(!ai.point, `${holderName(v.a)} needs a closer look; decide it on its own.`);
    await decideAccount(u, a, ai.suggest, REASONS[0], "Accepted with the clear group");
    n++;
  }
  return { message: `${n} account${n > 1 ? "s" : ""} decided as the AI suggested. Holds went to the supervisor.` };
}

export async function signoff(u: User, did: string, approved: boolean, note: string): Promise<ActionResult> {
  must(u.role === "supervisor", "Only the supervisor signs off.");
  const s = await store();
  const now = await demoNow(s);
  const pre = fold(await s.chain(), now).decisions.find((x) => x.did === did);
  must(pre && pre.open && pre.needsSignoff && !pre.signoff && !pre.pid, "Nothing to sign off here.");
  must(pre.by !== u.id, "You can't sign off your own decision.");
  must(approved || note.trim().length >= 5, "Tell the officer why you're sending it back.");
  await s.append([{ at: now, actor: u.id, type: "SIGNOFF", caseId: pre.caseId, payload: { did, approved, note: note.trim().slice(0, 500) } }], (c) => {
    const x = fold(c, now).decisions.find((y) => y.did === did);
    must(x && x.open && !x.signoff, "Someone already signed this off.");
  });
  const who = holderName(model().accounts.get(pre.account)!.a);
  await s.notify([{ at: now, to: pre.by, text: approved ? `${u.name} agreed with your call on ${who}.` : `${u.name} sent back your call on ${who}: "${note.trim()}". Please decide again.`, link: `/case/${pre.caseId}#acct-${pre.account}` }]);
  return { message: approved ? "Signed off." : "Sent back to the officer with your note." };
}

export async function uploadGrievance(u: User, holdId: string): Promise<ActionResult> {
  must(u.role === "officer", "Only the fraud officer does this.");
  const s = await store();
  const now = await demoNow(s);
  const row = fold(await s.chain(), now).holds.find((h) => h.hold.id === holdId);
  must(row && row.reply && !row.grmUploaded && row.hold.state === "ACTIVE", "Nothing to upload for this hold.");
  await s.append([{ at: now, actor: u.id, type: "GRM_UPLOADED", caseId: row.caseId, payload: { holdId, ref: row.ref } }]);
  await s.notify([{ at: now, to: `holder:${row.ref}`, text: `Your explanation for ${row.ref} has been sent to the investigating police officer, who has 15 days to decide.`, link: "/portal/status" }]);
  return { message: `Explanation for ${row.ref} sent to the police grievance module. The officer's 15-day clock has started.` };
}

export async function holderReply(ref: string, text: string, fileName: string): Promise<ActionResult> {
  const s = await store();
  const now = await demoNow(s);
  const row = fold(await s.chain(), now).holds.find((h) => h.ref === ref);
  must(row && row.hold.state === "ACTIVE", "This hold is not active.");
  must(!row.reply, "You have already sent an explanation.");
  must(text.trim().length >= 10, "Please write a few words about the payment.");
  await s.append([{ at: now, actor: `holder:${ref}`, type: "REPLY_RECEIVED", caseId: row.caseId, payload: { holdId: row.hold.id, ref, text: text.trim().slice(0, 2000), fileName: fileName.slice(0, 120) } }]);
  await s.notify([{ at: now, to: "priya", text: `The holder of ${ref} sent an explanation${fileName ? ` with ${fileName}` : ""}. Upload it to the police grievance module within 7 days.`, link: "/holds" }]);
  return { message: "Thank you. Your explanation reached the bank's fraud officer." };
}

export async function askTelco(u: User, caseId: string, kind: TelcoAsk["kind"], value: string, note: string): Promise<ActionResult> {
  must(u.role === "officer", "Only the fraud officer sends requests to Telco-A.");
  const s = await store();
  const now = await demoNow(s);
  await s.append([{ at: now, actor: u.id, type: "TELCO_ASK", caseId, payload: { aid: id("T"), kind, value, note } }], (c) => {
    const d = fold(c, now);
    must(!d.asks.some((a) => !a.done && a.kind === kind && a.value === value), "Already asked; Telco-A has it.");
  });
  await s.notify([{ at: now, to: "imran", text: `${u.name} (Bharat Demo Bank) asks Telco-A to look at ${kind === "IMEI" ? "handset" : kind === "ROUTE" ? "route" : "number"} ${value} (${caseId})`, link: "/telco" }]);
  return { message: "Sent to Telco-A." };
}

export async function telcoAct(u: User, kind: TelcoAction["kind"], value: string): Promise<ActionResult> {
  must(u.role === "telco", "Only the Telco-A analyst blocks phones.");
  const s = await store();
  const now = await demoNow(s);
  const d = fold(await s.chain(), now);
  must(!d.actions.some((a) => a.kind === kind && a.value === value && a.outcome === "BLOCKED"), "Already blocked.");
  const t = phoneTarget(kind, value, now, d.checks);
  const outcome = t.refusal.length ? "REFUSED" : "BLOCKED";
  const ask = d.asks.find((a) => !a.done && a.kind === kind && a.value === value);
  const caseId = ask?.caseId ?? (model().casesOfRig.get(model().rigByImei.get(value)?.id ?? value)?.[0] ?? "TELCO");
  await s.append([{ at: now, actor: u.id, type: "TELCO_ACTION", caseId, payload: { kind, value, outcome, reasons: t.refusal, aid: ask?.aid ?? null, signals: t.signals } }]);
  if (ask) await s.notify([{ at: now, to: ask.by, text: `Telco-A ${outcome === "BLOCKED" ? "blocked" : "refused to block"} ${t.label}${outcome === "REFUSED" ? `: ${t.refusal[0]}` : ""}`, link: `/case/${ask.caseId}` }]);
  return { message: outcome === "BLOCKED" ? `${t.label} blocked.` : `Not blocked: ${t.refusal.join(" ")}` };
}

/** Imran decides an alert with Telco-A's AI. Reporting to DoT raises the fraud-risk rating banks receive for the
 *  linked numbers; call records never go to the bank (a police packet is a separate, police-only step). */
export async function telcoDecide(u: User, alertId: string, action: string, reason: string, note: string, report: boolean, ceir = false): Promise<ActionResult> {
  must(u.role === "telco", "Only the Telco-A analyst decides alerts.");
  const a = alertById(alertId);
  must(a, "Unknown alert.");
  must((a.options as string[]).includes(action), "Pick one of the actions.");
  must((TREASONS as readonly string[]).includes(reason), "Pick a reason.");
  must(reason !== "Other" || note.trim().length >= 5, "Write a short note for 'Other'.");
  const s = await store();
  const now = await demoNow(s);
  const act = action as TAction;
  const tr = fold(await s.chain(), now).traces.get(a.id);
  must(tr, "Build and save your trace in the workbench before deciding.");
  const ready = checkTrace(a.id, tr.pins).actions.find((x) => x.action === act);
  must(ready?.ready, `Your saved trace doesn't yet support this. Still missing: ${ready?.missing.join("; ")}.`);
  const agreed = act === a.ai.suggest;
  const fraudAction = act === "BAR_IMEI" || act === "BLOCK_ROUTE" || act === "DISCONNECT" || act === "KEEP_LIVE" || act === "REVERIFY";
  const reported = report && fraudAction && a.reportable ? a.linked.map((l) => l.msisdn) : [];
  const tid = id("TD");
  const caseId = a.cases[0] ?? "TELCO";
  const drafts: Omit<AuditEntry, "seq" | "prevHash" | "hash">[] = [
    { at: now, actor: u.id, type: "TELCO_DECISION", caseId, payload: { tid, alert: a.id, value: a.value, ai: a.ai.suggest === undefined ? null : { suggest: a.ai.suggest, confidence: a.ai.confidence }, action: act, reason, note: note.trim().slice(0, 500), agreed, reported, packet: false, trace: { version: tr.version, hash: tr.hash }, ceir: ceir && act === "BAR_IMEI" } },
  ];
  if (ceir && act === "BAR_IMEI") drafts.push({ at: now, actor: u.id, type: "CEIR_REQUEST", caseId, payload: { alert: a.id, imei: a.value, to: "DoT (CEIR)", basis: `Telco-A trace v${tr.version}` } });
  if (reported.length) drafts.push({ at: now, actor: "dot", type: "DOT_FRI", caseId, payload: { alert: a.id, msisdns: reported, band: "HIGH", source: "Telco-A report via DIP" } });
  await s.append(drafts, (c) => must(!fold(c, now).telcoByAlert.has(a.id), "This alert has already been decided."));
  const notes: Omit<Note, "id" | "read">[] = [];
  for (const cid of new Set(a.linked.filter((l) => reported.includes(l.msisdn)).map((l) => l.caseId).filter(Boolean) as string[])) {
    const n = a.linked.filter((l) => l.caseId === cid && reported.includes(l.msisdn)).length;
    notes.push({ at: now, to: "priya", text: `DoT raised the fraud-risk rating to High on ${n} phone${n > 1 ? "s" : ""} in ${cid}, after Telco-A's report. The AI's suggestions there are updated.`, link: `/case/${cid}` });
  }
  if (!agreed) notes.push({ at: now, to: "meera", text: `${u.name} (Telco-A) overruled Telco-A's AI on ${a.title}: ${ACTION_LABEL[act].toLowerCase()}.`, link: "/assure" });
  if (notes.length) await s.notify(notes);
  return { message: `Recorded: ${ACTION_LABEL[act].toLowerCase()}.${ceir && act === "BAR_IMEI" ? " National block requested from DoT (CEIR)." : ""}${reported.length ? ` Reported to DoT: ${reported.length} linked number${reported.length > 1 ? "s" : ""} now rated High for banks.` : ""}` };
}

/** Call records for one alert, prepared for the police (never for the bank). Needs a police request on a linked case. */
export async function policePacket(u: User, alertId: string): Promise<ActionResult> {
  must(u.role === "telco", "Only Telco-A prepares police packets.");
  const a = alertById(alertId);
  must(a, "Unknown alert.");
  must(a.cases.length > 0 && a.calls.length > 0, "No police request covers this alert, so its call records stay with Telco-A.");
  const s = await store();
  const now = await demoNow(s);
  must(fold(await s.chain(), now).traces.has(a.id), "Save a trace first: the packet goes out with the evidence you built.");
  await s.append([{ at: now, actor: u.id, type: "POLICE_PACKET", caseId: a.cases[0]!, payload: { alert: a.id, calls: a.calls.length, to: "Investigating officer (police only)", basis: "Police request on the linked case (BNSS s.94)" } }], (c) => must(!fold(c, now).packets.has(a.id), "The police packet for this alert is already prepared."));
  return { message: `Police packet ready: ${a.calls.length} call records for the investigating officer only. The bank does not receive them.` };
}

export async function simCheck(u: User, msisdn: string): Promise<ActionResult> {
  must(u.role === "telco" || u.role === "officer", "Not allowed.");
  const s = await store();
  const now = await demoNow(s);
  const n = msisdn.trim();
  must(/^\+91 [\d ]{10,13}$/.test(n) && n.replace(/\D/g, "").length === 12 || isProtectedNumber(n), "Type the number as shown, e.g. +91 98765 43210.");
  const hours = simSwapLookup(n, now);
  await s.append([{ at: now, actor: u.id, type: "SIM_CHECK", caseId: "TELCO", payload: { msisdn: n, swappedHoursAgo: hours, api: "CAMARA SIM Swap (simulated)" } }]);
  return { message: hours === null ? `${n}: no SIM swap on record.` : `${n}: SIM swapped ${hours} hours ago${hours <= 72 ? " (inside 72 hours: a warning sign)" : ""}.` };
}

export async function exportEvidence(u: User, caseId: string) {
  must(u.role === "auditor" || u.role === "supervisor", "Only compliance or the supervisor exports evidence.");
  const s = await store();
  const now = await demoNow(s);
  await s.append([{ at: now, actor: u.id, type: "EVIDENCE_EXPORTED", caseId, payload: { caseId } }]);
}

/** Compliance's tamper test: copy the record, quietly change one past entry, and show that the check catches it.
 *  The real record is never touched. */
export async function tamperTest(u: User): Promise<ActionResult & { row?: number; reason?: string }> {
  must(u.role === "auditor", "Only compliance runs the tamper test.");
  const chain = await (await store()).chain();
  must(chain.length >= 2, "Nothing recorded yet. Make a decision or two first.");
  const i = Math.max(0, Math.floor(chain.length / 2) - 1);
  const copy = chain.map((e) => ({ ...e, payload: { ...(e.payload as object) } }));
  const target = copy[i]!;
  const p = target.payload as Record<string, unknown>;
  if (typeof p.amount === "number") p.amount = Math.round(p.amount / 2); else p.note = "changed quietly";
  const r = await verifyChain(copy);
  must(!r.ok, "The check did not catch the change. This should never happen.");
  return { message: `Changed entry #${i} (${target.type}) in a copy. The check caught it at entry #${r.brokenAt}: ${r.reason}. The real record is untouched.`, row: r.brokenAt, reason: r.reason };
}

export async function moveClock(u: User, days: number): Promise<ActionResult> {
  must(u.role === "admin", "Only the admin moves the clock.");
  must([1, 7, 30].includes(days), "Pick 1, 7 or 30 days.");
  const s = await store();
  const c = await s.clock();
  await s.setClock({ ...c, offsetMs: c.offsetMs + days * DAY });
  const now = await demoNow(s);
  await s.append([{ at: now, actor: u.id, type: "CLOCK_MOVED", caseId: "ADMIN", payload: { days } }]);
  for (const to of ["priya", "vikram", "meera", "imran"]) await s.notify([{ at: now, to, text: `Demo clock moved forward ${days} day${days > 1 ? "s" : ""}.`, link: "/holds" }]);
  return { message: `Clock moved forward ${days} day${days > 1 ? "s" : ""}.` };
}

/** Imran saves his trace for an alert. The pins are references; the check is worked out again on the server. */
export async function saveTrace(u: User, alertId: string, rawPins: unknown, ticks: string[], note: string): Promise<ActionResult & { version: number }> {
  must(u.role === "telco", "Only Telco-A staff save traces.");
  const a = alertById(alertId);
  must(a, "Unknown alert.");
  const pins = cleanPins(rawPins);
  must(pins.length > 0, "Pin something before saving.");
  const s = await store();
  const now = await demoNow(s);
  const before = fold(await s.chain(), now);
  must(!before.telcoByAlert.has(a.id), "This alert is already decided, so its trace is locked as the evidence on file.");
  const prev = before.traces.get(a.id);
  const version = (prev?.version ?? 0) + 1;
  ticks = (Array.isArray(ticks) ? ticks : []).filter((t): t is string => typeof t === "string" && t.length <= 40).slice(0, 10);
  const hash = traceHash(pins);
  must(!prev || prev.hash !== hash || prev.ticks.join() !== ticks.join(), "Nothing changed since your last save.");
  await s.append([{ at: now, actor: u.id, type: "TRACE_SAVED", caseId: a.cases[0] ?? "TELCO", payload: { alert: a.id, version, hash, pins, ticks: ticks.slice(0, 10), note: note.trim().slice(0, 500) } }],
    (c) => { const f = fold(c, now); must(!f.telcoByAlert.has(a.id), "This alert was just decided, so its trace is locked."); must((f.traces.get(a.id)?.version ?? 0) === version - 1, "Someone saved this trace at the same time. Reload and try again."); });
  return { message: `Trace saved (version ${version}, ${pins.length} pins).`, version };
}

export async function resetDemo(u: User): Promise<ActionResult> {
  must(u.role === "admin", "Only the admin resets the demo.");
  await (await store()).reset();
  // A half-built trace on RIG-1, so the demo can show work in progress (handset and its tower pinned, nothing else).
  const rig = W.rigs[0]!;
  const seedPins: PinRef[] = [{ kind: "handset", ref: rig.imei, label: rig.imei }, { kind: "tower", ref: rig.cell, label: rig.cell }];
  const s = await store();
  await s.append([{ at: await demoNow(s), actor: "imran", type: "TRACE_SAVED", caseId: alertById("RIG-1")?.cases[0] ?? "TELCO", payload: { alert: "RIG-1", version: 1, hash: traceHash(seedPins), pins: seedPins, ticks: [], note: "Started: handset and tower." } }]);
  return { message: "Demo reset: no holds, no messages, clock back to the start." };
}

export type { AccountView };
