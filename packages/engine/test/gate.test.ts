import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { evaluateGate, type GateContext } from "../src/gate";
import { checkRequisition, type Requisition } from "../src/requisition";
import { parseIST } from "../src/time";
import { rupees } from "../src/money";

const { policies, overlays } = loadPolicies(join(__dirname, "../../../policies"));
const P = policies.find((p) => p.id === "scalpel-2026-12")!;
const L = policies.find((p) => p.id === "legacy-practice")!;
const t0 = parseIST("2026-12-20T10:00");
const req: Requisition = {
  id: "R", receivedAt: t0 + 3600e3, basis: "BNSS_106", issuer: { name: "IO", rank: "Inspector", station: "PS", state: "KA" },
  signed: true, signedAt: t0, ncrpAck: "31612260012345", amountRequested: rupees(1859000), asksWholeAccount: false,
  account: { id: "A1", branchState: "KA" }, linkedTxnIds: ["T1"], natureDeclared: "criminal", magistrateIntimatedAt: t0 + 3600e3,
};
const ctx = (over: Partial<GateContext> = {}, r: Requisition = req): GateContext => ({
  at: t0, requester: "POLICE", requisition: checkRequisition(r, P, overlays),
  account: { id: "A1", type: "CURRENT", balance: rupees(1859000), traced: rupees(82800) },
  assessment: { role: "shield", muleScore: 0.2, signals: [] }, officerConfirmed: false, evidenceRecordId: "EV-1", ...over,
});

describe("gate", () => {
  it("Himanshu Gupta pattern: Rs 18.59 lakh request cut to Rs 82,800", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(1859000) }, ctx(), P);
    expect(r.decision).toBe("MODIFY");
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "A1", amount: rupees(82800) });
    expect(r.badges).toEqual({ allowed: true, sized: true, timed: true });
    expect(r.quashRisksBefore.map((q) => q.id)).toContain("Q2");
    expect(r.quashRisksAfter).toEqual([]);
  });
  it("whole freeze on a likely-innocent recipient becomes an exact hold (R8)", () => {
    const r = evaluateGate({ kind: "WHOLE_FREEZE", account: "A1" }, ctx(), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "A1", amount: rupees(82800) });
    expect(r.quashRisksBefore.map((q) => q.id)).toEqual(expect.arrayContaining(["Q1", "Q8", "Q9"]));
  });
  it("whole freeze allowed only with score, 2 signals and officer confirmation (R2)", () => {
    const strong = { role: "mule" as const, muleScore: 0.93, signals: ["DWELL_LT_15M", "SIM_SWAP_LT_72H"] as const };
    const noConfirm = evaluateGate({ kind: "WHOLE_FREEZE", account: "A1" }, ctx({ assessment: { ...strong, signals: [...strong.signals] } }), P);
    expect(noConfirm.action?.kind).toBe("EXACT_HOLD");
    const yes = evaluateGate({ kind: "WHOLE_FREEZE", account: "A1" }, ctx({ assessment: { ...strong, signals: [...strong.signals] }, officerConfirmed: true }), P);
    expect(yes.decision).toBe("ALLOW");
  });
  it("Mumbai account: police alone cannot freeze; strong own signals -> bank's own exact hold", () => {
    const mh = { ...req, account: { id: "A1", branchState: "MH" as const } };
    const weak = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(82800) }, ctx({}, mh), P);
    expect(weak.decision).toBe("ROUTE");
    const strong = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(82800) }, ctx({ assessment: { role: "mule", muleScore: 0.9, signals: ["DWELL_LT_15M", "ACCOUNT_AGE_LT_30D"] } }, mh), P);
    expect(strong.decision).toBe("MODIFY");
    expect(strong.regime).toBe("RBI_BANK");
    expect(strong.flags).toContain("Bank-initiated fallback hold");
  });
  it("no evidence record, no action (R9); nothing traced, nothing held (R1)", () => {
    expect(evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: 1 }, ctx({ evidenceRecordId: undefined }), P).decision).toBe("DENY");
    expect(evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: 1 }, ctx({ account: { id: "A1", type: "SAVINGS", balance: 100, traced: 0 } }), P).decision).toBe("DENY");
  });
  it("telecom: protected series, spoofed numbers, and the 2-signal rule", () => {
    const base = ctx({ requester: "TELCO_SELF", requisition: undefined, account: undefined });
    expect(evaluateGate({ kind: "MSISDN_BLOCK", msisdn: "1600123456" }, base, P).decision).toBe("DENY");
    expect(evaluateGate({ kind: "MSISDN_BLOCK", msisdn: "+91 09876 54321" }, { ...base, msisdn: { number: "x", spoofSuspected: true }, assessment: { role: "mule", muleScore: 1, signals: ["SIM_SWAP_LT_72H", "MNRL_LISTED"] } }, P).checks.at(-1)!.rule).toBe("R6");
    expect(evaluateGate({ kind: "IMEI_BLOCK", imei: "00123" }, { ...base, assessment: { role: "mule", muleScore: 1, signals: ["DWELL_LT_15M", "ACCOUNT_AGE_LT_30D"] } }, P).decision).toBe("DENY");
    expect(evaluateGate({ kind: "IMEI_BLOCK", imei: "00123" }, { ...base, assessment: { role: "mule", muleScore: 1, signals: ["DWELL_LT_15M", "HANDSET_GT5_SIMS"] } }, P).decision).toBe("ALLOW");
  });
  it("bank-initiated holds skip nodal/escrow accounts", () => {
    expect(evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: 100000 }, ctx({ requester: "BANK_SELF", account: { id: "A1", type: "NODAL", balance: 1e7, traced: 1e6 }, assessment: { role: "mule", muleScore: 0.9, signals: ["DWELL_LT_15M", "ACCOUNT_AGE_LT_30D"] } }), P).decision).toBe("DENY");
  });
  it("legacy practice has no clocks: the 'On time?' badge fails", () => {
    const r = evaluateGate({ kind: "WHOLE_FREEZE", account: "A1" }, ctx({ requisition: { ...checkRequisition(req, P, overlays) } }), L);
    expect(r.badges.timed).toBe(false);
    expect(r.quashRisksAfter.map((q) => q.id)).toContain("Q4");
  });
});
