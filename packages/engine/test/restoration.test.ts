import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { restore } from "../src/restoration";
import { trace, type Txn } from "../src/trace";
import { rupees, sum } from "../src/money";

const k = (n: number) => rupees(n * 1000);

describe("restoration", () => {
  const taint = { A: k(18), B: k(12) };
  const lost = { A: k(18), B: k(12) };

  it("full recovery: each victim gets back exactly their traced share", () => {
    expect(restore({ recovered: k(30), taint, lost })).toEqual({ perVictim: { A: k(18), B: k(12) }, leftover: 0 });
  });

  it("partial recovery is split in proportion (60:40)", () => {
    expect(restore({ recovered: k(10), taint, lost })).toEqual({ perVictim: { A: k(6), B: k(4) }, leftover: 0 });
  });

  it("odd paise: parts add up exactly to the recovered amount", () => {
    const r = restore({ recovered: 100, taint: { A: 100, B: 200 }, lost: { A: 100, B: 200 } });
    expect(r.perVictim).toEqual({ A: 33, B: 67 });
    const r2 = restore({ recovered: rupees(100.01), taint: { A: k(10), B: k(20) }, lost: { A: k(10), B: k(20) } });
    expect(sum(Object.values(r2.perVictim))).toBe(rupees(100.01));
    expect(r2.perVictim).toEqual({ A: 3334, B: 6667 });
  });

  it("a victim already repaid in full gets nothing more; the rest is leftover", () => {
    const r = restore({ recovered: k(30), taint, lost, alreadyRepaid: { A: k(18) } });
    expect(r).toEqual({ perVictim: { B: k(12) }, leftover: k(18) });
  });

  it("never pays a victim more than they lost, even if more of their money was traced here", () => {
    const r = restore({ recovered: k(30), taint, lost: { A: k(5), B: k(12) } });
    expect(r).toEqual({ perVictim: { A: k(5), B: k(12) }, leftover: k(13) });
  });

  it("rejects bad amounts", () => {
    expect(() => restore({ recovered: -1, taint, lost })).toThrow(RangeError);
    expect(() => restore({ recovered: 1.5, taint, lost })).toThrow(RangeError);
  });

  it("works end to end with trace(): two victims, one mule, money back in the right shares", () => {
    let t = 0;
    const tx = (id: string, from: string, to: string, amount: number): Txn => ({ id, at: ++t, from, to, amount });
    const tr = trace({
      opening: { M1: k(10) },
      txns: [tx("1", "VA", "M1", k(60)), tx("2", "VB", "M1", k(20)), tx("3", "M1", "CASH", k(45))],
      victimTxns: { "1": "A", "2": "B" },
    });
    const m1 = tr.accounts.M1!;
    expect(m1.tainted).toBe(k(40)); // 80 stolen of 90 balance; 45 out leaves 40 stolen of 45
    const r = restore({ recovered: m1.tainted, taint: m1.taint, lost: tr.victimPaid });
    expect(r).toEqual({ perVictim: { A: k(30), B: k(10) }, leftover: 0 });
  });

  it("random worlds: parts add up, nobody gets more than their claim, nobody negative", () => {
    const amt = fc.integer({ min: 0, max: 10_000_000 });
    const victims = fc.dictionary(fc.constantFrom("A", "B", "C", "D"), fc.tuple(amt, amt, amt));
    fc.assert(fc.property(victims, amt, (vs, recovered) => {
      const taint: Record<string, number> = {}, lost: Record<string, number> = {}, alreadyRepaid: Record<string, number> = {};
      for (const [v, [a, b, c]] of Object.entries(vs)) { taint[v] = a; lost[v] = b; alreadyRepaid[v] = c; }
      const r = restore({ recovered, taint, lost, alreadyRepaid });
      expect(sum(Object.values(r.perVictim)) + r.leftover).toBe(recovered);
      expect(r.leftover).toBeGreaterThanOrEqual(0);
      for (const [v, p] of Object.entries(r.perVictim)) {
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThanOrEqual(taint[v]!);
        expect(p).toBeLessThanOrEqual(Math.max(0, lost[v]! - alreadyRepaid[v]!));
      }
    }), { numRuns: 1000 });
  });
});
