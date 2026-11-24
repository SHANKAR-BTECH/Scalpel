import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { fairnessReport } from "../src/fairness";
import { rupees } from "../src/money";

describe("fairness report", () => {
  it("whole freeze: ₹4,53,600 held for ₹30,000 traced gives the story's own ratio of 15.12x", () => {
    const r = fairnessReport([{ account: "M1", held: rupees(453_600), traced: rupees(30_000), group: "SAVINGS" }]);
    expect(r.overall.freezeRatio).toBeCloseTo(15.12, 10);
    expect(r.overall.innocentHeld).toBe(rupees(423_600));
    expect(r.overall.accounts).toBe(1);
  });

  it("exact hold: held equals traced gives ratio 1 and no innocent money held", () => {
    const r = fairnessReport([{ account: "M1", held: rupees(30_000), traced: rupees(30_000), group: "SAVINGS" }]);
    expect(r.overall.freezeRatio).toBe(1);
    expect(r.overall.innocentHeld).toBe(0);
  });

  it("holding less than traced never counts as negative innocent money", () => {
    const r = fairnessReport([{ account: "M1", held: rupees(10_000), traced: rupees(30_000), group: "SAVINGS" }]);
    expect(r.overall.innocentHeld).toBe(0);
    expect(r.overall.freezeRatio).toBeCloseTo(1 / 3, 10);
  });

  it("groups: each group is right and the overall is the sum of the groups", () => {
    const r = fairnessReport([
      { account: "S1", held: rupees(50_000), traced: rupees(20_000), group: "SAVINGS" },
      { account: "S2", held: rupees(10_000), traced: rupees(10_000), group: "SAVINGS" },
      { account: "C1", held: rupees(2_00_000), traced: rupees(25_000), group: "CURRENT" },
    ]);
    expect(r.byGroup.SAVINGS).toEqual({ held: rupees(60_000), traced: rupees(30_000), freezeRatio: 2, innocentHeld: rupees(30_000), victimMoneyNotHeld: 0, recoveryRate: 1, accounts: 2 });
    expect(r.byGroup.CURRENT).toEqual({ held: rupees(2_00_000), traced: rupees(25_000), freezeRatio: 8, innocentHeld: rupees(1_75_000), victimMoneyNotHeld: 0, recoveryRate: 1, accounts: 1 });
    expect(r.overall).toEqual({ held: rupees(2_60_000), traced: rupees(55_000), freezeRatio: 260 / 55, innocentHeld: rupees(2_05_000), victimMoneyNotHeld: 0, recoveryRate: 1, accounts: 3 });
  });

  it("nothing traced and nothing held: ratio 0, not an error; empty list is fine too", () => {
    expect(fairnessReport([{ account: "N1", held: 0, traced: 0, group: "SAVINGS" }]).overall.freezeRatio).toBe(0);
    expect(fairnessReport([])).toEqual({ overall: { held: 0, traced: 0, freezeRatio: 0, innocentHeld: 0, victimMoneyNotHeld: 0, recoveryRate: "no-trace", accounts: 0 }, byGroup: {} });
  });

  it("rejects bad amounts", () => {
    expect(() => fairnessReport([{ account: "X", held: -1, traced: 0, group: "G" }])).toThrow(RangeError);
  });

  it("random worlds: groups always add up to the overall", () => {
    const row = fc.record({ account: fc.string(), held: fc.integer({ min: 0, max: 1e9 }), traced: fc.integer({ min: 0, max: 1e9 }), group: fc.constantFrom("A", "B", "C") });
    fc.assert(fc.property(fc.array(row, { maxLength: 30 }), (rows) => {
      const r = fairnessReport(rows);
      const gs = Object.values(r.byGroup);
      expect(gs.reduce((s, g) => s + g.held, 0)).toBe(r.overall.held);
      expect(gs.reduce((s, g) => s + g.traced, 0)).toBe(r.overall.traced);
      expect(gs.reduce((s, g) => s + g.innocentHeld, 0)).toBe(r.overall.innocentHeld);
      expect(gs.reduce((s, g) => s + g.accounts, 0)).toBe(rows.length);
      expect(r.overall.innocentHeld).toBeLessThanOrEqual(r.overall.held);
    }), { numRuns: 1000 });
  });
});

describe("fairness report: money missed and recovery (phase 2 fixes)", () => {
  it("holding nothing no longer looks perfect: ₹30,000 traced, nothing held", () => {
    const r = fairnessReport([{ account: "M1", held: 0, traced: rupees(30_000), group: "SAVINGS" }]);
    expect(r.overall.freezeRatio).toBe(0);
    expect(r.overall.victimMoneyNotHeld).toBe(rupees(30_000));
    expect(r.overall.recoveryRate).toBe(0);
  });

  it("phase 1 story: the whole freeze (15.12x its traced money) misses nothing and recovers 100%", () => {
    const r = fairnessReport([{ account: "M1", held: rupees(453_600), traced: rupees(30_000), group: "SAVINGS" }]);
    expect(r.overall.victimMoneyNotHeld).toBe(0);
    expect(r.overall.recoveryRate).toBe(1);
  });

  it("money held but nothing traced is reported as 'no-trace', and survives JSON", () => {
    const r = fairnessReport([{ account: "X", held: rupees(10_000), traced: 0, group: "SAVINGS" }]);
    expect(r.overall.freezeRatio).toBe("no-trace");
    expect(JSON.parse(JSON.stringify(r)).overall.freezeRatio).toBe("no-trace");
  });

  it("money missed is counted per account: over-holding one account never hides a miss on another", () => {
    const r = fairnessReport([
      { account: "A", held: rupees(50_000), traced: rupees(10_000), group: "G" },
      { account: "B", held: 0, traced: rupees(20_000), group: "G" },
    ]);
    expect(r.overall.victimMoneyNotHeld).toBe(rupees(20_000));
    expect(r.overall.recoveryRate).toBeCloseTo(10_000 / 30_000, 10);
  });
});
