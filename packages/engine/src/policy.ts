/**
 * Rules as data. Code knows HOW to apply rules; YAML says WHAT they are, WHERE (state),
 * FROM WHEN (effective dates), HOW CERTAIN (status) and WHY (sources).
 */
import { z } from "zod";
import { load as yamlLoad } from "js-yaml";
import { STATES, HIGH_COURT_OF, type StateCode } from "./jurisdiction";
import { istStart, type Instant } from "./time";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Status = z.enum(["final", "draft", "contested", "assumed"]);
export type Status = z.infer<typeof Status>;

export const Source = z.object({
  id: z.string(),
  title: z.string(),
  issuer: z.string(),
  date: isoDate.optional(),
  ref: z.string().optional(),
  url: z.string().optional(),
  verified: z.boolean().default(false),
});
export type Source = z.infer<typeof Source>;

export const Regime = z.enum(["RBI_BANK", "MHA_POLICE", "NPCI_CHARGEBACK", "DIGITAL_SUSPENSION", "COURT_ORDER", "TRAI_UCC"]);
export type Regime = z.infer<typeof Regime>;

export const HoldEvent = z.enum([
  "HOLD_PLACED", "NOTICE_SENT", "REPLY_RECEIVED", "EXPLANATION_WINDOW_CLOSED", "GRM_UPLOADED", "IO_DECISION",
  "REFERRED_TO_LEA", "EXTENDED", "RELEASE_ALERT_SENT", "RELEASED", "CONVERTED", "COURT_ORDER_RECEIVED", "REVIEWED",
]);
export type HoldEvent = z.infer<typeof HoldEvent>;

export const Clock = z.object({
  id: z.string(),
  label: z.string(),
  starts_on: HoldEvent,
  days: z.number().int().nonnegative(),
  unit: z.enum(["calendar", "bank_working"]).default("calendar"),
  satisfied_by: z.array(HoldEvent).default([]),
  on_expiry: z.enum(["OVERDUE", "AUTO_RELEASE", "ESCALATE", "CONVERT", "DECIDE"]),
  convert_to: Regime.optional(),
  alert_before_days: z.number().int().nonnegative().default(0),
  amount_below: z.number().int().nonnegative().optional(), // paise; clock applies only below this held amount
  amount_at_least: z.number().int().nonnegative().optional(),
  extendable: z.object({ times: z.number().int().nonnegative(), days: z.number().int().positive() }).optional(),
  sources: z.array(z.string()).default([]),
  status: Status.optional(),
});
export type Clock = z.infer<typeof Clock>;

export const RegimeSpec = z.object({
  label: z.string(),
  status: Status,
  max_days: z.number().int().positive().nullable(),
  min_amount: z.number().int().nonnegative().default(0),
  exempt_account_types: z.array(z.string()).default([]),
  clocks: z.array(Clock),
  sources: z.array(z.string()).default([]),
});
export type RegimeSpec = z.infer<typeof RegimeSpec>;

export const GateParams = z.object({
  exact_hold_max_ratio_of_traced: z.number().positive().max(1),
  whole_account: z.object({ min_mule_score: z.number().min(0).max(1), min_signals: z.number().int(), officer_confirmation: z.boolean() }),
  fast_restoration_below: z.number().int(),
  protected_number_prefixes: z.array(z.string()),
  telecom_block: z.object({ min_signals: z.number().int(), min_telecom_signals: z.number().int() }),
  shield_max_action: z.enum(["EXACT_HOLD", "NOTICE_ONLY"]),
  bank_self_hold_min_signals: z.number().int(),
});
export type GateParams = z.infer<typeof GateParams>;

export const RequisitionCheck = z.object({
  id: z.string(),
  label: z.string(),
  applies_to: z.array(z.enum(["BNSS_106", "BNSS_107", "CRPC_102", "COURT_ORDER", "DOT_DIRECTION"])),
  severity: z.enum(["defect", "review"]),
  sources: z.array(z.string()).default([]),
  status: Status.default("final"),
});

