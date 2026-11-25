import Link from "next/link";
import { fairnessReport, verifyChain } from "@scalpel/engine";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { model, policyNow } from "@/lib/server/world";
import { inr, pct } from "@/lib/format";

const GROUP: Record<string, string> = { small_shop: "Small shops", salaried: "Salaried", gig_worker: "Gig workers", student: "Students", pensioner: "Pensioners", homemaker: "Homemakers", other: "Others" };

export default async function Assure() {
  await requireUser("auditor");
  const d = await desk();
  const m = model();
  const policy = policyNow(d.now);
  const chainOk = await verifyChain(d.chain);
  const active = d.holds.filter((h) => h.hold.state === "ACTIVE");
  // Every account with victim money in it: held amount (0 if none) against the traced amount.
  const rows = [...m.accounts.values()].filter((v) => v.traced > 0).map((v) => ({ account: v.a.id, held: d.holdByAccount.get(v.a.id)?.hold.amount ?? 0, traced: v.traced, group: v.a.holder.group }));
  const heldRows = rows.filter((r) => r.held > 0);
  const f = fairnessReport(heldRows);
  const overdue = active.filter((r) => r.clocks.some((c) => c.state === "EXPIRED")).length;
  const verified = policy.sources.filter((s) => s.verified).length;
  const cases = m.cases.map((c) => ({ c, n: d.chain.filter((e) => e.caseId === c.id).length })).filter((x) => x.n > 0);
  return (
    <div>
      <p className="eyebrow">Assure · compliance and audit</p>
      <h1 className="mt-1">Is every hold the right size, on time, and on the record?</h1>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="kpis">
        <div className="card p-4"><p className="text-[13px] muted">Active holds</p><p className="money text-[26px]">{active.length}</p><p className="text-[12.5px] muted">{inr(active.reduce((s, h) => s + h.hold.amount, 0))} held</p></div>
        <div className="card p-4"><p className="text-[13px] muted">Held ÷ victims&apos; money in those accounts</p><p className={`money text-[26px] ${typeof f.overall.freezeRatio === "number" && f.overall.freezeRatio > 1 ? "text-[var(--bad)]" : ""}`} data-testid="freeze-ratio">{typeof f.overall.freezeRatio === "number" ? `${f.overall.freezeRatio.toFixed(2)}×` : "—"}</p><p className="text-[12.5px] muted">1.00× or less means no innocent money held</p></div>
        <div className="card p-4"><p className="text-[13px] muted">Whole accounts frozen</p><p className="money text-[26px]">0</p><p className="text-[12.5px] muted">Scalpel only places exact holds</p></div>
        <div className="card p-4"><p className="text-[13px] muted">Deadlines missed</p><p className={`money text-[26px] ${overdue ? "text-[var(--bad)]" : ""}`}>{overdue}</p><p className="text-[12.5px] muted"><Link className="link" href="/holds">See the clock board</Link></p></div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4" data-testid="chain">
          <h2>Tamper check</h2>
          <p className="mt-1 text-[13.5px] muted">Every action is written with a fingerprint (SHA-256) of the one before it. Changing any old record breaks every fingerprint after it.</p>
          <p className={`mt-3 chip ${chainOk.ok ? "chip-good" : "chip-bad"}`}>{chainOk.ok ? `All ${d.chain.length} records intact` : `Broken at record ${chainOk.brokenAt}: ${chainOk.reason}`}</p>
          {d.chain.length > 0 && <p className="mt-2 break-all mono text-[11.5px] muted">Latest fingerprint {d.chain.at(-1)!.hash}</p>}
        </div>
        <div className="card p-4">
          <h2>Rules in force</h2>
          <p className="mt-1 text-[14px]">{policy.title}</p>
          <p className="mt-1 text-[13px] muted">Version <span className="mono">{policy.id}</span> · from {policy.effective_from} · status <span className="chip chip-warn">{policy.status}</span></p>
          <p className="mt-2 text-[13px] muted">{verified} of {policy.sources.length} legal sources checked against the original text. RBI&apos;s bank-hold rules are a draft that would apply from 1 April 2027, so holds resting on them are marked amber.</p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card p-4">
          <h2>Evidence files</h2>
          <p className="mt-1 text-[13.5px] muted">One file per case: every record about it, its fingerprints, and a certificate form (BSA s.63). Anyone can check it on the public Verify page.</p>
          {cases.length === 0 && <p className="mt-3 text-[13.5px] muted">No case has any action yet.</p>}
          <ul className="mt-3 divide-y divide-[var(--line)]" data-testid="evidence-list">
            {cases.map(({ c, n }) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
                <span><span className="mono">{c.id}</span> · {c.scamType} · {n} records</span>
                <a className="btn btn-ghost btn-sm" href={`/api/evidence/${c.id}`} data-testid={`evidence-${c.id}`}>Download</a>
              </li>
            ))}
          </ul>
          <a className="btn btn-ghost btn-sm mt-3" href="/api/holds-csv">Download holds register (CSV)</a>
        </div>
        <div className="card p-4">
          <h2>Who carries the holds</h2>
          <p className="mt-1 text-[13.5px] muted">Held against the victims&apos; money in each group&apos;s accounts. Above 1.00× would mean innocent money is caught.</p>
          <table className="table mt-2">
            <thead><tr><th>Group</th><th>Accounts</th><th>Held</th><th>Ratio</th></tr></thead>
            <tbody>
              {Object.entries(f.byGroup).map(([g, s]) => (
                <tr key={g}><td>{GROUP[g] ?? g}</td><td>{s.accounts}</td><td className="money">{inr(s.held)}</td><td>{typeof s.freezeRatio === "number" ? `${s.freezeRatio.toFixed(2)}×` : "—"}</td></tr>
              ))}
              {heldRows.length === 0 && <tr><td colSpan={4} className="muted">No holds yet.</td></tr>}
            </tbody>
          </table>
          <p className="mt-2 text-[12.5px] muted">Victims&apos; money still unheld across all cases: {inr(rows.reduce((s, r) => s + Math.max(0, r.traced - r.held), 0))} ({pct(1 - heldRows.reduce((s, r) => s + r.held, 0) / Math.max(1, rows.reduce((s, r) => s + r.traced, 0)))}).</p>
        </div>
      </section>
    </div>
  );
}
