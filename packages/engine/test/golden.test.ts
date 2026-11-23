/**
 * Golden cases: whole cases with answers agreed in advance.
 * If a later change alters any of these answers, a test fails and we decide on purpose.
 * Case 1 follows ARCHITECTURE.md section 5.1 ("one case, start to finish").
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { trace, type Txn } from "../src/trace";
import { evaluateGate, type GateContext } from "../src/gate";
import { checkRequisition, type Requisition } from "../src/requisition";
import { restore } from "../src/restoration";
import { fairnessReport } from "../src/fairness";
import { parseIST } from "../src/time";
import { rupees } from "../src/money";

const { policies, overlays } = loadPolicies(join(__dirname, "../../../policies"));
const P = policies.find((p) => p.id === "scalpel-2026-12")!;
const t0 = parseIST("2026-12-20T10:02");
const H = 3600e3;

// The story: 3 victims pay Mule-1; Mule-1 passes some on to Mule-2 and cashes some out.
let n = 0;
const tx = (id: string, from: string, to: string, r: number): Txn => ({ id, at: t0 + ++n * 60e3, from, to, amount: rupees(r) });
const story = trace({
  opening: { M1: rupees(20_000), M2: 0 },
  txns: [
    tx("v1", "VICTIM-A", "M1", 60_000),
    tx("v2", "VICTIM-B", "M1", 15_000),
    tx("v3", "VICTIM-C", "M1", 5_000),
    tx("h1", "M1", "M2", 25_000),
    tx("x1", "M1", "ATM", 37_500),
  ],
  victimTxns: { v1: "A", v2: "B", v3: "C" },
});
const M1 = story.accounts.M1!;

// A police request template (valid unless a case changes it).
const policeReq = (over: Partial<Requisition>): Requisition => ({
  id: "REQ-1", receivedAt: t0 + H, basis: "BNSS_106", issuer: { name: "IO", rank: "Inspector", station: "Cyber PS", state: "KA" },
  signed: true, signedAt: t0, ncrpAck: "31612260012345", amountRequested: rupees(30_000), asksWholeAccount: false,
  account: { id: "M1", branchState: "KA" }, linkedTxnIds: ["v1"], natureDeclared: "criminal", magistrateIntimatedAt: t0 + H, ...over,
});
const ctx = (req: Requisition | undefined, over: Partial<GateContext> = {}): GateContext => ({
  at: t0 + 2 * H, requester: "POLICE", requisition: req ? checkRequisition(req, P, overlays) : undefined,
  account: { id: "M1", type: "SAVINGS", balance: M1.balance, traced: M1.tainted },
  assessment: { role: "mule", muleScore: 0.91, signals: ["ACCOUNT_AGE_LT_30D", "DWELL_LT_15M", "GE3_CASE_LINKED_SENDERS"] },
  officerConfirmed: false, evidenceRecordId: "EV-1", ...over,
});

describe("golden cases", () => {
  it("trace: ₹30,000 of stolen money is still in Mule-1 and ₹20,000 in Mule-2, split by victim", () => {
    expect(M1.balance).toBe(rupees(37_500));
    expect(M1.tainted).toBe(rupees(30_000));
    expect(M1.taint).toEqual({ A: rupees(22_500), B: rupees(5_625), C: rupees(1_875) });
    expect(story.accounts.M2!.tainted).toBe(rupees(20_000));
    expect(story.victimPaid).toEqual({ A: rupees(60_000), B: rupees(15_000), C: rupees(5_000) });
  });

  it("1. Bombay HC area, 'freeze the whole account', strong bank signals -> bank's own exact ₹30,000 hold, memo back", () => {
    const req = policeReq({ asksWholeAccount: true, amountRequested: null, account: { id: "M1", branchState: "MH" }, issuer: { name: "IO", rank: "Inspector", station: "Cyber PS", state: "MH" } });
    const checked = checkRequisition(req, P, overlays);
    expect(checked.status).toBe("DEFECTIVE");
    expect(checked.route).toBe("MAGISTRATE_S107");
    expect(checked.memo.join(" ")).toMatch(/whole account/);
    const r = evaluateGate({ kind: "WHOLE_FREEZE", account: "M1" }, ctx(req), P);
    expect(r.decision).toBe("MODIFY");
    expect(r.regime).toBe("RBI_BANK");
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "M1", amount: rupees(30_000) });
    expect(r.badges).toEqual({ allowed: true, sized: true, timed: true });
    expect(r.flags).toContain("Bank-initiated fallback hold");
    expect(r.quashRisksBefore.map((q) => q.id)).toEqual(expect.arrayContaining(["Q1", "Q2", "Q5"]));
    expect(r.quashRisksAfter).toEqual([]);
  });

  it("2. Karnataka: police may freeze; asking the full ₹60,000 complaint amount is cut to the ₹30,000 traced", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "M1", amount: rupees(60_000) }, ctx(policeReq({ amountRequested: rupees(60_000) })), P);
    expect(r.decision).toBe("MODIFY");
    expect(r.regime).toBe("MHA_POLICE");
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "M1", amount: rupees(30_000) });
    expect(r.checks.find((c) => c.rule === "R1")?.ok).toBe(false);
  });

  it("3. Shield: a shopkeeper (score 0.2) asked to be fully frozen gets an exact hold only (R8)", () => {
    const r = evaluateGate({ kind: "WHOLE_FREEZE", account: "M1" }, ctx(policeReq({}), { account: { id: "M1", type: "CURRENT", balance: M1.balance, traced: M1.tainted }, assessment: { role: "shield", muleScore: 0.2, signals: [] } }), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "M1", amount: rupees(30_000) });
    expect(r.checks.find((c) => c.rule === "R8")?.ok).toBe(false);
    expect(r.quashRisksBefore.map((q) => q.id)).toEqual(expect.arrayContaining(["Q1", "Q8", "Q9"]));
  });

  it("4. Over-asking: ₹1,00,000 requested where ₹40,000 was traced -> hold cut to ₹40,000 (R1)", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "M9", amount: rupees(1_00_000) }, ctx(policeReq({ amountRequested: rupees(1_00_000) }), { account: { id: "M9", type: "SAVINGS", balance: rupees(2_50_000), traced: rupees(40_000) } }), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "M9", amount: rupees(40_000) });
    expect(r.badges.sized).toBe(true);
  });

  it("5. Protected number: a block on a 1600-series number is denied (R5)", () => {
    const r = evaluateGate({ kind: "MSISDN_BLOCK", msisdn: "1600-123-456" }, ctx(undefined, { requester: "TELCO_SELF", account: undefined, assessment: { role: "mule", muleScore: 0.99, signals: ["SIM_SWAP_LT_72H", "MNRL_LISTED"] } }), P);
    expect(r.decision).toBe("DENY");
    expect(r.checks.at(-1)?.rule).toBe("R5");
  });

  it("6. Restoration end to end: the ₹30,000 hold goes back 22,500 / 5,625 / 1,875; Freeze Ratio 1.25x -> 1x", () => {
    const back = restore({ recovered: rupees(30_000), taint: M1.taint, lost: story.victimPaid });
    expect(back).toEqual({ perVictim: { A: rupees(22_500), B: rupees(5_625), C: rupees(1_875) }, leftover: 0 });
    const whole = fairnessReport([{ account: "M1", held: M1.balance, traced: M1.tainted, group: "SAVINGS" }]);
    const exact = fairnessReport([{ account: "M1", held: rupees(30_000), traced: M1.tainted, group: "SAVINGS" }]);
    expect(whole.overall.freezeRatio).toBe(1.25);
    expect(whole.overall.innocentHeld).toBe(rupees(7_500));
    expect(exact.overall.freezeRatio).toBe(1);
    expect(exact.overall.innocentHeld).toBe(0);
  });
});
