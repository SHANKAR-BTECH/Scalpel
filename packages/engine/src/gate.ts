/**
 * The Gate: every proposed action must pass Allowed? Right size? On time?
 * It may ALLOW, MODIFY (e.g. whole freeze -> exact hold), ROUTE (send to Magistrate / back to IO) or DENY.
 * It only sees observed signals and the model's estimate, never hidden truth.
 */
import type { Paise } from "./money";
import { formatINR } from "./money";
import type { Instant } from "./time";
import { unverifiedSources, type PolicySet, type Regime } from "./policy";
import type { RequisitionResult } from "./requisition";

export const BANK_SIGNALS = ["ACCOUNT_AGE_LT_30D", "DWELL_LT_15M", "GE3_CASE_LINKED_SENDERS", "KYC_CHANGED_LT_30D"] as const;
export const TELECOM_SIGNALS = ["SIM_SWAP_LT_72H", "HANDSET_GT5_SIMS", "CALL_FORWARDING_ACTIVE", "MNRL_LISTED", "FRI_VERY_HIGH", "SIMBOX_ROUTE"] as const;
export type Signal = (typeof BANK_SIGNALS)[number] | (typeof TELECOM_SIGNALS)[number];
export const isTelecomSignal = (s: Signal) => (TELECOM_SIGNALS as readonly string[]).includes(s);

export type AccountType = "SAVINGS" | "CURRENT" | "SALARY" | "NODAL" | "POOL" | "ESCROW";
export type Role = "mule" | "shield" | "normal";

export type Action =
  | { kind: "EXACT_HOLD"; account: string; amount: Paise }
  | { kind: "WHOLE_FREEZE"; account: string }
  | { kind: "NOTICE_ONLY"; account: string }
  | { kind: "MSISDN_BLOCK"; msisdn: string }
  | { kind: "IMEI_BLOCK"; imei: string };

export type Requester = "POLICE" | "MAGISTRATE" | "COURT" | "BANK_SELF" | "TELCO_SELF" | "DOT";

export interface GateContext {
  at: Instant;
  requester: Requester;
  requisition?: RequisitionResult;
  account?: { id: string; type: AccountType; balance: Paise; traced: Paise };
  assessment: { role: Role; muleScore: number; signals: Signal[] };
  officerConfirmed: boolean;
  evidenceRecordId?: string;
  msisdn?: { number: string; spoofSuspected: boolean };
}

export type RuleId = "R0" | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9";
export interface Check { rule: RuleId; ok: boolean; note: string; sources: string[]; /** cited sources not yet verified: show "unverified" */ unverified: string[] }
export interface QuashRisk { id: string; ground: string }

export interface GateResult {
  decision: "ALLOW" | "MODIFY" | "ROUTE" | "DENY";
  original: Action;
  action: Action | null;
  regime: Regime | null;
  checks: Check[];
  badges: { allowed: boolean; sized: boolean; timed: boolean };
  flags: string[];
  quashRisksBefore: QuashRisk[];
  quashRisksAfter: QuashRisk[];
  fastRestoration: boolean;
}

const digits = (n: string) => n.replace(/\D/g, "").replace(/^91(?=\d{10,})/, "");

function regimeFor(r: Requester): Regime | null {
  if (r === "POLICE") return "MHA_POLICE";
  if (r === "MAGISTRATE" || r === "COURT") return "COURT_ORDER";
  if (r === "BANK_SELF") return "RBI_BANK";
  if (r === "TELCO_SELF" || r === "DOT") return "TRAI_UCC";
  return null;
}

export function quashRisks(action: Action | null, ctx: GateContext, regime: Regime | null, policy: PolicySet): QuashRisk[] {
  const out: QuashRisk[] = [];
  if (!action || !ctx.account) return out;
  const a = ctx.account;
  const held = action.kind === "WHOLE_FREEZE" ? a.balance : action.kind === "EXACT_HOLD" ? action.amount : 0;
  if (action.kind === "WHOLE_FREEZE") out.push({ id: "Q1", ground: "Whole account frozen instead of the traced amount" });
  if (held > a.traced) out.push({ id: "Q2", ground: `Holds ${formatINR(held - a.traced)} more than the traced victim money` });
  const spec = regime ? policy.regimes[regime] : undefined;
  if (held > 0 && (!spec || (spec.max_days === null && spec.clocks.length === 0 && regime !== "COURT_ORDER"))) out.push({ id: "Q4", ground: "No time limit on the hold" });
  const req = ctx.requisition;
  // Police-specific grounds apply only while the hold runs under the police regime (not after the bank takes over under RBI rules).
  if (req && ctx.requester === "POLICE" && regime === "MHA_POLICE") {
    if (req.route) out.push({ id: "Q5", ground: `Police debit freeze under s.106 is not allowed in ${req.jurisdiction.strictest.highCourt} High Court's area` });
    if (req.findings.some((f) => f.checkId === "case_reference" && !f.ok)) out.push({ id: "Q6", ground: "No FIR / NCRP particulars" });
    if (req.findings.some((f) => f.checkId === "magistrate_intimation" && !f.ok && !f.pending)) out.push({ id: "Q7", ground: "Magistrate not informed in time" });
  }
  if (ctx.assessment.role === "shield" && action.kind === "WHOLE_FREEZE") out.push({ id: "Q8", ground: "Likely innocent recipient fully frozen" });
  if (action.kind === "WHOLE_FREEZE" && a.type === "CURRENT") out.push({ id: "Q9", ground: "Business account fully frozen: livelihood harm" });
  return out;
}

