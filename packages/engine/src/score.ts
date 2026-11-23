/**
 * Scorer: benefit minus harm, in rupee terms, using ESTIMATES only (never hidden truth).
 * score = saved_now + protected_future - (w1*innocent + w2*people + w3*livelihood_days + w4*genuine_subscribers)
 * Defaults: w1 = 1 per rupee, w2 = Rs 10,000/person, w3 = Rs 1,000/day, w4 = Rs 2,000/subscriber.
 * One slider (harmMultiplier) scales all harm weights for the "how cautious" demo.
 */
import type { Paise } from "./money";
import { evaluateGate, type Action, type GateContext, type GateResult } from "./gate";
import type { PolicySet } from "./policy";

export interface Weights { innocentPerPaise: number; perPerson: Paise; perLivelihoodDay: Paise; perSubscriber: Paise }
export const DEFAULT_WEIGHTS: Weights = { innocentPerPaise: 1, perPerson: 1_000_000, perLivelihoodDay: 100_000, perSubscriber: 200_000 };

export interface Assumptions {
  /** expected days a restriction lasts (for livelihood harm) */
  expectedHoldDays: number;
  /** estimated victim money per day that would flow into a live mule account */
  futureInflowPerDay: Paise;
  /** days of future use prevented by a whole freeze / block */
  horizonDays: number;
  /** telecom: scam calls per day from the number/handset (assumed, unverified) */
  scamCallsPerDay: number;
  /** telecom: share of calls that turn into a loss (assumed 0.005, unverified) */
  conversion: number;
  avgLossPerVictim: Paise;
  genuineSubscribersOnHandset: number;
}
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  expectedHoldDays: 30, futureInflowPerDay: 2_000_000, horizonDays: 7, scamCallsPerDay: 200, conversion: 0.005, avgLossPerVictim: 3_000_000, genuineSubscribersOnHandset: 0,
};

export interface ScoreBreakdown {
  savedNow: Paise; protectedFuture: Paise; innocent: Paise; people: number; livelihoodDays: number; subscribers: number;
  harm: Paise; score: Paise;
}

export function scoreAction(action: Action | null, ctx: GateContext, w: Weights = DEFAULT_WEIGHTS, a: Assumptions = DEFAULT_ASSUMPTIONS, harmMultiplier = 1): ScoreBreakdown {
  const pMule = ctx.assessment.muleScore;
  let savedNow = 0, protectedFuture = 0, innocent = 0, people = 0, livelihoodDays = 0, subscribers = 0;
  const acct = ctx.account;
  if (action && acct && (action.kind === "EXACT_HOLD" || action.kind === "WHOLE_FREEZE")) {
    const held = action.kind === "WHOLE_FREEZE" ? acct.balance : action.amount;
    savedNow = Math.min(held, acct.traced);
    innocent = Math.max(0, held - acct.traced);
    const usable = acct.balance - held;
    people = (1 - pMule) * (action.kind === "WHOLE_FREEZE" || usable === 0 ? 1 : 0.2);
    if (action.kind === "WHOLE_FREEZE") {
      protectedFuture = Math.round(pMule * a.futureInflowPerDay * a.horizonDays);
      if (acct.type === "CURRENT" || acct.type === "SALARY") livelihoodDays = (1 - pMule) * a.expectedHoldDays;
    }
  } else if (action && (action.kind === "MSISDN_BLOCK" || action.kind === "IMEI_BLOCK")) {
    protectedFuture = Math.round(pMule * a.scamCallsPerDay * a.horizonDays * a.conversion * a.avgLossPerVictim);
    people = 1 - pMule;
    subscribers = action.kind === "IMEI_BLOCK" ? a.genuineSubscribersOnHandset : 0;
  }
  const harm = Math.round(harmMultiplier * (w.innocentPerPaise * innocent + w.perPerson * people + w.perLivelihoodDay * livelihoodDays + w.perSubscriber * subscribers));
  return { savedNow, protectedFuture, innocent, people, livelihoodDays, subscribers, harm, score: savedNow + protectedFuture - harm };
}

export interface PlannedStep { candidate: Action; gate: GateResult; score: ScoreBreakdown }

/** Try every candidate through the Gate, keep the best allowed one. Tie-break: lower harm, then action kind. */
export function planAccount(candidates: Action[], ctx: GateContext, policy: PolicySet, opts: { weights?: Weights; assumptions?: Assumptions; harmMultiplier?: number } = {}) {
  const steps: PlannedStep[] = candidates.map((c) => {
    const gate = evaluateGate(c, ctx, policy);
    return { candidate: c, gate, score: scoreAction(gate.action, ctx, opts.weights, opts.assumptions, opts.harmMultiplier) };
  });
  const viable = steps.filter((s) => s.gate.action !== null);
  viable.sort((x, y) => y.score.score - x.score.score || x.score.harm - y.score.harm || x.candidate.kind.localeCompare(y.candidate.kind));
  return { best: viable[0] ?? null, steps };
}

/** Freeze Ratio = money held / traced victim money. Industry figure reported: 15.12x. */
export const freezeRatio = (held: Paise, traced: Paise) => (traced === 0 ? (held === 0 ? 0 : Infinity) : held / traced);
