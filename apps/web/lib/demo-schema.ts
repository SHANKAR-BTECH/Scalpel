/**
 * The one data file the website reads (built by `python -m scalpel_grade.demo_export`).
 * If the file is stale or broken, parsing fails and the build stops, rather than drawing wrong charts.
 */
import { z } from "zod";

const paise = z.number().int().nonnegative();
const hours73 = (t: z.ZodTypeAny) => z.array(t).length(73);

const Check = z.object({ rule: z.string(), ok: z.boolean(), note: z.string(), sources: z.array(z.string()), unverified: z.array(z.string()) });
const Clock = z.object({
  id: z.string(), label: z.string(), days: z.number(), startsOn: z.string(), dueAt: z.number().nullable(), onExpiry: z.string(),
  status: z.string().nullable(), sources: z.array(z.string()), unverified: z.array(z.string()),
});
export const Source = z.object({
  id: z.string(), title: z.string(), issuer: z.string().optional(), date: z.string().optional(), ref: z.string().optional(),
  url: z.string().optional(), verified: z.boolean().optional(),
}).passthrough();
export const MemoCase = z.object({
  account: z.string(), type: z.string(), balancePaise: paise, tracedPaise: paise, action: z.string(), heldPaise: paise,
  suggestedWholeFreeze: z.boolean(), regime: z.string().nullable(), regimeLabel: z.string().nullable(), ncrpAck: z.string(),
  requisitionBasis: z.string(), layer: z.number().nullable(),
  hops: z.array(z.object({ utr: z.string(), at: z.number(), from: z.string(), to: z.string(), amountPaise: paise, taintPaise: paise, layer: z.number().nullable() })),
  muleScore: z.number().min(0).max(1), reasons: z.array(z.string()), signals: z.array(z.string()),
  requisitionStatus: z.string(), requisitionChecks: z.array(Check), jurisdiction: z.string(),
  checks: z.array(Check), badges: z.object({ allowed: z.boolean(), sized: z.boolean(), timed: z.boolean() }),
  wholeFreezeChecks: z.array(Check).nullable(), clocks: z.array(Clock),
  quashRisksAfter: z.array(z.object({ id: z.string(), ground: z.string() })), flags: z.array(z.string()),
});
const Head = z.object({
  freezeRatio: z.number().nullable(), heldPaise: paise, victimMoneyPaise: paise, victimMoneyMissedPaise: paise,
  innocentHeldPaise: paise, peopleWronglyRestricted: z.number().int(), accountsHeld: z.number().int(),
});
const HeadV2 = z.object({ freezeRatio: z.number(), victimMoneyMissedPaise: paise, victimMoneyPaise: paise, innocentHeldPaise: paise, peopleWronglyRestricted: z.number().int() });
export const LANE_KEYS = ["none", "axe", "biggest", "scalpel"] as const;
export const POLICY_KEYS = ["none", "axe", "ruler", "scalpel"] as const;
export const ORDER_KEYS = ["fcfs", "biggest", "signrule", "scalpel", "oracle"] as const;
const Buckets = z.object({ securedPaise: paise, neverComplainedPaise: paise, reportedGoneBeforeHoldPaise: paise, reportedNotReachedOrNotTracedPaise: paise });
export const Lane = z.object({
  securedPaise: hours73(paise), victimMoneyGonePaise: hours73(paise), innocentLockedPaise: hours73(paise),
  peopleRestricted: hours73(z.number().int()), shopsHurt: hours73(z.number().int()), buckets: Buckets,
});
const Band = z.object({ x: z.array(z.number().int()), mean: z.array(z.number()), min: z.array(z.number()), max: z.array(z.number()) });

export const DemoData = z.object({
  schema: z.literal("scalpel-demo/3"),
  label: z.literal("simulated"),
  world: z.object({ name: z.string(), accounts: z.number(), complaints: z.number(), victims: z.number(), reportRate: z.number(), muleDrainPerHour: z.number(), drainRatio: z.number() }),
  headline: z.object(Object.fromEntries(POLICY_KEYS.map((k) => [k, Head])) as Record<(typeof POLICY_KEYS)[number], typeof Head>),
  headlineV2: z.object(Object.fromEntries(POLICY_KEYS.map((k) => [k, HeadV2])) as Record<(typeof POLICY_KEYS)[number], typeof HeadV2>),
  replay: z.object({
    k: z.number().int(), hours: z.literal(72),
    timeline: z.array(z.object({ day: z.number().int(), victimPaidPaise: paise, complaints: z.number().int() })).length(30),
    lanes: z.object(Object.fromEntries(LANE_KEYS.map((k) => [k, Lane])) as Record<(typeof LANE_KEYS)[number], typeof Lane>),
  }),
  order: z.object({
    source: z.string(),
    byK: z.record(z.string(), z.object(Object.fromEntries(ORDER_KEYS.map((k) => [k, Band])) as Record<(typeof ORDER_KEYS)[number], typeof Band>)),
    caption: z.array(z.string()),
    v3: z.unknown().nullable(),
  }),
  worst: z.array(z.object({ world: z.string(), account: z.string(), reallyMule: z.boolean(), muleScore: z.number(), tracedPaise: paise, reasons: z.array(z.string()) })),
  memo: z.object({ policyId: z.string(), policyStatus: z.string(), sources: z.array(Source), cases: z.array(MemoCase).min(1) }),
  provenance: z.object({ commit: z.string(), demoSha256: z.string().regex(/^[0-9a-f]{64}$/), policyId: z.string(), generatedAt: z.string() }),
});
export type DemoData = z.infer<typeof DemoData>;
export type MemoCase = z.infer<typeof MemoCase>;
export type Lane = z.infer<typeof Lane>;
export type Source = z.infer<typeof Source>;