export const PolicySet = z.object({
  id: z.string(),
  title: z.string(),
  status: Status,
  effective_from: isoDate,
  effective_to: isoDate.nullable().default(null),
  sources: z.array(Source),
  gate: GateParams,
  requisition: z.object({ magistrate_intimation_hours: z.number().int().positive(), min_signing_rank: z.string(), checks: z.array(RequisitionCheck) }),
  regimes: z.partialRecord(Regime, RegimeSpec),
});
export type PolicySet = z.infer<typeof PolicySet>;

export const PoliceFreezePower = z.enum(["allowed", "not_allowed", "unsettled"]);
export const Overlay = z.object({
  id: z.string(),
  high_court: z.string(),
  states: z.array(z.enum(STATES)),
  status: Status,
  effective_from: isoDate,
  effective_to: isoDate.nullable().default(null),
  police_debit_freeze_s106: PoliceFreezePower,
  notes: z.string().optional(),
  sources: z.array(z.string()),
});
export type Overlay = z.infer<typeof Overlay>;

export function parsePolicy(text: string): PolicySet {
  const p = PolicySet.parse(yamlLoad(text));
  const ids = new Set(p.sources.map((s) => s.id));
  const refs = [...Object.values(p.regimes).flatMap((r) => [...r.sources, ...r.clocks.flatMap((c) => c.sources)]), ...p.requisition.checks.flatMap((c) => c.sources)];
  for (const r of refs) if (!ids.has(r)) throw new Error(`policy ${p.id}: unknown source '${r}'`);
  return p;
}

/** Source ids that are not yet checked against the original (unknown ids count as unverified). */
export function unverifiedSources(policy: PolicySet, ids: readonly string[]): string[] {
  return ids.filter((id) => !policy.sources.find((s) => s.id === id)?.verified);
}

export function parseOverlay(text: string): Overlay {
  const o = Overlay.parse(yamlLoad(text));
  for (const s of o.states) if (HIGH_COURT_OF[s] !== o.high_court) throw new Error(`overlay ${o.id}: ${s} is under ${HIGH_COURT_OF[s]} HC, not ${o.high_court}`);
  return o;
}

const activeAt = (x: { effective_from: string; effective_to: string | null }, at: Instant) =>
  istStart(x.effective_from) <= at && (x.effective_to === null || at < istStart(x.effective_to));

/** Rules with dates: the version in force when the event happened. Newest wins; final beats draft on the same day. */
export function policyAt(sets: PolicySet[], at: Instant): PolicySet {
  const rank = { final: 3, contested: 2, draft: 1, assumed: 0 } as const;
  const live = sets.filter((s) => activeAt(s, at)).sort((a, b) => b.effective_from.localeCompare(a.effective_from) || rank[b.status] - rank[a.status]);
  if (!live[0]) throw new Error(`no policy in force at ${new Date(at).toISOString()}`);
  return live[0];
}

export interface JurisdictionView { state: StateCode; highCourt: string; power: z.infer<typeof PoliceFreezePower>; overlay?: Overlay }

export function jurisdictionAt(overlays: Overlay[], state: StateCode, at: Instant): JurisdictionView {
  const o = overlays.filter((x) => x.states.includes(state) && activeAt(x, at)).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  return { state, highCourt: HIGH_COURT_OF[state], power: o?.police_debit_freeze_s106 ?? "unsettled", overlay: o };
}

/** Strictest wins across all states touching a case (branch, police station, holder). */
export function strictestJurisdiction(overlays: Overlay[], states: StateCode[], at: Instant) {
  const views = [...new Set(states)].map((s) => jurisdictionAt(overlays, s, at));
  const order = { not_allowed: 0, unsettled: 1, allowed: 2 } as const;
  const strictest = views.reduce((a, b) => (order[b.power] < order[a.power] ? b : a));
  const conflict = new Set(views.map((v) => v.power)).size > 1;
  return { strictest, views, conflict };
}
