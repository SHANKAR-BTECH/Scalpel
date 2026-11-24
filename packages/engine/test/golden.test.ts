/**
 * Golden cases: whole cases with answers agreed in advance.
 * If a later change alters any of these answers, a test fails and we decide on purpose.
 * Case 1 follows ARCHITECTURE.md section 5.1 ("one case, start to finish").
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { trace, tracedByRole, type Txn } from "../src/trace";
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
    // 20 Dec 2026: the RBI draft only applies from 1 Apr 2027, so the bank's own hold is on a contested basis (amber, risk Q10).
    // On time? is amber too: the police hand-over clock is our own reading ("assumed").
    expect(r.badgeStates).toEqual({ allowed: "caution", sized: "pass", timed: "caution" });
    expect(r.flags).toContain("Bank-initiated fallback hold");
    expect(r.quashRisksBefore.map((q) => q.id)).toEqual(expect.arrayContaining(["Q1", "Q2", "Q5"]));
    expect(r.quashRisksAfter.map((q) => q.id)).toEqual(["Q10"]);
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
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "M9", amount: rupees(1_00_000) }, ctx(policeReq({ amountRequested: rupees(1_00_000), account: { id: "M9", branchState: "KA" } }), { account: { id: "M9", type: "SAVINGS", balance: rupees(2_50_000), traced: rupees(40_000) } }), P);
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

  it("6b. Same story, but the police name Mule-1 as accused: own money is presumed spent first (Re Hallett) -> ₹37,500, not ₹30,000", () => {
    const input = {
      opening: { M1: rupees(20_000), M2: 0 },
      txns: [tx("w1", "VICTIM-A", "M1", 60_000), tx("w2", "VICTIM-B", "M1", 15_000), tx("w3", "VICTIM-C", "M1", 5_000), tx("w4", "M1", "M2", 25_000), tx("w5", "M1", "ATM", 37_500)],
      victimTxns: { w1: "A", w2: "B", w3: "C" },
    };
    const both = tracedByRole(input, "M1");
    expect(both).toEqual({ balance: rupees(37_500), proRata: rupees(30_000), ownMoneyFirst: rupees(37_500) });
    // His own ₹20,000 went first in the ₹25,000 to Mule-2, so Mule-2 got only ₹5,000 of victim money.
    expect(trace({ ...input, method: "by_role", roles: { M1: "wrongdoer" } }).accounts.M2!.tainted).toBe(rupees(5_000));
    // The Gate allows the larger hold only because the traced figure the caller gives it is the accused figure.
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "M1", amount: rupees(37_500) },
      ctx(policeReq({ amountRequested: rupees(37_500) }), { account: { id: "M1", type: "SAVINGS", balance: both.balance, traced: both.ownMoneyFirst } }), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "M1", amount: rupees(37_500) });
  });
});

/**
 * Real court cases (R1/R3 research, 24 Nov 2026). Money figures are the courts' own numbers.
 * Himanshu Gupta and Navneet Traders were read on Indian Kanoon (doc/127387465, doc/157843896).
 * Neelkanth Pharma comes only from the R3 research chart (no judgment link yet): treat it as unverified.
 * Where an order does not state a number (e.g. Navneet's balance), the test says so and uses a stand-in.
 */
