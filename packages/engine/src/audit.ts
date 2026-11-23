/**
 * Tamper-evident audit: canonical JSON -> SHA-256 hash chain -> Merkle root per case.
 * Uses Web Crypto so the same code verifies packs inside the browser (/verify page).
 */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function canonicalJSON(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new TypeError("non-finite number"); return JSON.stringify(v); }
  if (typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJSON(x))).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJSON(o[k])}`).join(",")}}`;
  }
  throw new TypeError(`cannot canonicalise ${typeof v}`);
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hex(await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export const GENESIS = "0".repeat(64);
export interface AuditEntry { seq: number; at: number; actor: string; type: string; caseId: string; payload: Json; prevHash: string; hash: string }

export async function appendEntry(chain: AuditEntry[], e: Omit<AuditEntry, "seq" | "prevHash" | "hash">): Promise<AuditEntry> {
  const prev = chain.at(-1);
  const body = { ...e, seq: prev ? prev.seq + 1 : 0, prevHash: prev ? prev.hash : GENESIS };
  return { ...body, hash: await sha256Hex(canonicalJSON(body)) };
}

export async function verifyChain(chain: AuditEntry[]): Promise<{ ok: true } | { ok: false; brokenAt: number; reason: string }> {
  let prevHash = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const { hash, ...body } = chain[i]!;
    if (body.seq !== i) return { ok: false, brokenAt: i, reason: "sequence gap" };
    if (body.prevHash !== prevHash) return { ok: false, brokenAt: i, reason: "link to previous entry broken" };
    if ((await sha256Hex(canonicalJSON(body))) !== hash) return { ok: false, brokenAt: i, reason: "entry content changed" };
    prevHash = hash;
  }
  return { ok: true };
}

// Merkle tree (RFC 6962 style domain separation: 0x00 leaf, 0x01 node)
const leafHash = (h: string) => sha256Hex(new Uint8Array([0, ...fromHex(h)]));
const nodeHash = (l: string, r: string) => sha256Hex(new Uint8Array([1, ...fromHex(l), ...fromHex(r)]));

async function levels(hashes: string[]): Promise<string[][]> {
  if (hashes.length === 0) return [[await sha256Hex("")]];
  const out = [await Promise.all(hashes.map(leafHash))];
  while (out.at(-1)!.length > 1) {
    const cur = out.at(-1)!; const next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? await nodeHash(cur[i]!, cur[i + 1]!) : cur[i]!);
    out.push(next);
  }
  return out;
}
export const merkleRoot = async (hashes: string[]) => (await levels(hashes)).at(-1)![0]!;

export interface ProofStep { side: "L" | "R"; hash: string }
export async function merkleProof(hashes: string[], index: number): Promise<ProofStep[]> {
  const lv = await levels(hashes); const proof: ProofStep[] = [];
  let i = index;
  for (let d = 0; d < lv.length - 1; d++) {
    const row = lv[d]!; const sib = i ^ 1;
    if (sib < row.length) proof.push({ side: sib < i ? "L" : "R", hash: row[sib]! });
    i = Math.floor(i / 2);
  }
  return proof;
}
export async function verifyProof(recordHash: string, proof: ProofStep[], root: string): Promise<boolean> {
  let h = await leafHash(recordHash);
  for (const s of proof) h = s.side === "L" ? await nodeHash(s.hash, h) : await nodeHash(h, s.hash);
  return h === root;
}

/** Evidence pack for one case. Certificate field wording is provisional until research prompt R2. */
export interface EvidencePack {
  kind: "scalpel-evidence-pack/v1";
  watermark: "SIMULATION – NOT AN OFFICIAL ORDER";
  caseId: string; generatedAt: number; algorithm: "SHA-256";
  entries: AuditEntry[]; merkleRoot: string; chainHead: string;
  certificate: { partA: Record<string, string>; partB: Record<string, string> };
}

export async function buildEvidencePack(caseId: string, chain: AuditEntry[], generatedAt: number, org: { name: string; system: string }): Promise<EvidencePack> {
  const entries = chain.filter((e) => e.caseId === caseId);
  const v = await verifyChain(chain);
  if (!v.ok) throw new Error(`audit chain broken at ${v.brokenAt}: ${v.reason}`);
  const root = await merkleRoot(entries.map((e) => e.hash));
  return {
    kind: "scalpel-evidence-pack/v1", watermark: "SIMULATION – NOT AN OFFICIAL ORDER", caseId, generatedAt, algorithm: "SHA-256",
    entries, merkleRoot: root, chainHead: chain.at(-1)?.hash ?? GENESIS,
    certificate: {
      partA: {
        "Organisation": org.name, "Computer system / device": org.system, "Records": `${entries.length} audit entries for case ${caseId}`,
        "Produced in the ordinary course of activities": "Yes (simulation)", "Hash algorithm": "SHA-256", "Merkle root of records": root,
        "Signed by (party)": "____________", "Date": new Date(generatedAt).toISOString().slice(0, 10),
      },
      partB: { "Expert name and qualification": "____________", "Hash values verified": "____________", "Expert signature and date": "____________" },
    },
  };
}

/** What the /verify page runs in the browser. */
export async function verifyEvidencePack(p: EvidencePack): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  for (let i = 0; i < p.entries.length; i++) {
    const { hash, ...body } = p.entries[i]!;
    if ((await sha256Hex(canonicalJSON(body))) !== hash) problems.push(`Record ${body.seq} was changed after it was written`);
    if (body.caseId !== p.caseId) problems.push(`Record ${body.seq} belongs to another case`);
  }
  if ((await merkleRoot(p.entries.map((e) => e.hash))) !== p.merkleRoot) problems.push("Records added, removed or reordered: case fingerprint does not match");
  if (p.certificate.partA["Merkle root of records"] !== p.merkleRoot) problems.push("Certificate fingerprint does not match the records");
  return { ok: problems.length === 0, problems };
}
