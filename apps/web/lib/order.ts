import type { DemoData } from "./demo-schema";

export const ORDER_LABEL = {
  scalpel: "Mule-score model (money likely lost per hour)",
  biggest: "Biggest amount first",
  signrule: "Warning-sign rule (2+ signs first)",
  fcfs: "First come, first served",
  oracle: "Best possible (knows the answers)",
  biggestcase: "Biggest case first",
  ceiling: "Perfect knowledge of who is a mule (ceiling)",
} as const;

/** Colour follows the order, never its rank. The oracle is a dashed neutral reference line. */
export const ORDER_COLOR = { scalpel: "var(--s1)", biggest: "var(--s2)", signrule: "var(--s3)", fcfs: "var(--s4)", oracle: "var(--s-neutral)" } as const;
export const DRAWN = ["scalpel", "biggest", "signrule", "fcfs", "oracle"] as const;

export type Curves = DemoData["order"]["byK"][string];

/** One row per sampled action: { x, scalpel, scalpelBand: [min, max], ... } for the chart. */
export function chartRows(c: Curves) {
  return c.scalpel.x.map((x, i) => {
    const row: Record<string, number | [number, number]> = { x };
    for (const n of DRAWN) {
      row[n] = c[n].mean[i]!;
      row[`${n}Band`] = [c[n].min[i]!, c[n].max[i]!];
    }
    return row;
  });
}

/** Mean % of best possible at the sampled action nearest to `action` (for the table view). */
export function atAction(c: Curves, name: (typeof DRAWN)[number], action: number): number {
  const xs = c[name].x;
  let best = 0;
  for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i]! - action) < Math.abs(xs[best]! - action)) best = i;
  return c[name].mean[best]!;
}

export const pct = (v: number) => `${v.toFixed(1)}%`;
