import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rupees } from "@scalpel/engine";
import { parseWorld, type World } from "../src/schema";
import { runScalpel } from "../src/scalpel";
import { buildQueues, caseTotals, hourOf } from "../src/queue";

const T0 = Date.UTC(2026, 11, 20, 4, 32);
const story: World = parseWorld({
  schema: "scalpel-world/1", name: "story", seed: 0, cutoff: T0 + 3_600_000,
  accounts: [
    { id: "M1", type: "SAVINGS", openedAt: T0 - 10 * 86_400_000, kycChangedAt: null, opening: rupees(20_000) },
    { id: "S1", type: "CURRENT", openedAt: T0 - 900 * 86_400_000, kycChangedAt: null, opening: rupees(200_000) },
  ],
  txns: [
    { id: "v1", at: T0 + 60e3, from: "VICTIM-A", to: "M1", amount: rupees(60_000), channel: "UPI" },
    { id: "v2", at: T0 + 120e3, from: "VICTIM-B", to: "S1", amount: rupees(10_000), channel: "UPI" },
  ],
  complaints: [
    { id: "C1", victim: "A", txnId: "v1", reportedAt: T0 + 600e3 },
    { id: "C2", victim: "B", txnId: "v2", reportedAt: T0 + 600e3 },
  ],
});

function folder(assess: Record<string, { role: string; muleScore: number }>, signals: Record<string, string[]>) {
  const d = mkdtempSync(join(tmpdir(), "c-"));
  writeFileSync(join(d, "world.json"), JSON.stringify(story));
  writeFileSync(join(d, "signals.json"), JSON.stringify({ asOf: story.cutoff, signals }));
  const accounts = Object.fromEntries(Object.entries(assess).map(([a, v]) => [a, { ...v, reasons: ["r1", "r2", "r3"] }]));
  writeFileSync(join(d, "assessments.json"), JSON.stringify({ model: "test", accounts }));
  return d;
}

describe("policy C (Scalpel)", () => {
  const strong = ["ACCOUNT_AGE_LT_30D", "DWELL_LT_15M", "SIM_SWAP_LT_72H"];
  it("a confident mule gets an exact hold; the whole freeze is only suggested to the officer", () => {
    const d = folder({ M1: { role: "mule", muleScore: 0.95 }, S1: { role: "shield", muleScore: 0.05 } }, { M1: strong, S1: [] });
    const m1 = runScalpel(story, d, "assessments.json").rows.find((r) => r.account === "M1")!;
    expect(m1.action).toBe("EXACT_HOLD");
    expect(m1.held).toBe(rupees(60_000));
    expect(m1.suggestedWholeFreeze).toBe(true);
    expect(m1.line).toMatch(/R1/);
    expect(m1.line).toMatch(/r1/);
  });
  it("a likely shop is never suggested for a whole freeze and gets an exact hold of the traced amount only", () => {
    const d = folder({ M1: { role: "mule", muleScore: 0.95 }, S1: { role: "shield", muleScore: 0.05 } }, { M1: strong, S1: [] });
    const s1 = runScalpel(story, d, "assessments.json").rows.find((r) => r.account === "S1")!;
    expect(s1).toMatchObject({ action: "EXACT_HOLD", held: rupees(10_000), suggestedWholeFreeze: false });
  });
  it("whole freezes are never applied under C, whatever the scores", () => {
    const d = folder({ M1: { role: "mule", muleScore: 1 }, S1: { role: "mule", muleScore: 1 } }, { M1: strong, S1: strong });
    expect(runScalpel(story, d, "assessments.json").rows.every((r) => r.action !== "WHOLE_FREEZE")).toBe(true);
  });
});

describe("officer's to-do order", () => {
  const rows = [
    { account: "MULE", traced: rupees(10_000), firstSeen: 2 },
    { account: "SHOP", traced: rupees(20_000), firstSeen: 1 },
  ];
  const scores = { MULE: 0.9, SHOP: 0.1 };
  const signals = { MULE: ["DWELL_LT_15M"], SHOP: [] };
  it("with K = 1, Scalpel acts on the likely mule first; 'biggest first' acts on the shop first", () => {
    const q = buildQueues(rows, scores, signals);
    expect(q.scalpel[0]).toBe("MULE");
    expect(q.biggest[0]).toBe("SHOP");
    expect(q.fcfs[0]).toBe("SHOP");
  });
  it("Scalpel orders by money likely lost per hour, so a zero score never buries a big account", () => {
    const q = buildQueues(
      [{ account: "BIG", traced: rupees(100_000), firstSeen: 1 }, { account: "SMALL", traced: rupees(10_000), firstSeen: 2 }],
      { BIG: 0, SMALL: 0.5 }, {});
    // BIG: 1,00,000 x 3% = 3,000 an hour at risk. SMALL: 10,000 x (0.5 x 15% + 0.5 x 3%) = 900 an hour.
    expect(q.scalpel).toEqual(["BIG", "SMALL"]);
  });
  it("the warning-sign rule puts accounts with 2+ signs first", () => {
    const q = buildQueues(rows, scores, { MULE: ["DWELL_LT_15M", "SIM_SWAP_LT_72H"], SHOP: [] });
    expect(q.signrule[0]).toBe("MULE");
  });
  it("biggest case first: a small piece of a big case goes before a bigger piece of a small case", () => {
    const totals = caseTotals(
      { P1: { v1: rupees(9_000) }, P2: { v1: rupees(8_000) }, P3: { v1: rupees(9_500) }, LONE: { v9: rupees(20_000) } },
      { v1: "CASE-A", v9: "CASE-B" });
    expect(totals).toEqual({ P1: rupees(26_500), P2: rupees(26_500), P3: rupees(26_500), LONE: rupees(20_000) });
    const q = buildQueues(
      Object.entries({ P1: 9_000, P2: 8_000, P3: 9_500, LONE: 20_000 }).map(([account, r]) => ({ account, traced: rupees(r), firstSeen: 0, caseTotal: totals[account] })),
      {}, {});
    expect(q.biggest[0]).toBe("LONE");
    expect(q.biggestcase).toEqual(["P3", "P1", "P2", "LONE"]);
  });
  it("an account goes with the case that put the most money in it", () => {
    expect(caseTotals({ X: { a: 100, b: 300 }, Y: { a: 1_000 } }, { a: "A", b: "B" })).toEqual({ X: 300, Y: 1_100 });
  });
  it("with unlimited capacity every account is acted on in hour 0", () => {
    expect(hourOf(["a", "b", "c"], 1000)).toEqual({ a: 0, b: 0, c: 0 });
    expect(hourOf(["a", "b", "c"], 1)).toEqual({ a: 0, b: 1, c: 2 });
  });
});
