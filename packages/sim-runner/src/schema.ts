/**
 * File contracts between the Python pipeline and this runner.
 * A bad file fails loudly here instead of giving silently wrong answers.
 */
import { z } from "zod";

const paise = z.number().int().nonnegative();
const instant = z.number().int();
const accountType = z.enum(["SAVINGS", "CURRENT", "SALARY", "NODAL", "POOL", "ESCROW"]);

export const WorldSchema = z.object({
  schema: z.literal("scalpel-world/1"),
  name: z.string(),
  seed: z.number().int(),
  /** The decision moment: everything in this file happened at or before it. */
  cutoff: instant,
  accounts: z.array(z.object({ id: z.string(), type: accountType, openedAt: instant, kycChangedAt: instant.nullable(), opening: paise })),
  txns: z.array(z.object({ id: z.string(), at: instant, from: z.string(), to: z.string(), amount: paise, channel: z.string() })),
  complaints: z.array(z.object({ id: z.string(), victim: z.string(), txnId: z.string(), reportedAt: instant })),
  phones: z.array(z.object({ account: z.string(), msisdn: z.string(), imei: z.string() })).optional(),
  telecom: z.object({
    simSwaps: z.array(z.object({ msisdn: z.string(), at: instant })),
    callForwarding: z.array(z.string()),
    mnrl: z.array(z.string()),
    fri: z.record(z.string(), z.enum(["LOW", "HIGH", "VERY_HIGH"])),
    simbox: z.array(z.string()),
  }).optional(),
});
export type World = z.infer<typeof WorldSchema>;

export const SIGNAL_NAMES = [
  "ACCOUNT_AGE_LT_30D", "DWELL_LT_15M", "GE3_CASE_LINKED_SENDERS", "KYC_CHANGED_LT_30D",
  "SIM_SWAP_LT_72H", "HANDSET_GT5_SIMS", "CALL_FORWARDING_ACTIVE", "MNRL_LISTED", "FRI_VERY_HIGH", "SIMBOX_ROUTE",
] as const;

export const SignalsSchema = z.object({ asOf: instant, signals: z.record(z.string(), z.array(z.enum(SIGNAL_NAMES))) });
export type SignalsFile = z.infer<typeof SignalsSchema>;

export const AssessmentsSchema = z.object({
  model: z.string(),
  accounts: z.record(z.string(), z.object({
    role: z.enum(["mule", "shield", "normal"]),
    muleScore: z.number().min(0).max(1),
    reasons: z.array(z.string().min(1)).length(3),
  })),
});
export type AssessmentsFile = z.infer<typeof AssessmentsSchema>;

export const HoldPolicy = z.enum(["0", "A", "B", "C"]);
export type HoldPolicy = z.infer<typeof HoldPolicy>;

export interface DecisionRow {
  account: string;
  type: string;
  balance: number;
  traced: number;
  action: "NONE" | "EXACT_HOLD" | "WHOLE_FREEZE" | "NOTICE_ONLY";
  held: number;
  /** Policy C: the planner would whole-freeze with officer confirmation. Never applied automatically. */
  suggestedWholeFreeze?: boolean;
  /** One plain line linking the action to the rule and the reasons. */
  line?: string;
}
export interface Decisions { world: string; policy: HoldPolicy; rows: DecisionRow[] }

function fail(what: string, err: z.ZodError): never {
  const msg = err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).slice(0, 5).join("; ");
  throw new Error(`Bad ${what}: ${msg}`);
}

export const parseWorld = (x: unknown): World => { const r = WorldSchema.safeParse(x); return r.success ? r.data : fail("world.json", r.error); };
export const parseSignals = (x: unknown): SignalsFile => { const r = SignalsSchema.safeParse(x); return r.success ? r.data : fail("signals.json", r.error); };
export const parseAssessments = (x: unknown): AssessmentsFile => { const r = AssessmentsSchema.safeParse(x); return r.success ? r.data : fail("assessments.json", r.error); };
