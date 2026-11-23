import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { planAccount, scoreAction, freezeRatio } from "../src/score";
import type { GateContext } from "../src/gate";
import { parseIST } from "../src/time";
import { rupees } from "../src/money";

const { policies } = loadPolicies(join(__dirname, "../../../policies"));
const P = policies.find((p) => p.id === "scalpel-2026-12")!;
const base: GateContext = {
  at: parseIST("2026-12-20T10:00"), requester: "BANK_SELF",
  account: { id: "A", type: "CURRENT", balance: rupees(500000), traced: rupees(40000) },
  assessment: { role: "shield", muleScore: 0.3, signals: ["DWELL_LT_15M", "GE3_CASE_LINKED_SENDERS"] }, officerConfirmed: false, evidenceRecordId: "EV",
};
const cands = [{ kind: "EXACT_HOLD" as const, account: "A", amount: rupees(40000) }, { kind: "WHOLE_FREEZE" as const, account: "A" }];

describe("scorer + planner", () => {
  it("shopkeeper (likely innocent): exact hold beats whole freeze", () => {
    const { best } = planAccount(cands, base, P);
    expect(best!.gate.action).toEqual({ kind: "EXACT_HOLD", account: "A", amount: rupees(40000) });
  });
  it("confirmed mule with strong signals: whole freeze wins once allowed", () => {
    const mule: GateContext = { ...base, account: { ...base.account!, balance: rupees(60000), traced: rupees(55000), type: "SAVINGS" }, assessment: { role: "mule", muleScore: 0.95, signals: ["DWELL_LT_15M", "ACCOUNT_AGE_LT_30D", "SIM_SWAP_LT_72H"] }, officerConfirmed: true };
    expect(planAccount(cands, mule, P).best!.gate.action!.kind).toBe("WHOLE_FREEZE");
  });
  it("harm slider: more cautious never increases harm of the chosen plan", () => {
    const h1 = planAccount(cands, base, P, { harmMultiplier: 0.01 }).best!.score.harm;
    const h2 = planAccount(cands, base, P, { harmMultiplier: 5 }).best!.score.harm;
    expect(scoreAction(null, base).score).toBe(0);
    expect(h2 / 5).toBeLessThanOrEqual(h1 / 0.01 + 1);
  });
  it("freeze ratio", () => {
    expect(freezeRatio(rupees(1859000), rupees(82800))).toBeCloseTo(22.45, 2);
    expect(freezeRatio(0, 0)).toBe(0);
  });
});

describe("freezeRatio no-trace (phase 2 fix)", () => {
  it("held money with nothing traced is 'no-trace', not Infinity", () => {
    expect(freezeRatio(rupees(10_000), 0)).toBe("no-trace");
  });
});
