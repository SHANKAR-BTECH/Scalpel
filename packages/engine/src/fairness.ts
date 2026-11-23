/**
 * Fairness report: how much was held compared with the victim money really traced,
 * how much innocent money got caught, overall and per group (e.g. account type,
 * or shield vs mule estimate). Groups are labels the caller passes in; this code
 * never reads hidden truth (truth.json).
 */
import { type Paise, assertPaise } from "./money";
import { freezeRatio } from "./score";

export interface FairnessRow { account: string; held: Paise; traced: Paise; group: string }
export interface FairnessStats {
  held: Paise;
  traced: Paise;
  /** held ÷ traced (Infinity if money is held but nothing was traced; 0 if neither). */
  freezeRatio: number;
  /** Sum over accounts of held − traced, never below 0 for any one account. */
  innocentHeld: Paise;
  accounts: number;
}
export interface FairnessReport { overall: FairnessStats; byGroup: Record<string, FairnessStats> }

const empty = () => ({ held: 0, traced: 0, innocentHeld: 0, accounts: 0 });
const finish = (s: ReturnType<typeof empty>): FairnessStats => ({ ...s, freezeRatio: freezeRatio(s.held, s.traced) });

export function fairnessReport(rows: FairnessRow[]): FairnessReport {
  const overall = empty();
  const groups: Record<string, ReturnType<typeof empty>> = {};
  for (const r of rows) {
    assertPaise(r.held, `held ${r.account}`);
    assertPaise(r.traced, `traced ${r.account}`);
    const innocent = Math.max(0, r.held - r.traced);
    for (const s of [overall, (groups[r.group] ??= empty())]) {
      s.held += r.held;
      s.traced += r.traced;
      s.innocentHeld += innocent;
      s.accounts += 1;
    }
  }
  return { overall: finish(overall), byGroup: Object.fromEntries(Object.entries(groups).map(([g, s]) => [g, finish(s)])) };
}
