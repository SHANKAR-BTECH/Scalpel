/**
 * The three badges must be able to go amber and red, not only green.
 * Each test names the situation a viva examiner would try.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { evaluateGate, type GateContext } from "../src/gate";
import { checkRequisition, type Requisition } from "../src/requisition";
import { regimeInForce, type PolicySet } from "../src/policy";
import { parseIST } from "../src/time";
import { rupees } from "../src/money";

const { policies, overlays } = loadPolicies(join(__dirname, "../../../policies"));
const P = policies.find((p) => p.id === "scalpel-2026-12")!;
const PD: PolicySet = P; // the policy file states the RBI draft's proposed start date (1 Apr 2027)
const t0 = parseIST("2026-12-20T10:00");
const req: Requisition = {
  id: "R", receivedAt: t0 + 3600e3, basis: "BNSS_106", issuer: { name: "IO", rank: "Inspector", station: "PS", state: "KA" },
  signed: true, signedAt: t0, ncrpAck: "31612260012345", amountRequested: rupees(30_000), asksWholeAccount: false,
  account: { id: "A1", branchState: "KA" }, linkedTxnIds: ["T1"], natureDeclared: "criminal", magistrateIntimatedAt: t0 + 3600e3,
};
const mule = { role: "mule" as const, muleScore: 0.93, signals: ["DWELL_LT_15M", "SIM_SWAP_LT_72H"] as ("DWELL_LT_15M" | "SIM_SWAP_LT_72H")[] };
const ctx = (over: Partial<GateContext> = {}, r: Requisition = req, policy: PolicySet = P): GateContext => ({
  at: t0, requester: "POLICE", requisition: checkRequisition(r, policy, overlays),
  account: { id: "A1", type: "SAVINGS", balance: rupees(37_500), traced: rupees(30_000) },
  assessment: mule, officerConfirmed: false, evidenceRecordId: "EV-1", ...over,
});

describe("badges can turn amber and red", () => {
  it("a valid Karnataka police hold: Allowed and Right size green, On time amber (its deadlines cite the unverified MHA SOP)", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(30_000) }, ctx(), P);
    expect(r.badgeStates).toEqual({ allowed: "pass", sized: "pass", timed: "caution" });
    expect(r.badgeReasons.timed[0]).toMatch(/still being checked/);
    expect(r.badges).toEqual({ allowed: true, sized: true, timed: true });
  });
  it("a whole freeze approved by the officer is allowed, but Right size? is red: it holds more than was traced", () => {
    const r = evaluateGate({ kind: "WHOLE_FREEZE", account: "A1" }, ctx({ officerConfirmed: true }), P);
    expect(r.decision).toBe("ALLOW");
    expect(r.badgeStates.sized).toBe("fail");
    expect(r.badgeReasons.sized[0]).toMatch(/7,500 more than the traced/);
  });
  it("a request sent back to the Magistrate: Allowed? is red", () => {
    const mh = { ...req, account: { id: "A1", branchState: "MH" as const } };
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(30_000) }, ctx({ assessment: { role: "normal", muleScore: 0.1, signals: [] } }, mh), P);
    expect(r.decision).toBe("ROUTE");
    expect(r.badgeStates.allowed).toBe("fail");
  });
  it("Magistrate told 3 days late (BNSS s.106(3)): the request is defective, so with no strong bank signals Allowed? is red", () => {
    const late = { ...req, magistrateIntimatedAt: t0 + 3 * 86400e3 };
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(30_000) }, ctx({ assessment: { role: "normal", muleScore: 0.1, signals: [] } }, late), P);
    expect(r.decision).toBe("ROUTE");
    expect(r.badgeStates.allowed).toBe("fail");
    expect(r.checks.find((c) => c.rule === "R0")?.note).toMatch(/defective/);
  });
  it("RBI draft not yet in force: the bank's fallback hold is amber on Allowed? and carries court risk Q10", () => {
    const mh = { ...req, account: { id: "A1", branchState: "MH" as const } };
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(30_000) }, ctx({}, mh, PD), PD);
    expect(r.regime).toBe("RBI_BANK");
    expect(r.badgeStates.allowed).toBe("caution");
    expect(r.badgeReasons.allowed[0]).toMatch(/only applies from 2027-04-01/);
    expect(r.quashRisksAfter.map((q) => q.id)).toContain("Q10");
    // From 1 Apr 2027 the same hold is on firm ground.
    const later = parseIST("2027-04-02T10:00");
    const r2 = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(30_000) }, ctx({ at: later }, { ...mh, signedAt: later, receivedAt: later + 3600e3, magistrateIntimatedAt: later + 3600e3 }, PD), PD);
    expect(r2.badgeStates.allowed).toBe("pass");
    expect(r2.quashRisksAfter.map((q) => q.id)).not.toContain("Q10");
  });
  it("regimeInForce: no date means in force; a future date means not yet (the policy file carries RBI's 1 Apr 2027)", () => {
    expect(P.regimes.RBI_BANK!.in_force_from).toBe("2027-04-01");
    expect(regimeInForce(P.regimes.MHA_POLICE, t0)).toBe(true);
    expect(regimeInForce(PD.regimes.RBI_BANK, t0)).toBe(false);
  });
  it("a lien bigger than today's balance is allowed (Himanshu Gupta) but flagged: it catches later credits", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(82_800) },
      ctx({ account: { id: "A1", type: "SAVINGS", balance: rupees(31_221), traced: rupees(82_800) } }, { ...req, amountRequested: rupees(82_800) }), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "A1", amount: rupees(82_800) });
    expect(r.flags.join(" ")).toMatch(/catch later credits/);
  });
});
