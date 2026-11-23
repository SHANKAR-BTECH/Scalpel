import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { canonicalJSON, appendEntry, verifyChain, merkleRoot, merkleProof, verifyProof, buildEvidencePack, verifyEvidencePack, type AuditEntry } from "../src/audit";

async function chainOf(n: number) {
  const c: AuditEntry[] = [];
  for (let i = 0; i < n; i++) c.push(await appendEntry(c, { at: 1000 + i, actor: "officer-1", type: i % 2 ? "HOLD_PLACED" : "GATE_DECISION", caseId: i % 3 ? "C1" : "C2", payload: { amount: 8280000 + i, note: "₹82,800" } }));
  return c;
}

describe("audit", () => {
  it("canonical JSON ignores key order", () => {
    expect(canonicalJSON({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonicalJSON({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });
  it("chain verifies, and any edit is caught at the right place", async () => {
    const c = await chainOf(6);
    expect(await verifyChain(c)).toEqual({ ok: true });
    const bad = c.map((e) => ({ ...e }));
    bad[3] = { ...bad[3]!, payload: { amount: 1 } };
    expect(await verifyChain(bad)).toMatchObject({ ok: false, brokenAt: 3, reason: "entry content changed" });
    expect(await verifyChain(c.filter((_, i) => i !== 2))).toMatchObject({ ok: false, brokenAt: 2 });
  });
  it("Merkle proofs verify for every leaf, for any tree size", async () => {
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 17 }), async (n) => {
      const hs = (await chainOf(n)).map((e) => e.hash);
      const root = await merkleRoot(hs);
      for (let i = 0; i < n; i++) expect(await verifyProof(hs[i]!, await merkleProof(hs, i), root)).toBe(true);
      expect(await verifyProof(hs[0]!, await merkleProof(hs, 0), "f".repeat(64))).toBe(false);
    }), { numRuns: 17 });
  });
  it("evidence pack verifies; tampering, dropping or certificate edits are caught", async () => {
    const c = await chainOf(7);
    const pack = await buildEvidencePack("C1", c, Date.UTC(2026, 11, 20), { name: "Bharat Demo Bank", system: "Scalpel" });
    expect(await verifyEvidencePack(pack)).toEqual({ ok: true, problems: [] });
    const t1 = structuredClone(pack); (t1.entries[1]!.payload as any).amount = 1;
    expect((await verifyEvidencePack(t1)).problems[0]).toMatch(/changed/);
    const t2 = structuredClone(pack); t2.entries.pop();
    expect((await verifyEvidencePack(t2)).problems.join()).toMatch(/fingerprint/);
    const t3 = structuredClone(pack); t3.certificate.partA["Merkle root of records"] = "0";
    expect((await verifyEvidencePack(t3)).ok).toBe(false);
  });
});
