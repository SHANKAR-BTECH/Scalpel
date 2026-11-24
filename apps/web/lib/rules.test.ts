import { describe, it, expect } from "vitest";
import { badgesFor, citeable, stillBeingChecked } from "./rules";
import { demo } from "./data";

const S = demo.memo.sources;

describe("citations", () => {
  it("cites only verified sources", () => {
    const ids = S.map((s) => s.id);
    const { cited, uncited } = citeable(ids, S);
    expect(cited.every((s) => s.verified === true)).toBe(true);
    expect(uncited).toEqual(S.filter((s) => s.verified !== true).map((s) => s.id));
  });
  it("an unknown source id is never cited", () => {
    expect(citeable(["made-up"], S)).toEqual({ cited: [], uncited: ["made-up"] });
  });
});

describe("badges come from the engine", () => {
  for (const m of demo.memo.cases) {
    it(`${m.account}: three badges, pass/fail exactly as the engine said`, () => {
      const b = badgesFor(m);
      expect(b.map((x) => x.key)).toEqual(["allowed", "sized", "timed"]);
      expect(b.map((x) => x.pass)).toEqual([m.badges.allowed, m.badges.sized, m.badges.timed]);
      expect(b.find((x) => x.key === "sized")!.items.some((i) => i.id === "R1")).toBe(true);
    });
    it(`${m.account}: a rule with only unverified sources is listed as still being checked`, () => {
      const pending = stillBeingChecked(m, S).map((i) => i.id);
      for (const c of m.checks) {
        const allUnverified = c.sources.length > 0 && c.sources.every((id) => S.find((s) => s.id === id)?.verified !== true);
        expect(pending.includes(c.rule)).toBe(allUnverified);
      }
    });
  }
});
