// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aiView } from "@/lib/server/judge";
import { model, START } from "@/lib/server/world";

describe("the AI view of an account", () => {
  const m = model();
  const all = [...m.accounts.values()];
  it("sends unusable police requests back", () => {
    const v = all.find((x) => x.gate.decision === "ROUTE")!;
    const ai = aiView(v, START);
    expect(ai.suggest).toBe("SEND_BACK");
    expect(ai.point).toBe(true);
    expect(ai.rules.length).toBeGreaterThan(0);
  });
  it("flags a high score on an old account as a clash", () => {
    const v = all.find((x) => x.gate.decision !== "ROUTE" && (x.a.score?.muleScore ?? 0) >= 0.5 && START - x.a.openedAt > 365 * 86_400_000)!;
    const ai = aiView(v, START);
    expect(ai.clash).toMatch(/years? old/);
  });
  it("never suggests more than the traced money and always shows five clues for scored accounts", () => {
    for (const v of all) {
      const ai = aiView(v, START);
      expect(ai.amount).toBeLessThanOrEqual(v.traced);
      if (v.a.score) expect(ai.why).toHaveLength(5);
    }
  });
  it("gives CASE-001 both decision points and clear accounts", () => {
    const c = m.cases.find((x) => x.id === "CASE-001")!;
    const views = c.accounts.map((a) => aiView(m.accounts.get(a)!, START));
    expect(views.some((x) => x.point)).toBe(true);
    expect(views.some((x) => !x.point)).toBe(true);
  });
});
