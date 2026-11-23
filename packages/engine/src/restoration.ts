/**
 * Restoration: give recovered money back to victims in the right shares.
 * Each victim's claim on this account = their money traced here (from trace()),
 * capped at what they lost minus what has already been repaid to them elsewhere.
 * Recovered money is split in proportion to claims; nobody gets more than their claim,
 * parts add up exactly to the paisa, and anything beyond all claims is "leftover"
 * (it is the account holder's own money and goes back to them, not to victims).
 */
import { type Paise, assertPaise, splitProportional, sum } from "./money";
import type { VictimId } from "./trace";

export interface RestoreInput {
  /** Money released from the hold for restoration. */
  recovered: Paise;
  /** Each victim's money still in this account, from trace().accounts[id].taint. */
  taint: Record<VictimId, Paise>;
  /** Total each victim lost, from trace().victimPaid. */
  lost: Record<VictimId, Paise>;
  /** Already repaid to each victim from other accounts. */
  alreadyRepaid?: Record<VictimId, Paise>;
}

export interface RestoreResult {
  perVictim: Record<VictimId, Paise>;
  leftover: Paise;
}

export function restore(input: RestoreInput): RestoreResult {
  const { recovered, taint, lost, alreadyRepaid = {} } = input;
  assertPaise(recovered, "recovered");
  const claims: Record<VictimId, Paise> = {};
  for (const [v, t] of Object.entries(taint)) {
    assertPaise(t, `taint ${v}`);
    const l = lost[v] ?? 0, r = alreadyRepaid[v] ?? 0;
    assertPaise(l, `lost ${v}`);
    assertPaise(r, `alreadyRepaid ${v}`);
    const claim = Math.min(t, Math.max(0, l - r));
    if (claim > 0) claims[v] = claim;
  }
  const totalClaim = sum(Object.values(claims));
  const toSplit = Math.min(recovered, totalClaim);
  const perVictim = Object.fromEntries(
    Object.entries(splitProportional(toSplit, claims, totalClaim)).filter(([, p]) => p > 0),
  ) as Record<VictimId, Paise>;
  return { perVictim, leftover: recovered - sum(Object.values(perVictim)) };
}
