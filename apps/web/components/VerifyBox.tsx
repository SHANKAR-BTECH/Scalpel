"use client";
import { useState } from "react";
import { verifyEvidencePack, type EvidencePack } from "@scalpel/engine";

export function VerifyBox() {
  const [out, setOut] = useState<{ ok: boolean; problems: string[]; caseId?: string; n?: number } | null>(null);
  const check = async (text: string) => {
    try {
      const p = JSON.parse(text) as EvidencePack;
      if (p.kind !== "scalpel-evidence-pack/v1") throw new Error("not a Scalpel evidence file");
      setOut({ ...(await verifyEvidencePack(p)), caseId: p.caseId, n: p.entries.length });
    } catch (e) {
      setOut({ ok: false, problems: [`Could not read the file: ${(e as Error).message}`] });
    }
  };
  return (
    <div className="card mt-5 p-5">
      <input type="file" accept="application/json,.json" data-testid="verify-file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await check(await f.text()); }} className="block text-[14px]" />
      <details className="mt-3 text-[13.5px]"><summary className="link">or paste the file&apos;s text</summary>
        <textarea rows={6} className="input mt-2 mono text-[12px]" data-testid="verify-text" onChange={(e) => e.target.value.trim() && check(e.target.value)} />
      </details>
      {out && (
        <div role="status" data-testid="verify-result" className={`mt-4 rounded-xl p-3 text-[14px] ${out.ok ? "bg-[var(--good-tint)] text-[var(--good)]" : "bg-[var(--bad-tint)] text-[var(--bad)]"}`}>
          {out.ok ? <p className="font-semibold">Intact: all {out.n} records for {out.caseId} match their fingerprints.</p> : <><p className="font-semibold">Not intact</p><ul className="mt-1 list-disc pl-5">{out.problems.map((p) => <li key={p}>{p}</li>)}</ul></>}
        </div>
      )}
    </div>
  );
}
