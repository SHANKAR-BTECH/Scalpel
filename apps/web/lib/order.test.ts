import { describe, expect, it } from "vitest";
import { atAction, chartRows, DRAWN, ORDER_COLOR } from "./order";

const band = (mean: number[]) => ({ x: [1, 5, 10], mean, min: mean.map((v) => v - 1), max: mean.map((v) => v + 1) });
const c = Object.fromEntries(DRAWN.map((n, i) => [n, band([10 + i, 50 + i, 90 + i])])) as never;

describe("order chart helpers", () => {
  it("builds one row per sampled action with a mean and a [min, max] band per order", () => {
    const rows = chartRows(c);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ x: 5, scalpel: 50, scalpelBand: [49, 51] });
  });
  it("reads the value at the nearest sampled action", () => {
    expect(atAction(c, "scalpel", 9)).toBe(90);
    expect(atAction(c, "scalpel", 2)).toBe(10);
  });
  it("gives every drawn order its own colour, with the oracle neutral", () => {
    expect(new Set(Object.values(ORDER_COLOR)).size).toBe(DRAWN.length);
    expect(ORDER_COLOR.oracle).toBe("var(--s-neutral)");
  });
});
