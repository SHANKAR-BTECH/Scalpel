import Link from "next/link";
import { fairnessReport, verifyChain } from "@scalpel/engine";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { model, policyNow } from "@/lib/server/world";
import { inr, pct, ago } from "@/lib/format";
import { ActForm } from "@/components/ActForm";
import { tamperAction } from "@/app/actions";
import { CHOICE_LABEL, REASONS } from "@/lib/server/judge";
import { holderName } from "@/lib/server/world";
import { userById } from "@/lib/users";
import { alertById, ACTION_LABEL } from "@/lib/server/telco";
import { GROUP_LABEL } from "@/lib/server/desk";

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
      <h1>Is every hold the right size, on time, and on the record?</h1>

      <section className="card stats mt-5" data-testid="kpis">
        <div className="stat"><p className="label">Active holds</p><p className="money text-[24px]">{active.length}</p><p className="text-[12.5px] muted">{inr(active.reduce((s, h) => s + h.hold.amount, 0))} held</p></div>
        <div className="stat"><p className="label">Held ÷ victims&apos; money in those accounts</p><p className={`money text-[24px] ${typeof f.overall.freezeRatio === "number" && f.overall.freezeRatio > 1 ? "text-[var(--bad)]" : ""}`} data-testid="freeze-ratio">{typeof f.overall.freezeRatio === "number" ? `${f.overall.freezeRatio.toFixed(2)}×` : "—"}</p><p className="text-[12.5px] muted">1.00× or less means no innocent money held</p></div>
        <div className="stat"><p className="label">Whole accounts frozen</p><p className="money text-[24px]">0</p><p className="text-[12.5px] muted">Scalpel only places exact holds</p></div>
        <div className="stat"><p className="label">Deadlines missed</p><p className={`money text-[24px] ${overdue ? "text-[var(--bad)]" : ""}`}>{overdue}</p><p className="text-[12.5px] muted"><Link className="link" href="/holds">See the clock board</Link></p></div>
      </section>

      <section className="mt-6 card p-4" data-testid="proof-list">
        <h2>The proof, case by case</h2>
        <p className="mt-1 text-[13.5px] muted">What the team did against freezing exactly as the police asked, harm counted both ways. Re-check a sample of lines and sign each case off.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {m.cases.map((c) => {
            const n = c.accounts.filter((x) => d.decisionByAccount.has(x) || d.holdByAccount.has(x)).length;
            const sg = d.proofSigned.get(c.id);
            return (
              <li key={c.id}><Link href={`/assure/proof/${c.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2 text-[13.5px] hover:bg-white/70" data-testid="proof-link">
                <span><span className="mono">{c.id}</span> <span className="muted">· {c.title}</span></span>
                <span className={`chip shrink-0 ${sg ? "chip-good" : n ? "chip-warn" : "chip-grey"}`}>{sg ? "Signed" : n ? `${n} of ${c.accounts.length} decided` : "Not started"}</span>
              </Link></li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 card p-4" data-testid="ledger">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Person and AI: every decision</h2>
          <p className="text-[13px] muted">{d.decisions.length} decisions · {d.decisions.filter((x) => x.agreed).length} agreed with the AI · {d.decisions.filter((x) => !x.agreed).length} overruled</p>
        </div>
        {d.decisions.length === 0 ? <p className="mt-2 text-[13.5px] muted">No decisions yet. They appear here as the fraud officer works cases.</p> : (
          <>
            <ul className="mt-3 flex flex-wrap gap-2">
              {REASONS.map((r) => ({ r, n: d.decisions.filter((x) => x.reason === r).length })).filter((x) => x.n).map((x) => <li key={x.r} className="chip chip-grey">{x.r}: {x.n}</li>)}
            </ul>
            <div className="mt-3 overflow-x-auto">
              <table className="table">
                <thead><tr><th>When</th><th>Account</th><th>AI said</th><th>Person chose</th><th>Reason</th><th>Supervisor check</th></tr></thead>
                <tbody>
                  {[...d.decisions].reverse().slice(0, 30).map((x) => (
                    <tr key={x.did} data-testid="ledger-row">
                      <td className="whitespace-nowrap muted">{ago(x.at, d.now)}</td>
                      <td>{holderName(m.accounts.get(x.account)!.a)} <span className="mono muted">{x.caseId}</span></td>
                      <td>{CHOICE_LABEL[x.ai.suggest]} <span className="muted">({Math.round(x.ai.confidence * 100)}%)</span></td>
                      <td><span className={`chip ${x.agreed ? "chip-good" : "chip-warn"}`}>{CHOICE_LABEL[x.choice]}</span> <span className="muted">by {userById(x.by)?.name ?? x.by}</span></td>
                      <td>{x.reason}{x.note ? <span className="muted">: {x.note}</span> : null}</td>
                      <td>{x.signoff ? (x.signoff.approved ? <span className="text-[var(--good)]">agreed</span> : <span className="text-[var(--bad)]">sent back: {x.signoff.note}</span>) : x.needsSignoff || x.pid ? <span className="muted">waiting</span> : <span className="muted">not needed</span>}{(() => {
                        const rv = x.pid ? d.proposals.find((q) => q.pid === x.pid)?.review : undefined;
                        if (!rv) return null;
                        const sp = rv.spot ? (rv.spot.ok ? "spot-check matched" : rv.spot.ok === false ? "spot-check DIFFERED" : "") : "no spot-check";
                        return <span className={`block text-[12px] ${rv.seconds < 20 || rv.spot?.ok === false ? "text-[var(--warn)]" : "muted"}`} data-testid="review-trace">{rv.checks.length}/4 checks · {sp} · {rv.seconds < 60 ? `${rv.seconds} s` : `${Math.round(rv.seconds / 60)} min`}{rv.seconds < 20 ? " (very fast)" : ""}</span>;
                      })()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="mt-6 card p-4" data-testid="telco-ledger">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2>Telco-A analyst and its AI</h2>
          <p className="text-[13px] muted">{d.telco.length} alerts decided · {d.telco.filter((x) => !x.agreed).length} overruled · {d.telco.reduce((n, x) => n + x.reported.length, 0)} numbers reported to DoT</p>
        </div>
        {d.telco.length === 0 ? <p className="mt-2 text-[13.5px] muted">No Telco-A decisions yet.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Alert</th><th>AI said</th><th>Analyst chose</th><th>Evidence</th><th>Reason</th><th>Reported to DoT</th></tr></thead>
              <tbody>
                {[...d.telco].reverse().map((x) => (
                  <tr key={x.tid} data-testid="telco-ledger-row">
                    <td className="whitespace-nowrap muted">{ago(x.at, d.now)}</td>
                    <td>{alertById(x.alert)?.title ?? x.alert} <span className="mono muted">{x.alert}</span></td>
                    <td>{ACTION_LABEL[x.ai.suggest]} <span className="muted">({Math.round(x.ai.confidence * 100)}%)</span></td>
                    <td><span className={`chip ${x.agreed ? "chip-good" : "chip-warn"}`}>{ACTION_LABEL[x.action]}</span> <span className="muted">by {userById(x.by)?.name ?? x.by}</span></td>
                    <td data-testid="telco-evidence">{x.trace ? <>Trace v{x.trace.version} · {d.traces.get(x.alert)?.pins.length ?? "?"} pins <span className="mono muted">{x.trace.hash.slice(0, 8)}</span>{x.ceir ? <span className="block muted">National block asked (CEIR)</span> : null}{x.cutOff > 0 ? <span className="block text-[var(--warn)]">Cut off {x.cutOff} genuine line{x.cutOff > 1 ? "s" : ""}{x.second ? `; second check: ${x.second}` : ""}</span> : null}</> : <span className="text-[var(--warn)]">no trace</span>}</td>
                    <td>{x.reason}{x.note ? <span className="muted">: {x.note}</span> : null}</td>
                    <td>{x.reported.length ? `${x.reported.length} number${x.reported.length > 1 ? "s" : ""}` : <span className="muted">none</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(d.groups.length > 0 || d.shops.length > 0) && (
          <div className="mt-4 border-t border-[var(--line)] pt-3" data-testid="telco-group-ledger">
            <p className="label">Linked SIMs and shops</p>
            <ul className="mt-1.5 space-y-1.5 text-[13px]">
              {[...d.groups].reverse().map((g) => (
                <li key={g.gid} data-testid="group-ledger-row" data-outcome={g.outcome}>
                  <span className={`chip ${g.outcome === "DONE" ? "chip-good" : "chip-warn"} mr-1.5`}>{g.outcome === "DONE" ? "Done" : "Refused"}</span>
                  {GROUP_LABEL[g.action].split(":")[0]} on {g.sims.length} SIM{g.sims.length === 1 ? "" : "s"} linked to <span className="mono">{g.anchor}</span> ({g.alert}) · {userById(g.by)?.name ?? g.by} · {ago(g.at, d.now)}
                  {g.refused.length > 0 && <span className="block text-[12.5px] text-[var(--warn)]">{g.refused.join("; ")}</span>}
                </li>
              ))}
              {[...d.shops].reverse().map((x, i) => (
                <li key={`s${i}`} data-testid="shop-ledger-row"><span className={`chip ${x.outcome === "SUSPENDED" ? "chip-good" : "chip-warn"} mr-1.5`}>{x.outcome === "SUSPENDED" ? "Shop suspended" : "Refused"}</span><span className="mono">{x.pos}</span> ({x.alert}): {x.why} · {ago(x.at, d.now)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4" data-testid="chain">
          <h2>Tamper check</h2>
          <p className="mt-1 text-[13.5px] muted">Every action is written with a fingerprint (SHA-256) of the one before it. Changing any old record breaks every fingerprint after it.</p>
          <p className={`mt-3 chip ${chainOk.ok ? "chip-good" : "chip-bad"}`}>{chainOk.ok ? `All ${d.chain.length} records intact` : `Broken at record ${chainOk.brokenAt}: ${chainOk.reason}`}</p>
          <ActForm action={tamperAction} label="Run a tamper test" variant="ghost" size="sm" testid="tamper-test" className="mt-3" />
          <p className="mt-1 text-[12px] muted">Quietly changes one old record in a copy and checks whether the fingerprints catch it. The real record is not touched.</p>
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
