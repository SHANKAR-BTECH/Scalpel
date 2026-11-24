import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadWorldDir } from "../src/run";
import { buildMemo } from "../src/memo";
import { policy } from "../src/scalpel";

const DIR = fileURLToPath(new URL("../../../pipeline/demo/world", import.meta.url));
const C = JSON.parse(readFileSync(fileURLToPath(new URL("../../../pipeline/demo/decisions/C.json", import.meta.url)), "utf8")) as {
  rows: { account: string; balance: number; traced: number; held: number; suggestedWholeFreeze: boolean }[];
};
const world = loadWorldDir(DIR);
const [mule, shop] = buildMemo(world, DIR, ["D09001", "D00191"]);

describe("hold memo cases come straight from the engine", () => {
  it("story mule: exact ₹30,000 hold on a ₹37,500 balance, whole freeze only suggested", () => {
    expect(mule!.heldPaise).toBe(3_000_000);
    expect(mule!.balancePaise).toBe(3_750_000);
    expect(mule!.action).toBe("EXACT_HOLD");
    expect(mule!.suggestedWholeFreeze).toBe(true);
    expect(mule!.wholeFreezeChecks?.some((c) => c.rule === "R2")).toBe(true);
  });

  it("every memo amount equals the runner's decisions file", () => {
    for (const m of [mule!, shop!]) {
      const row = C.rows.find((r) => r.account === m.account)!;
      expect([m.balancePaise, m.tracedPaise, m.heldPaise, m.suggestedWholeFreeze]).toEqual([row.balance, row.traced, row.held, row.suggestedWholeFreeze]);
    }
  });

  it("the shop keeps most of its money: hold is a small part of the balance", () => {
    expect(shop!.heldPaise).toBeLessThan(shop!.balancePaise / 10);
    expect(shop!.suggestedWholeFreeze).toBe(false);
  });

  it("clocks are the gate's regime clocks, and unverified sources match the policy file", () => {
    const { P } = policy();
    for (const m of [mule!, shop!]) {
      expect(m.regime).not.toBeNull();
      expect(m.clocks.map((c) => c.id)).toEqual(P.regimes[m.regime as keyof typeof P.regimes]!.clocks.map((c) => c.id));
      for (const c of [...m.checks, ...m.clocks]) {
        expect(c.unverified).toEqual(c.sources.filter((s) => !P.sources.find((x) => x.id === s)?.verified));
      }
    }
  });

  it("shows the money trail into the account with transaction ids", () => {
    expect(mule!.hops.length).toBeGreaterThan(0);
    expect(mule!.hops.every((h) => h.utr && h.taintPaise > 0 && h.to === "D09001")).toBe(true);
  });

  it("refuses an account that holds no traced money", () => {
    expect(() => buildMemo(world, DIR, ["D00001"])).toThrow(/no traced money/);
  });
});
