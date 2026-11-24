import { describe, it, expect } from "vitest";
import { hourIndex, valuesAt } from "./replay";
import { demo } from "./data";

describe("replay slider", () => {
  it("clamps and floors the hour", () => {
    expect(hourIndex(-5)).toBe(0);
    expect(hourIndex(999)).toBe(72);
    expect(hourIndex(36.7)).toBe(36);
    expect(hourIndex(Number.NaN)).toBe(0);
  });
  it("gives real numbers at both ends of every lane", () => {
    for (const lane of Object.values(demo.replay.lanes)) {
      for (const h of [0, 72]) {
        for (const v of Object.values(valuesAt(lane, h))) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  it("do nothing secures nothing; Scalpel locks no innocent money in the demo world", () => {
    expect(valuesAt(demo.replay.lanes.none, 72).secured).toBe(0);
    expect(valuesAt(demo.replay.lanes.scalpel, 72).innocentLocked).toBe(0);
  });
});
