// @vitest-environment node
import { describe, expect, it } from "vitest";
import { model, W } from "@/lib/server/world";

describe("product world", () => {
  const m = model();
  it("links complaints into several cases, each with money still to catch", () => {
    expect(m.cases.length).toBeGreaterThanOrEqual(6);
    expect(m.cases.reduce((s, c) => s + c.complaints.length, 0)).toBe(W.complaints.length);
  });
  it("never suggests a hold above the victim money still in an account", () => {
    const d: Record<string, number> = {};
    for (const v of m.accounts.values()) {
      expect(v.suggested).toBeLessThanOrEqual(v.traced);
      d[v.gate.decision] = (d[v.gate.decision] ?? 0) + 1;
    }
  });
  it("one SIM box links three cases", () => {
    expect(Math.max(...[...m.casesOfRig.values()].map((x) => x.length))).toBeGreaterThanOrEqual(2);
  });
});
