/**
 * "Is the law in the rulebook checked?" Every rule check must say which of its
 * sources are still unverified, so the screens can show an "unverified" label.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { load as yamlLoad } from "js-yaml";
import { loadPolicies } from "../src/node";
import { unverifiedSources, type PolicySet } from "../src/policy";
import { evaluateGate, type GateContext } from "../src/gate";
import { checkRequisition, type Requisition } from "../src/requisition";
import { parseIST } from "../src/time";
import { rupees } from "../src/money";

const dir = join(__dirname, "../../../policies");
const { policies, overlays } = loadPolicies(dir);
const P = policies.find((p) => p.id === "scalpel-2026-12")!;
const t0 = parseIST("2026-12-20T10:00");
const req: Requisition = {
  id: "R", receivedAt: t0 + 3600e3, basis: "BNSS_106", issuer: { name: "IO", rank: "Inspector", station: "PS", state: "KA" },
  signed: true, signedAt: t0, ncrpAck: "31612260012345", amountRequested: rupees(1859000), asksWholeAccount: false,
  account: { id: "A1", branchState: "KA" }, linkedTxnIds: ["T1"], natureDeclared: "criminal", magistrateIntimatedAt: t0 + 3600e3,
};
const ctx = (policy: PolicySet): GateContext => ({
  at: t0, requester: "POLICE", requisition: checkRequisition(req, policy, overlays),
  account: { id: "A1", type: "CURRENT", balance: rupees(1859000), traced: rupees(82800) },
  assessment: { role: "shield", muleScore: 0.2, signals: [] }, officerConfirmed: false, evidenceRecordId: "EV-1",
});
// U = the same policy with every source unverified (how it was before R1), so the label logic is tested on its own.
const U: PolicySet = { ...P, sources: P.sources.map((s) => ({ ...s, verified: false })) };
const withVerified = (id: string): PolicySet => ({ ...U, sources: U.sources.map((s) => (s.id === id ? { ...s, verified: true } : s)) });
const cut = { kind: "EXACT_HOLD" as const, account: "A1", amount: rupees(1859000) };

describe("verified / unverified sources", () => {
  it("unverifiedSources lists the ids not yet checked (unknown ids count as unverified)", () => {
    expect(unverifiedSources(U, ["himanshu-gupta", "bnss"])).toEqual(["himanshu-gupta", "bnss"]);
    expect(unverifiedSources(withVerified("bnss"), ["himanshu-gupta", "bnss"])).toEqual(["himanshu-gupta"]);
    expect(unverifiedSources(P, ["no-such-source"])).toEqual(["no-such-source"]);
    expect(unverifiedSources(P, [])).toEqual([]);
  });

  it("a Gate check citing Himanshu Gupta says it is unverified, and the decision carries a flag", () => {
    const r = evaluateGate(cut, ctx(U), U);
    const r1 = r.checks.find((c) => c.rule === "R1")!;
    expect(r1.sources).toContain("himanshu-gupta");
    expect(r1.unverified).toEqual(["himanshu-gupta"]);
    expect(r.flags).toContain("Some cited sources are unverified");
  });

  it("once the source is marked verified, the label goes away", () => {
    const V = withVerified("himanshu-gupta");
    const r = evaluateGate(cut, ctx(V), V);
    expect(r.checks.find((c) => c.rule === "R1")!.unverified).toEqual([]);
  });

  it("every check and every request finding carries an unverified list", () => {
    const r = evaluateGate(cut, ctx(P), P);
    for (const c of r.checks) expect(c.unverified).toEqual(c.sources.filter((s) => !P.sources.find((x) => x.id === s)?.verified));
    const q = checkRequisition({ ...req, asksWholeAccount: true }, P, overlays);
    const exact = q.findings.find((f) => f.checkId === "exact_amount")!;
    expect(exact.sources).toEqual(["allahabad-protocol", "himanshu-gupta"]);
    expect(exact.unverified).toEqual([]); // both confirmed by R1
    const qU = checkRequisition({ ...req, asksWholeAccount: true }, U, overlays);
    expect(qU.findings.find((f) => f.checkId === "exact_amount")!.unverified).toEqual(["allahabad-protocol", "himanshu-gupta"]);
  });

  it("the three copies of the source list (sources.yaml and both policies) are identical", () => {
    const shared = yamlLoad(readFileSync(join(dir, "sources.yaml"), "utf8")) as { id: string }[];
    const norm = (xs: object[]) => JSON.stringify(xs.map((x) => ({ verified: false, ...x })).sort((a: any, b: any) => a.id.localeCompare(b.id)));
    for (const p of policies) expect(norm(p.sources)).toBe(norm(shared));
  });

  it("R1 result: exactly these sources are verified; partly-wrong ones stay unverified until Shankar checks", () => {
    const unverified = P.sources.filter((s) => !s.verified).map((s) => s.id).sort();
    expect(unverified).toEqual(["kartik-chatur", "mha-sop-2026-01", "trai-tcccpr-2", "trai-tcccpr-3"]);
    for (const s of P.sources.filter((x) => x.verified)) expect(s.date, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(P.sources.map((s) => s.id).join(" ")).not.toMatch(/15\.12/);
  });

  it("each High Court overlay starts on the date of the ruling it follows (no placeholder dates left)", () => {
    for (const o of overlays) {
      expect(o.effective_from, o.id).not.toBe("2025-01-01");
      const dates = o.sources.map((id) => P.sources.find((s) => s.id === id)?.date);
      expect(dates, o.id).toContain(o.effective_from);
    }
  });

  it("Rs 50,000: no limit on the 90-day lift (R1); victim fast refund kept but shown unverified", () => {
    const r4 = evaluateGate(cut, ctx(P), P).checks.find((c) => c.rule === "R4");
    expect(r4).toBeUndefined(); // ₹18,59,181 is above ₹50,000
    const small = evaluateGate({ ...cut, amount: rupees(40_000) }, { ...ctx(P), account: { id: "A1", type: "CURRENT", balance: rupees(40_000), traced: rupees(40_000) } }, P);
    expect(small.checks.find((c) => c.rule === "R4")).toMatchObject({ ok: true, unverified: ["mha-sop-2026-01"] });
    const mha = P.regimes.MHA_POLICE!;
    for (const c of mha.clocks) expect(c.amount_below, c.id).toBeUndefined();
    expect(P.regimes.TRAI_UCC!.clocks.find((c) => c.id === "bar_review")!.sources).toEqual(["trai-tcccpr-2"]);
  });
});
