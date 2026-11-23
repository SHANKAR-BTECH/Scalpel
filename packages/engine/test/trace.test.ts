import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { trace, compareMethods, type Txn } from "../src/trace";
import { rupees } from "../src/money";

const k = (n: number) => rupees(n * 1000);
let clock = 0;
const tx = (id: string, from: string, to: string, amount: number): Txn => ({ id, at: ++clock, from, to, amount });

describe("rolling charge", () => {
  it("chat example: own 40k + stolen 60k, spend 50k, salary 50k -> hold 30k", () => {
    const r = trace({ opening: { M1: k(40) }, txns: [tx("a", "VA", "M1", k(60)), tx("b", "M1", "EXT", k(50)), tx("c", "EMP", "M1", k(50))], victimTxns: { a: "A" } });
    expect(r.accounts.M1!.tainted).toBe(k(30));
    expect(r.accounts.M1!.balance).toBe(k(100));
    expect(r.exits[0]!.taint).toEqual({ A: k(30) });
  });
  it("finds money at a second-hop mule that 'disputed amount' misses", () => {
    const input = {
      opening: { M1: k(20), M2: k(10) },
      txns: [tx("1", "VA", "M1", k(60)), tx("2", "VB", "M1", k(20)), tx("3", "M1", "M2", k(50)), tx("4", "M2", "CASH", k(30)), tx("5", "EMP", "M1", k(50))],
      victimTxns: { "1": "A", "2": "B" },
    };
    const r = trace(input);
    expect(r.accounts.M1!.taint).toEqual({ A: k(30), B: k(10) });
    expect(r.accounts.M2!.taint).toEqual({ A: k(15), B: k(5) });
    expect(r.accounts.M2!.hop).toBe(2);
    const c = compareMethods(input, "M2");
    expect(c.disputed_amount).toBe(0);
    expect(c.rolling).toBe(k(20));
    expect(c.whole_account).toBe(k(30));
  });
  it("respects asOf and flags balance gaps instead of inventing taint", () => {
    const r = trace({ opening: { M1: 0 }, txns: [tx("x", "M1", "CASH", k(5)), tx("y", "VA", "M1", k(10))], victimTxns: { y: "A" }, asOf: clock - 1 });
    expect(r.warnings.length).toBe(1);
    expect(r.accounts.M1!.tainted).toBe(0);
  });
});

const accts = ["M0", "M1", "M2", "M3"];
const worldArb = fc.record({
  opening: fc.tuple(...accts.map(() => fc.integer({ min: 0, max: 5_000_000 }))),
  steps: fc.array(fc.record({ kind: fc.integer({ min: 0, max: 9 }), a: fc.integer({ min: 0, max: 3 }), b: fc.integer({ min: 0, max: 5 }), v: fc.integer({ min: 0, max: 2 }), amt: fc.integer({ min: 1, max: 9_000_000 }) }), { maxLength: 30 }),
});

function build(w: { opening: number[]; steps: { kind: number; a: number; b: number; v: number; amt: number }[] }) {
  const opening = Object.fromEntries(accts.map((a, i) => [a, w.opening[i]!]));
  const bal = { ...opening } as Record<string, number>;
  const txns: Txn[] = []; const victimTxns: Record<string, string> = {};
  w.steps.forEach((s, i) => {
    const id = `t${i}`; const to = accts[s.a]!;
    if (s.kind < 3) { txns.push({ id, at: i, from: `V${s.v}`, to, amount: s.amt }); victimTxns[id] = `V${s.v}`; bal[to]! += s.amt; }
    else if (s.kind < 5) { txns.push({ id, at: i, from: "EMP", to, amount: s.amt }); bal[to]! += s.amt; }
    else {
      const from = accts[s.a]!; const dest = [...accts, "CASH", "EXT"][s.b]!;
      if (dest === from || bal[from] === 0) return;
      const amt = 1 + (s.amt % bal[from]!);
      txns.push({ id, at: i, from, to: dest, amount: amt }); bal[from]! -= amt; if (dest in bal) bal[dest]! += amt;
    }
  });
  return { opening, txns, victimTxns };
}

describe("tracing invariants (property)", () => {
  for (const method of ["rolling", "taint_first", "clean_first"] as const) {
    it(`${method}: never holds more than balance; every victim paisa accounted for`, () => {
      fc.assert(fc.property(worldArb, (w) => {
        const input = build(w);
        const r = trace({ ...input, method });
        let held: Record<string, number> = {};
        for (const a of Object.values(r.accounts)) {
          expect(a.tainted).toBeLessThanOrEqual(a.balance);
          expect(a.tainted).toBe(Object.values(a.taint).reduce((s, x) => s + x, 0));
          for (const [v, p] of Object.entries(a.taint)) { expect(p).toBeGreaterThan(0); held[v] = (held[v] ?? 0) + p; }
        }
        for (const e of r.exits) for (const [v, p] of Object.entries(e.taint)) held[v] = (held[v] ?? 0) + p;
        for (const [v, paid] of Object.entries(r.victimPaid)) expect(held[v] ?? 0).toBe(paid);
        expect(r.warnings).toEqual([]);
      }), { numRuns: 400 });
    });
  }
  it("clean credits never increase taint", () => {
    fc.assert(fc.property(worldArb, fc.integer({ min: 1, max: 1e7 }), (w, salary) => {
      const input = build(w);
      const before = trace(input);
      const after = trace({ ...input, txns: [...input.txns, { id: "sal", at: 1e6, from: "EMP", to: "M0", amount: salary }] });
      expect(after.accounts.M0!.tainted).toBe(before.accounts.M0!.tainted);
    }), { numRuns: 200 });
  });
  it("single-account worlds: taint_first <= rolling <= clean_first", () => {
    fc.assert(fc.property(worldArb, (w) => {
      // only one visible account; all debits leave the system
      const input = build({ opening: w.opening, steps: w.steps.map((s) => ({ ...s, a: 0, b: 4 + (s.b % 2) })) });
      const tf = trace({ ...input, method: "taint_first" });
      const cf = trace({ ...input, method: "clean_first" });
      const rc = trace({ ...input, method: "rolling" });
      const tot = (r: typeof rc) => Object.values(r.accounts).reduce((s, a) => s + a.tainted, 0);
      expect(tot(rc)).toBeGreaterThanOrEqual(tot(tf));
      expect(tot(rc)).toBeLessThanOrEqual(tot(cf));
    }), { numRuns: 300 });
  });
});
