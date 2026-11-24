/**
 * Line-by-line engine review (24 Nov 2026): one test per gap found, so each fix stays fixed.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { evaluateGate, type GateContext } from "../src/gate";
import { checkRequisition, type Requisition } from "../src/requisition";
import { createHold, applyEvent, clockViews } from "../src/lifecycle";
import { parseIST } from "../src/time";
import { rupees } from "../src/money";

const { policies, overlays } = loadPolicies(join(__dirname, "../../../policies"));
const P = policies.find((p) => p.id === "scalpel-2026-12")!;
const t0 = parseIST("2026-12-20T10:00");
const H = 3600e3;
const req: Requisition = {
  id: "R", receivedAt: t0 + H, basis: "BNSS_106", issuer: { name: "IO", rank: "Inspector", station: "PS", state: "KA" },
  signed: true, signedAt: t0, ncrpAck: "31612260012345", amountRequested: rupees(50_000), asksWholeAccount: false,
  account: { id: "A1", branchState: "KA" }, linkedTxnIds: ["T1"], natureDeclared: "criminal", magistrateIntimatedAt: t0 + H,
};
const ctx = (r: Requisition = req, over: Partial<GateContext> = {}): GateContext => ({
  at: t0 + 2 * H, requester: "POLICE", requisition: checkRequisition(r, P, overlays),
  account: { id: "A1", type: "SAVINGS", balance: rupees(2_00_000), traced: rupees(80_000) },
  assessment: { role: "mule", muleScore: 0.9, signals: ["DWELL_LT_15M", "ACCOUNT_AGE_LT_30D"] }, officerConfirmed: false, evidenceRecordId: "EV", ...over,
});

describe("engine review fixes", () => {
  it("a police request for one account can't be used to hold another", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "B2", amount: rupees(10_000) }, ctx(req, { account: { id: "B2", type: "SAVINGS", balance: rupees(50_000), traced: rupees(10_000) } }), P);
    expect(r.decision).toBe("ROUTE");
    expect(r.checks.find((c) => c.rule === "R0")!.note).toMatch(/names account A1, not B2/);
  });

  it("the hold never goes above what the police asked for, even if more was traced", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(80_000) }, ctx(), P);
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "A1", amount: rupees(50_000) });
    expect(r.checks.find((c) => c.rule === "R1")!.note).toMatch(/police asked for ₹50,000/);
  });

  it("a whole-freeze request turned into an exact hold is also capped at the amount asked (none asked -> traced)", () => {
    const r = evaluateGate({ kind: "WHOLE_FREEZE", account: "A1" }, ctx({ ...req, asksWholeAccount: true, amountRequested: null }), P);
    // whole-account request is defective -> bank's own hold on the traced amount
    expect(r.action).toEqual({ kind: "EXACT_HOLD", account: "A1", amount: rupees(80_000) });
  });

  it("the bank's own fallback hold respects RBI's exempt account types", () => {
    const exempt = P.regimes.RBI_BANK!.exempt_account_types[0];
    if (!exempt) return; // nothing exempt in this policy
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(80_000) },
      ctx({ ...req, signed: false }, { account: { id: "A1", type: exempt as never, balance: rupees(2_00_000), traced: rupees(80_000) } }), P);
    expect(r.decision).toBe("ROUTE");
    expect(r.checks.find((c) => c.rule === "R0")!.note).toMatch(/exempt/);
  });

  it("proof of informing the Magistrate: pending within 24 hours, a defect once 24 hours have passed", () => {
    const noProof = { ...req, magistrateIntimatedAt: null };
    expect(checkRequisition(noProof, P, overlays).status).toBe("NEEDS_REVIEW");
    expect(checkRequisition(noProof, P, overlays, t0 + 23 * H).status).toBe("NEEDS_REVIEW");
    const later = checkRequisition(noProof, P, overlays, t0 + 25 * H);
    expect(later.status).toBe("DEFECTIVE");
    expect(later.memo.join(" ")).toMatch(/No proof the Magistrate was informed/);
  });

  it("a request dated after the bank received it is defective", () => {
    const r = checkRequisition({ ...req, signedAt: req.receivedAt + H }, P, overlays);
    expect(r.status).toBe("DEFECTIVE");
    expect(r.memo.join(" ")).toMatch(/dated after the bank received it/);
  });

  it("a lien bigger than today's balance is amber on Right size? (it will catch later clean credits)", () => {
    const r = evaluateGate({ kind: "EXACT_HOLD", account: "A1", amount: rupees(50_000) }, ctx(req, { account: { id: "A1", type: "SAVINGS", balance: rupees(31_221.21), traced: rupees(82_800) } }), P);
    expect(r.badgeStates.sized).toBe("caution");
    expect(r.badgeReasons.sized.join(" ")).toMatch(/later credits/);
  });

  it("after a release, open deadlines stop running; one already missed stays a breach", () => {
    const h = createHold({ id: "H", account: "A1", amount: rupees(30_000), regime: "RBI_BANK", at: t0, by: "officer", policy: P });
    const quick = applyEvent(h, { type: "RELEASED", at: t0 + H, by: "officer" }, P);
    const views = clockViews(quick, P, t0 + 90 * 24 * H);
    expect(views.some((v) => v.state === "EXPIRED" || v.state === "RUNNING" || v.state === "ALERT")).toBe(false);
    const slow = applyEvent(h, { type: "RELEASED", at: t0 + 5 * 24 * H, by: "officer" }, P);
    // the 1-day notice was missed before the release: the breach stays on the record
    expect(["EXPIRED", "SATISFIED_LATE"]).toContain(clockViews(slow, P, t0 + 90 * 24 * H).find((v) => v.clock.id === "notice")!.state);
  });

  it("Allahabad HC (UP): police may freeze under s.106; UP + Maharashtra still goes to a Magistrate", () => {
    const up = checkRequisition({ ...req, issuer: { ...req.issuer, state: "UP" }, account: { id: "A1", branchState: "UP" } }, P, overlays);
    expect(up.authority).toBe("FULL");
    const mixed = checkRequisition({ ...req, issuer: { ...req.issuer, state: "UP" }, account: { id: "A1", branchState: "MH" } }, P, overlays);
    expect(mixed.route).toBe("MAGISTRATE_S107");
  });
});
