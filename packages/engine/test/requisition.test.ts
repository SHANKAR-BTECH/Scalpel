import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { checkRequisition, type Requisition } from "../src/requisition";
import { parseIST } from "../src/time";
import { rupees } from "../src/money";

const { policies, overlays } = loadPolicies(join(__dirname, "../../../policies"));
const policy = policies.find((p) => p.id === "scalpel-2026-12")!;
const t0 = parseIST("2026-12-20T10:00");
const good: Requisition = {
  id: "REQ-1", receivedAt: t0 + 3600e3, basis: "BNSS_106",
  issuer: { name: "Fictional IO", rank: "Inspector", station: "Cyber PS Whitefield", state: "KA" },
  signed: true, signedAt: t0, ncrpAck: "31612260012345", amountRequested: rupees(82800), asksWholeAccount: false,
  account: { id: "BDB-0001", branchState: "KA" }, linkedTxnIds: ["T1"], natureDeclared: "criminal", magistrateIntimatedAt: t0 + 2 * 3600e3,
};

describe("requisition checker", () => {
  it("a complete request in Karnataka is valid with full police authority", () => {
    const r = checkRequisition(good, policy, overlays);
    expect(r.status).toBe("VALID");
    expect(r.authority).toBe("FULL");
  });
  it("lists every defect of a sloppy request and drafts the memo", () => {
    const r = checkRequisition({ ...good, signed: false, ncrpAck: undefined, asksWholeAccount: true, amountRequested: null, linkedTxnIds: [] }, policy, overlays);
    expect(r.status).toBe("DEFECTIVE");
    expect(r.memo.length).toBe(4);
  });
  it("same request against a Mumbai account routes to a Magistrate", () => {
    const r = checkRequisition({ ...good, account: { id: "BDB-2", branchState: "MH" } }, policy, overlays);
    expect(r.authority).toBe("NONE");
    expect(r.route).toBe("MAGISTRATE_S107");
    expect(r.jurisdiction.conflict).toBe(true);
  });
  it("state with no ruling: exact amount only", () => {
    expect(checkRequisition({ ...good, issuer: { ...good.issuer, state: "TN" }, account: { id: "x", branchState: "TN" } }, policy, overlays).authority).toBe("EXACT_ONLY");
  });
  it("Magistrate proof still inside the 24h window is pending, not a defect", () => {
    const r = checkRequisition({ ...good, magistrateIntimatedAt: null }, policy, overlays);
    expect(r.status).toBe("NEEDS_REVIEW");
  });
  it("Magistrate informed late is a defect; low rank is a defect", () => {
    expect(checkRequisition({ ...good, magistrateIntimatedAt: t0 + 30 * 3600e3 }, policy, overlays).status).toBe("DEFECTIVE");
    expect(checkRequisition({ ...good, issuer: { ...good.issuer, rank: "Head Constable" } }, policy, overlays).status).toBe("DEFECTIVE");
  });
  it("NCRP acknowledgement must be 14 digits (R2)", () => {
    const fmt = (ack: string) => checkRequisition({ ...good, firNo: undefined, ncrpAck: ack }, policy, overlays).findings.find((f) => f.checkId === "case_reference")!.ok;
    expect(fmt("31612260012345")).toBe(true);
    expect(fmt("3161226001234")).toBe(false);
    expect(fmt("316122600123456")).toBe(false);
  });
});
