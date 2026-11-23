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
const withVerified = (id: string): PolicySet => ({ ...P, sources: P.sources.map((s) => (s.id === id ? { ...s, verified: true } : s)) });
const cut = { kind: "EXACT_HOLD" as const, account: "A1", amount: rupees(1859000) };

describe("verified / unverified sources", () => {
  it("unverifiedSources lists the ids not yet checked (unknown ids count as unverified)", () => {
    expect(unverifiedSources(P, ["himanshu-gupta", "bnss"])).toEqual(["himanshu-gupta", "bnss"]);
    expect(unverifiedSources(withVerified("bnss"), ["himanshu-gupta", "bnss"])).toEqual(["himanshu-gupta"]);
    expect(unverifiedSources(P, ["no-such-source"])).toEqual(["no-such-source"]);
    expect(unverifiedSources(P, [])).toEqual([]);
  });

  it("a Gate check citing Himanshu Gupta says it is unverified, and the decision carries a flag", () => {
    const r = evaluateGate(cut, ctx(P), P);
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
    expect(exact.unverified).toEqual(["allahabad-protocol", "himanshu-gupta"]);
  });

  it("the three copies of the source list (sources.yaml and both policies) are identical", () => {
    const shared = yamlLoad(readFileSync(join(dir, "sources.yaml"), "utf8")) as { id: string }[];
    const norm = (xs: object[]) => JSON.stringify(xs.map((x) => ({ verified: false, ...x })).sort((a: any, b: any) => a.id.localeCompare(b.id)));
    for (const p of policies) expect(norm(p.sources)).toBe(norm(shared));
  });

  it("reminder: these High Court rulings still have placeholder dates until R1 confirms them", () => {
    const placeholder = overlays.filter((o) => o.effective_from === "2025-01-01").map((o) => o.id).sort();
    // When R1 gives the real ruling dates, update the overlay files and shrink this list.
    expect(placeholder).toEqual(["hc-bombay", "hc-delhi", "hc-karnataka", "hc-kerala"]);
    for (const o of overlays) expect(unverifiedSources(P, o.sources).length).toBeGreaterThan(0);
  });
});
