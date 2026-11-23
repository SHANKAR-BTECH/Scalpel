import { describe, it, expect } from "vitest";
import { linkCampaigns, priority } from "../src/campaign";
describe("campaigns", () => {
  it("links complaints through shared receivers and explicit account links", () => {
    const cs = [
      { id: "N1", at: 3, amount: 100, firstReceiver: "M1" }, { id: "N2", at: 1, amount: 200, firstReceiver: "M1" },
      { id: "N3", at: 2, amount: 50, firstReceiver: "M9" }, { id: "N4", at: 4, amount: 10, firstReceiver: "M2" },
    ];
    const r = linkCampaigns(cs, [["M2", "M1"]]);
    expect(r.length).toBe(2);
    expect(r.find((c) => c.victims === 3)!.reported).toBe(310);
  });
  it("urgent, wide, catchable cases rank first", () => {
    expect(priority(1_000_000, 3, 10)).toBeGreaterThan(priority(1_000_000, 3, 120));
    expect(priority(1_000_000, 1, 1)).toBe(priority(1_000_000, 1, 5));
  });
});