export function evaluateGate(original: Action, ctx: GateContext, policy: PolicySet): GateResult {
  const g = policy.gate;
  const checks: Check[] = [];
  const flags: string[] = [];
  const ok = (rule: RuleId, pass: boolean, note: string, sources: string[] = []) => { checks.push({ rule, ok: pass, note, sources, unverified: unverifiedSources(policy, sources) }); return pass; };
  let regime = regimeFor(ctx.requester);
  let action: Action | null = original;
  let decision: GateResult["decision"] = "ALLOW";
  const modify = () => { if (decision === "ALLOW") decision = "MODIFY"; };
  const signals = [...new Set(ctx.assessment.signals)];
  const done = (): GateResult => {
    const spec = regime ? policy.regimes[regime] : undefined;
    const isMoney = action?.kind === "EXACT_HOLD" || action?.kind === "WHOLE_FREEZE";
    const held = action?.kind === "WHOLE_FREEZE" ? ctx.account?.balance ?? 0 : action?.kind === "EXACT_HOLD" ? action.amount : 0;
    const fast = isMoney && held < g.fast_restoration_below;
    if (fast) ok("R4", true, `Under ${formatINR(g.fast_restoration_below)}: fast restoration path, no court needed`, ["mha-sop-2026-01"]);
    const timed = !isMoney || (spec !== undefined && (spec.max_days !== null || spec.clocks.length > 0 || regime === "COURT_ORDER"));
    if (isMoney && spec) ok("R3", timed, spec.max_days ? `${spec.label}: at most ${spec.max_days} days, ${spec.clocks.length} deadlines tracked` : `${spec.label}: ${spec.clocks.length} deadlines tracked`, spec.sources);
    if (spec && spec.status !== "final") flags.push(`${spec.label} rules are ${spec.status}`);
    if (checks.some((c) => c.unverified.length > 0)) flags.push("Some cited sources are unverified");
    return {
      decision, original, action, regime: action ? regime : null, checks, flags,
      badges: {
        allowed: decision === "ALLOW" || decision === "MODIFY",
        sized: !ctx.account || held <= ctx.account.traced,
        timed,
      },
      quashRisksBefore: quashRisks(original, ctx, regimeFor(ctx.requester), policy),
      quashRisksAfter: decision === "ROUTE" || decision === "DENY" ? [] : quashRisks(action, ctx, regime, policy),
      fastRestoration: fast,
    };
  };
  const stop = (d: "ROUTE" | "DENY") => { decision = d; action = null; return done(); };

  // R9: no action without an evidence record
  if (!ok("R9", Boolean(ctx.evidenceRecordId), ctx.evidenceRecordId ? `Evidence record ${ctx.evidenceRecordId}` : "Create the evidence record first")) return stop("DENY");

  // Telecom actions: R5, R6, R7
  if (original.kind === "MSISDN_BLOCK" || original.kind === "IMEI_BLOCK") {
    if (original.kind === "MSISDN_BLOCK") {
      const d = digits(original.msisdn);
      const prot = g.protected_number_prefixes.find((p) => d.startsWith(p));
      if (!ok("R5", !prot, prot ? `${prot}-series numbers belong to registered businesses and are never blocked` : "Not a protected series")) return stop("DENY");
      if (!ok("R6", !ctx.msisdn?.spoofSuspected, ctx.msisdn?.spoofSuspected ? "Displayed number is likely spoofed; blocking it would hurt the real owner. Trace the real origin instead." : "No spoofing suspected")) return stop("DENY");
    }
    const tel = signals.filter(isTelecomSignal).length;
    const pass = signals.length >= g.telecom_block.min_signals && tel >= g.telecom_block.min_telecom_signals;
    if (!ok("R7", pass, `${signals.length} signals (${tel} telecom); needs ${g.telecom_block.min_signals} incl. ${g.telecom_block.min_telecom_signals} telecom`, ["trai-tcccpr-3", "dot-fri"])) return stop("DENY");
    return done();
  }

  const acct = ctx.account;
  if (!acct) throw new Error("bank action without account context");

  // R0: authority (who asks, in which state, is the request valid)
  if (ctx.requester === "POLICE") {
    const req = ctx.requisition;
    if (!req) { ok("R0", false, "Police action needs a checked requisition"); return stop("ROUTE"); }
    const usable = req.status !== "DEFECTIVE" && req.authority !== "NONE";
    if (!usable) {
      const own = signals.length >= g.bank_self_hold_min_signals && ctx.assessment.role === "mule";
      const why = req.route ? `Police alone cannot freeze here (${req.jurisdiction.strictest.highCourt} HC)` : "Request is defective";
      if (own && acct.traced > 0) {
        ok("R0", true, `${why}. Bank's own signals are strong (${signals.length}), so the bank places its own exact hold under RBI rules and returns the memo to the officer.`, ["rbi-draft-mule-2026"]);
        regime = "RBI_BANK";
        action = { kind: "EXACT_HOLD", account: acct.id, amount: acct.traced };
        modify();
        flags.push("Bank-initiated fallback hold");
      } else {
        ok("R0", false, `${why}. Bank's own signals are not enough for a hold. Send the memo to the officer now.`);
        return stop("ROUTE");
      }
    } else {
      ok("R0", true, req.status === "NEEDS_REVIEW" ? "Request usable; items pending review" : "Valid request with authority in this state");
      if (req.status === "NEEDS_REVIEW") flags.push("Requisition items pending");
      if (req.jurisdiction.conflict) flags.push("States involved follow different rulings; strictest applied");
      if (req.authority === "EXACT_ONLY") flags.push("No binding ruling in this state: exact-amount holds only");
      if (req.authority === "EXACT_ONLY" && action.kind === "WHOLE_FREEZE") {
        action = { kind: "EXACT_HOLD", account: acct.id, amount: acct.traced }; modify();
      }
    }
  } else if (ctx.requester === "BANK_SELF") {
    const spec = policy.regimes.RBI_BANK;
    if (spec?.exempt_account_types.includes(acct.type)) { ok("R0", false, `${acct.type} accounts are exempt from bank-initiated holds`, spec.sources); return stop("DENY"); }
    if (!ok("R0", signals.length >= g.bank_self_hold_min_signals, `Bank's own signals: ${signals.length} (needs ${g.bank_self_hold_min_signals})`, spec?.sources ?? [])) return stop("DENY");
  } else if (ctx.requester === "MAGISTRATE" || ctx.requester === "COURT") {
    ok("R0", true, "Judicial order: Scalpel does not override it");
    if (original.kind === "EXACT_HOLD" && original.amount > acct.traced) flags.push(`Order exceeds traced amount by ${formatINR(original.amount - acct.traced)}; tell the court`);
    if (original.kind === "WHOLE_FREEZE" && acct.balance > acct.traced) flags.push("Order freezes more than the traced amount; tell the court");
    return done();
  }

  // R8: likely-innocent recipients get an exact hold (or notice) only
  if (ctx.assessment.role === "shield" && action.kind === "WHOLE_FREEZE") {
    ok("R8", false, "Likely innocent recipient: exact hold and notice only", []);
    action = g.shield_max_action === "NOTICE_ONLY" ? { kind: "NOTICE_ONLY", account: acct.id } : { kind: "EXACT_HOLD", account: acct.id, amount: acct.traced };
    modify();
  }

  // R2: whole-account freeze only as a last resort
  if (action.kind === "WHOLE_FREEZE") {
    const w = g.whole_account;
    const pass = ctx.assessment.muleScore >= w.min_mule_score && signals.length >= w.min_signals && (!w.officer_confirmation || ctx.officerConfirmed);
    ok("R2", pass, `Mule score ${ctx.assessment.muleScore.toFixed(2)} (needs ${w.min_mule_score}), ${signals.length} signals (needs ${w.min_signals})${w.officer_confirmation ? `, officer confirmation ${ctx.officerConfirmed ? "given" : "missing"}` : ""}`);
    if (!pass) { action = { kind: "EXACT_HOLD", account: acct.id, amount: acct.traced }; modify(); }
  }

  // R1: exact hold never above traced victim money
  if (action.kind === "EXACT_HOLD") {
    const cap = Math.floor(acct.traced * g.exact_hold_max_ratio_of_traced);
    if (cap <= 0) { ok("R1", false, "No victim money traced into this account: nothing to hold"); return stop("DENY"); }
    const min = regime ? policy.regimes[regime]?.min_amount ?? 0 : 0;
    if (cap < min) { ok("R1", false, `Traced ${formatINR(cap)} is below the ${formatINR(min)} minimum for this kind of hold`); return stop("DENY"); }
    if (action.amount > cap) {
      ok("R1", false, `Asked ${formatINR(action.amount)}; traced victim money is ${formatINR(cap)}. Hold reduced.`, ["himanshu-gupta"]);
      action = { ...action, amount: cap }; modify();
    } else ok("R1", true, `Hold ${formatINR(action.amount)} ≤ traced ${formatINR(cap)}`);
  }
  return done();
}
