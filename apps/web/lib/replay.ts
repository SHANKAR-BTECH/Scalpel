import type { Lane } from "./demo-schema";

export const LAST_HOUR = 72;

/** Clamp to 0..72 and drop fractions, so the slider can never ask for a value that isn't there. */
export function hourIndex(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  return Math.min(LAST_HOUR, Math.max(0, Math.floor(hour)));
}

export function valuesAt(lane: Lane, hour: number) {
  const i = hourIndex(hour);
  return {
    secured: lane.securedPaise[i]!,
    gone: lane.victimMoneyGonePaise[i]!,
    innocentLocked: lane.innocentLockedPaise[i]!,
    people: lane.peopleRestricted[i]!,
    shops: lane.shopsHurt[i]!,
  };
}

export const LANE_LABEL = {
  none: "Do nothing",
  axe: "Whole freeze",
  biggest: "Exact hold, biggest first",
  scalpel: "Scalpel",
} as const;

export const LANE_NOTE = {
  none: "No holds.",
  axe: "Whole balance frozen, biggest accounts first.",
  biggest: "Exact traced amount, biggest accounts first.",
  scalpel: "Exact traced amount, in the mule-score model's order, with rule checks.",
} as const;
