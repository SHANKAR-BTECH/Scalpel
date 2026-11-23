import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rupees } from "@scalpel/engine";
import { parseWorld, type World } from "../src/schema";
import { traceWorld, runHolds } from "../src/run";

const FIX = join(__dirname, "../../../pipeline/tests/fixtures/tiny/world/world.json");
const tiny = parseWorld(JSON.parse(readFileSync(FIX, "utf8")));

// Phase 1 golden story as a world: 3 victims pay M1, M1 passes some to M2 and cashes out.
const T0 = Date.UTC(2026, 11, 20, 4, 32);
const story: World = parseWorld({
  schema: "scalpel-world/1", name: "story", seed: 0, cutoff: T0 + 3_600_000,
  accounts: [
    { id: "M1", type: "SAVINGS", openedAt: T0 - 10 * 86_400_000, kycChangedAt: null, opening: rupees(20_000) },
    { id: "M2", type: "SAVINGS", openedAt: T0 - 10 * 86_400_000, kycChangedAt: null, opening: 0 },
  ],
  txns: [
    { id: "v1", at: T0 + 60e3, from: "VICTIM-A", to: "M1", amount: rupees(60_000), channel: "UPI" },
    { id: "v2", at: T0 + 120e3, from: "VICTIM-B", to: "M1", amount: rupees(15_000), channel: "UPI" },
    { id: "v3", at: T0 + 180e3, from: "VICTIM-C", to: "M1", amount: rupees(5_000), channel: "UPI" },
    { id: "h1", at: T0 + 240e3, from: "M1", to: "M2", amount: rupees(25_000), channel: "IMPS" },
    { id: "x1", at: T0 + 300e3, from: "M1", to: "ATM", amount: rupees(37_500), channel: "ATM_CASH" },
  ],
  complaints: [
    { id: "C1", victim: "A", txnId: "v1", reportedAt: T0 + 600e3 },
    { id: "C2", victim: "B", txnId: "v2", reportedAt: T0 + 600e3 },
    { id: "C3", victim: "C", txnId: "v3", reportedAt: T0 + 600e3 },
  ],
});

describe("world schema", () => {
  it("accepts the shared tiny fixture written by the Python generator", () => {
    expect(tiny.accounts.length).toBeGreaterThan(40);
  });
  it("rejects a negative amount with a clear message", () => {
    const bad = JSON.parse(readFileSync(FIX, "utf8"));
    bad.txns[0].amount = -5;
    expect(() => parseWorld(bad)).toThrow(/amount/);
  });
  it("rejects a missing field", () => {
    const bad = JSON.parse(readFileSync(FIX, "utf8"));
    delete bad.cutoff;
    expect(() => parseWorld(bad)).toThrow(/cutoff/);
  });
});

describe("tracing a world (reported complaints only)", () => {
  it("story: ₹30,000 traced in M1, ₹20,000 in M2, same as the engine golden test", () => {
    const t = traceWorld(story);
    expect(t.M1).toEqual({ balance: rupees(37_500), traced: rupees(30_000) });
    expect(t.M2).toEqual({ balance: rupees(25_000), traced: rupees(20_000) });
  });
});

describe("hold policies 0, A, B", () => {
  it("B (Ruler) holds exactly the traced amount on the story", () => {
    const d = runHolds(story, "B");
    expect(d.rows.find((r) => r.account === "M1")).toMatchObject({ action: "EXACT_HOLD", held: rupees(30_000) });
  });
  it("A (Axe) freezes the whole balance of every traced account", () => {
    const d = runHolds(story, "A");
    expect(d.rows.find((r) => r.account === "M1")).toMatchObject({ action: "WHOLE_FREEZE", held: rupees(37_500) });
  });
  it("0 (do nothing) holds nothing", () => {
    expect(runHolds(story, "0").rows.every((r) => r.held === 0)).toBe(true);
  });
  it("B never holds more than traced on the tiny world", () => {
    const d = runHolds(tiny, "B");
    expect(d.rows.length).toBeGreaterThan(0);
    for (const r of d.rows) expect(r.held).toBeLessThanOrEqual(r.traced);
  });
});

describe("signals file", () => {
  it("the tiny fixture's signals.json uses only the engine's signal names", async () => {
    const { parseSignals } = await import("../src/schema");
    const s = parseSignals(JSON.parse(readFileSync(join(__dirname, "../../../pipeline/tests/fixtures/tiny/world/signals.json"), "utf8")));
    expect(Object.keys(s.signals).length).toBeGreaterThan(40);
  });
});