describe("golden cases from real court orders", () => {
  const real = (over: Partial<Requisition>): Requisition => policeReq({ id: "REAL", linkedTxnIds: ["T1"], ...over });

  it("7. Himanshu Gupta (Madras HC, 7 Jul 2026): ₹18,59,181 lien over ₹82,800 traced; court set the lien at ₹82,800", () => {
    // Fairness: what the bank held vs what the police traced into this third-layer account.
    const before = fairnessReport([{ account: "HG", held: rupees(18_59_181), traced: rupees(82_800), group: "SAVINGS" }]);
    expect(before.overall.freezeRatio).toBeCloseTo(22.45, 2);
    expect(before.overall.innocentHeld).toBe(rupees(17_76_381));
    const after = fairnessReport([{ account: "HG", held: rupees(82_800), traced: rupees(82_800), group: "SAVINGS" }]);
    expect(after.overall.freezeRatio).toBe(1);

    // A Tamil Nadu police request for the full ₹18,59,181: the Gate cuts it to ₹82,800, the court's own figure (R1).
    // (Real account was at a Pune branch; here branch = TN so only the size rule is tested. Case 7b covers Pune.)
    const acct = { id: "HG", type: "SAVINGS" as const, balance: rupees(31_221.21), traced: rupees(82_800) };
    const tn = real({ amountRequested: rupees(18_59_181), issuer: { name: "IO", rank: "Inspector", station: "Cyber PS Chennai East", state: "TN" }, account: { id: "HG", branchState: "TN" } });
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "HG", amount: rupees(18_59_181) }, ctx(tn, { account: acct, assessment: { role: "shield", muleScore: 0.3, signals: [] } }), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "HG", amount: rupees(82_800) });
    expect(r.checks.find((c) => c.rule === "R1")).toMatchObject({ ok: false, sources: ["himanshu-gupta"], unverified: [] });
  });

  it("7a. Himanshu Gupta rebuilt from the order's own money facts and run through trace(): at most ₹31,221.21 of the ₹82,800 can still be there", () => {
    // What the order states (paras 3-4): victim lost ₹18,17,882; the petitioner's account was a 3rd-layer account that
    // received ₹82,800; its balance is ₹31,221.21. It does NOT state dates, the layer 1-2 accounts, or what left the account.
    // So layers 1-2 and the ₹51,578.79 outflow below are stand-ins chosen only to match those three numbers.
    let m = 0;
    const at = (id: string, from: string, to: string, p: number): Txn => ({ id, at: t0 + ++m * 60e3, from, to, amount: p });
    const input = (ownOpening: number) => ({
      opening: { L1: 0, L2: 0, HG: ownOpening },
      txns: [
        at("v", "VICTIM", "L1", rupees(18_17_882)),
        at("l1", "L1", "L2", rupees(18_17_882)),
        at("l2", "L2", "HG", rupees(82_800)),
        at("out", "HG", "ELSEWHERE", ownOpening + rupees(82_800) - rupees(31_221.21)),
      ],
      victimTxns: { v: "V" },
    });
    // With no own money in the account, every method agrees: only the balance left can be victim money.
    const plain = tracedByRole(input(0), "HG");
    expect(plain).toEqual({ balance: rupees(31_221.21), proRata: rupees(31_221.21), ownMoneyFirst: rupees(31_221.21) });
    expect(trace(input(0)).accounts.HG!.hop).toBe(3); // third layer, as the order says
    // The court's ₹82,800 lien is ₹51,578.79 more than any tracing method can find; the rest waits for future credits.
    expect(rupees(82_800) - plain.ownMoneyFirst).toBe(rupees(51_578.79));
    // If he also had ₹20,000 of his own (stand-in), the two rules split: innocent pro-rata vs accused own-money-first.
    const mixed = tracedByRole(input(rupees(20_000)), "HG");
    expect(mixed.proRata).toBe(Math.round(rupees(31_221.21) * 82_800 / 1_02_800));
    expect(mixed.ownMoneyFirst).toBe(rupees(31_221.21));
    // The Gate, fed the traced figure, holds the traced amount and flags the court's larger lien.
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "HG", amount: rupees(82_800) },
      ctx(real({ amountRequested: rupees(82_800), account: { id: "HG", branchState: "TN" } }), { account: { id: "HG", type: "SAVINGS", balance: plain.balance, traced: plain.proRata }, assessment: { role: "shield", muleScore: 0.3, signals: [] } }), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "HG", amount: rupees(31_221.21) });
  });

  it("7b. Himanshu Gupta, real states (Chennai police, Pune branch): after Kartik Chatur, police alone can't freeze in Bombay HC's area -> Magistrate", () => {
    const pune = real({ amountRequested: rupees(18_59_181), issuer: { name: "IO", rank: "Inspector", station: "Cyber PS Chennai East", state: "TN" }, account: { id: "HG", branchState: "MH" } });
    const checked = checkRequisition(pune, P, overlays);
    expect(checked.route).toBe("MAGISTRATE_S107");
    expect(checked.jurisdiction.conflict).toBe(true);
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "HG", amount: rupees(18_59_181) }, ctx(pune, { account: { id: "HG", type: "SAVINGS", balance: rupees(31_221.21), traced: rupees(82_800) }, assessment: { role: "shield", muleScore: 0.3, signals: [] } }), P);
    expect(r.decision).toBe("ROUTE");
    // If a court orders the full ₹18,59,181 anyway, Scalpel obeys but tells the court the gap.
    const court = evaluateGate({ kind: "EXACT_HOLD", account: "HG", amount: rupees(18_59_181) }, ctx(undefined, { requester: "COURT", account: { id: "HG", type: "SAVINGS", balance: rupees(31_221.21), traced: rupees(82_800) } }), P);
    expect(court.decision).toBe("ALLOW");
    expect(court.flags).toContain("Order exceeds traced amount by ₹17,76,381; tell the court");
  });

  it("8. Navneet Traders (Gujarat HC, 16 Oct 2026): whole current account frozen; court defroze it and kept a ₹18,413.95 lien", () => {
    // The order does not give the account balance; ₹5,00,000 is a stand-in. Gujarat has no s.106 ruling in our rulebook (unsettled).
    // Honest caveat (para 2.6 vs para 8): the bank's letter calls the ₹18,413.95 "shortfall" charges, while the court calls it
    // "the disputed amount credited". The order gives no victim, credit date or layer, so this case cannot be rebuilt
    // through trace(); it tests only the rule "quantify the amount, don't freeze the whole account".
    const acct = { id: "NT", type: "CURRENT" as const, balance: rupees(5_00_000), traced: rupees(18_413.95) };
    const shop = { role: "shield" as const, muleScore: 0.2, signals: [] };
    const valid = real({ asksWholeAccount: true, amountRequested: null, issuer: { name: "IO", rank: "Inspector", station: "Cyber PS", state: "RJ" }, account: { id: "NT", branchState: "GJ" } });
    // The real letter was undated and unsigned: defective, and a shop has no mule signals, so the bank sends the memo back.
    const unsigned = { ...valid, signed: false, signedAt: undefined };
    const bad = evaluateGate({ kind: "WHOLE_FREEZE", account: "NT" }, ctx(unsigned, { account: acct, assessment: shop }), P);
    expect(bad.decision).toBe("ROUTE");
    expect(checkRequisition(unsigned, P, overlays).memo.join(" ")).toMatch(/not signed and dated/);
    // Even a properly signed whole-freeze request is defective (no exact amount); the court's answer, an exact
    // ₹18,413.95 lien, is what the Gate gives once the police state the amount.
    const signedExact = { ...valid, asksWholeAccount: false, amountRequested: rupees(18_413.95) };
    const ok = evaluateGate({ kind: "WHOLE_FREEZE", account: "NT" }, ctx(signedExact, { account: acct, assessment: shop }), P);
    expect(ok.action).toEqual({ kind: "EXACT_HOLD", account: "NT", amount: rupees(18_413.95) });
    expect(ok.badges.sized).toBe(true);
  });

  it("9. Neelkanth Pharma (Delhi HC, 2025; R3 chart only, unverified): ₹93.50 crore frozen over a ₹200 credit, cut to a ₹200 lien", () => {
    const whole = fairnessReport([{ account: "NP", held: rupees(93_50_00_000), traced: rupees(200), group: "CURRENT" }]);
    expect(whole.overall.freezeRatio).toBe(4_675_000);
    expect(whole.overall.innocentHeld).toBe(rupees(93_49_99_800));
    // Delhi HC (Malabar Gold): a police s.106 freeze in Delhi goes to a Magistrate.
    const dl = real({ asksWholeAccount: true, amountRequested: null, issuer: { name: "IO", rank: "Inspector", station: "Cyber PS", state: "DL" }, account: { id: "NP", branchState: "DL" } });
    expect(checkRequisition(dl, P, overlays).route).toBe("MAGISTRATE_S107");
  });
});
