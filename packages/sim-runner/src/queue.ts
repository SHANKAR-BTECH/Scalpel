/**
 * The officer's to-do order: who to act on first when only K accounts can be handled per hour.
 * Holds are Ruler-sized (exact traced amount); only the ORDER differs between queues.
 * The best-possible ("oracle") order needs the hidden answers, so the grader builds it, not this code.
 */
export interface QueueRow { account: string; traced: number; firstSeen: number; caseTotal?: number }
export type QueueName = "fcfs" | "biggest" | "biggestcase" | "signrule" | "scalpel";

const by = (rows: QueueRow[], key: (r: QueueRow) => number[]) =>
  [...rows].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return a.account < b.account ? -1 : 1;
  }).map((r) => r.account);

/** Planning assumptions (the grader tests other drain ratios too): mule money leaves 15% an hour, shop money 5× slower. */
export const MULE_DRAIN_PER_HOUR = 0.15;
export const ASSUMED_DRAIN_RATIO = 5;
export const atRiskPerHour = (traced: number, score: number): number =>
  traced * (score * MULE_DRAIN_PER_HOUR + (1 - score) * (MULE_DRAIN_PER_HOUR / ASSUMED_DRAIN_RATIO));

export function buildQueues(rows: QueueRow[], muleScore: Record<string, number>, signals: Record<string, string[]>): Record<QueueName, string[]> {
  return {
    /** First come, first served: in the order the stolen money was found arriving. */
    fcfs: by(rows, (r) => [r.firstSeen]),
    /** Biggest traced amount first. */
    biggest: by(rows, (r) => [-r.traced]),
    /** Biggest case first (v3's stronger simple rule): accounts whose complaint chain holds the most traced money, then own amount. */
    biggestcase: by(rows, (r) => [-(r.caseTotal ?? r.traced), -r.traced]),
    /** The simple rule to beat: accounts with 2+ warning signs first, then by amount. */
    signrule: by(rows, (r) => [(signals[r.account]?.length ?? 0) >= 2 ? 0 : 1, -r.traced]),
    /** Scalpel: money likely lost per hour of waiting = amount × (score × mule drain + (1 − score) × shop drain). */
    scalpel: by(rows, (r) => [-atRiskPerHour(r.traced, muleScore[r.account] ?? 0), -r.traced]),
  };
}

/** Hour in which each account is acted on, given K actions per hour. */
export const hourOf = (order: string[], k: number): Record<string, number> => Object.fromEntries(order.map((a, i) => [a, Math.floor(i / k)]));

/**
 * Traced money per case, given to each account. A case is the group of complaints whose victims paid the same
 * first account (engine's linkCampaigns). An account belongs to the case that put the most traced money in it.
 */
export function caseTotals(taint: Record<string, Record<string, number>>, victimCase: Record<string, string>): Record<string, number> {
  const total: Record<string, number> = {};
  const main: Record<string, string> = {};
  for (const [acct, byVictim] of Object.entries(taint)) {
    const perCase: Record<string, number> = {};
    for (const [v, p] of Object.entries(byVictim)) {
      const c = victimCase[v] ?? `victim:${v}`;
      perCase[c] = (perCase[c] ?? 0) + p;
      total[c] = (total[c] ?? 0) + p;
    }
    const best = Object.entries(perCase).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (best) main[acct] = best[0];
  }
  return Object.fromEntries(Object.entries(main).map(([a, c]) => [a, total[c]!]));
}
