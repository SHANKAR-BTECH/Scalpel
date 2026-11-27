import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { caseProof, type Rule, type RowStatus } from "@/lib/server/proof";
import { inr, when } from "@/lib/format";
import { ActForm } from "@/components/ActForm";
import { proofCheckAction, proofSignAction } from "@/app/actions";
import { userById } from "@/lib/users";

const STATUS: Record<RowStatus, string> = { held: "Held", waiting: "Waiting for approval", "no-hold": "No hold", "sent-back": "Request sent back", released: "Released", undecided: "Not decided" };

function RuleLine({ r }: { r: Rule }) {
  return (
    <li className="text-[13px]">
      <span className="font-medium">{r.label}.</span> <span className="muted">{r.source}{r.ref ? ` (${r.ref})` : ""}.</span>{" "}
      <span className={`chip ${r.assumed ? "chip-grey" : r.proposed ? "chip-warn" : r.verified ? "chip-good" : "chip-grey"}`}>{r.assumed ? "Our model of past practice, the baseline" : r.proposed ? "Proposed, not yet in force" : r.verified ? "Checked against the original" : "Not yet checked against the original"}</span>
    </li>
  );
}

export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("auditor");
  const { id } = await params;
  const d = await desk();
  const p = caseProof(d, id);
  if (!p) notFound();
  const t = p.totals;
  const allChecked = p.picks.every((x) => x.check);
  return (
    <div>
      <Link href="/assure" className="link inline-flex items-center gap-1 text-[13.5px]"><ChevronLeft size={15} aria-hidden />Assure</Link>
      <h1 className="mt-2">The proof: {p.caseId}</h1>
      <p className="mt-1 text-[13.5px] muted">{p.title}. Built live from the record: what the team did, next to freezing exactly as the police asked. Both are counted on the same {t.decided} decided account{t.decided === 1 ? "" : "s"}.</p>

      {t.decided === 0 ? (
        <p className="card mt-5 p-5 text-[14px] muted" data-testid="proof-empty">Nothing on this case is decided yet. The proof fills in as the team decides accounts.</p>
      ) : <>
      <section className="card stats mt-5" data-testid="proof-kpis">
        <div className="stat"><p className="label">Victims&apos; money held</p><p className="money text-[24px]" data-testid="kpi-team">{inr(t.team - t.overTeam)}</p><p className="text-[12.5px] muted">of {inr(t.traced)} traced to these accounts</p></div>
        <div className="stat"><p className="label">Held with no traced victim link</p><p className={`money text-[24px] ${t.overTeam ? "text-[var(--bad)]" : ""}`} data-testid="kpi-over">{inr(t.overTeam)}</p><p className="text-[12.5px] muted">Freezing as asked: <b className="text-[var(--bad)]" data-testid="kpi-over-fast">{inr(t.overFast)}</b></p></div>
        <div className="stat"><p className="label">Victims&apos; money left free</p><p className={`money text-[24px] ${t.accepted ? "text-[var(--warn)]" : ""}`} data-testid="kpi-accepted">{inr(t.accepted)}</p><p className="text-[12.5px] muted">The risk the team accepted (freezing as asked: {inr(Math.max(0, t.traced - (t.fast - t.overFast)))})</p></div>
        <div className="stat"><p className="label">Genuine phone lines cut</p>{t.phonesDecided ? <><p className={`money text-[24px] ${t.teamGenuine ? "text-[var(--bad)]" : ""}`} data-testid="kpi-phones">{t.teamGenuine}</p><p className="text-[12.5px] muted">A blind sweep: <b className="text-[var(--bad)]">{t.sweepGenuine}</b>{t.sweepIdOwners ? ` (incl. ${t.sweepIdOwners} real owner${t.sweepIdOwners > 1 ? "s" : ""} of a stolen ID)` : ""}. On {t.phonesDecided} of {t.phones} phone alert{t.phones === 1 ? "" : "s"} decided.</p></> : <><p className="money text-[24px] muted" data-testid="kpi-phones">—</p><p className="text-[12.5px] muted">{t.phones ? `Telco-A hasn't decided this case's ${t.phones} phone alert${t.phones === 1 ? "" : "s"} yet.` : "No phone alerts on this case."}</p></>}</div>
      </section>
      <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        <p className="rounded-xl bg-white/60 px-3 py-2"><b>{inr(t.gone)}</b> of victims&apos; money had already left as cash, crypto or gold before anyone could act. No freeze reaches it, fast or right.</p>
        <p className="rounded-xl bg-white/60 px-3 py-2" data-testid="proof-undecided"><b>{t.undecided} account{t.undecided === 1 ? "" : "s"}</b> not decided yet ({inr(t.undecidedTraced)} traced there). They are left out of both columns, not guessed.</p>
      </div>

      <section className="card mt-5 p-4" data-testid="proof-accounts">
        <h2>Account by account</h2>
        <p className="mt-1 text-[13px] muted">&quot;Victims&apos; money traced&quot; is Scalpel&apos;s pro-rata trace of the reported complaints only. Money with no traced victim link may still be the scammer&apos;s, or belong to victims who haven&apos;t reported yet. Red lines have a mistake the desk can check.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="table w-full min-w-[920px] text-[13px]">
            <thead><tr><th>Holder</th><th>Mule-score model</th><th>Police asked</th><th>Freeze as asked</th><th>Team</th><th>Victims&apos; money traced</th><th>No victim link held (asked · team)</th><th>Left free</th></tr></thead>
            <tbody>{p.rows.map((r) => (
              <tr key={r.account} data-testid="proof-row" data-status={r.status} data-red={r.issues.length > 0} className={r.decided ? (r.issues.length ? "bg-[var(--bad-tint,#fdecec)]" : "") : "opacity-50"}>
                <td>{r.holder}<span className="block mono text-[11.5px] muted">{r.account}</span>{r.issues.map((x) => <span key={x} className="mt-1 flex gap-1 text-[12px] text-[var(--bad)]"><TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden />{x}</span>)}</td>
                <td className="text-[12.5px]">{r.band}</td>
                <td className="whitespace-nowrap">{r.askedWhole ? <>Whole account<span className="block text-[12px] muted">{inr(r.asked)}</span></> : inr(r.asked)}</td>
                <td className="whitespace-nowrap">{inr(r.fast)}</td>
                <td className="whitespace-nowrap">{r.decided ? <>{inr(r.team)}<span className="block text-[12px] muted">{STATUS[r.status]}</span></> : <span className="muted">{STATUS[r.status]}</span>}</td>
                <td className="whitespace-nowrap">{inr(r.traced)}</td>
                <td className="whitespace-nowrap"><span className={r.overFast && r.decided ? "text-[var(--bad)]" : "muted"}>{inr(r.overFast)}</span> · <span className={r.overTeam ? "text-[var(--bad)]" : "muted"}>{r.decided ? inr(r.overTeam) : "—"}</span></td>
                <td className="whitespace-nowrap">{r.decided ? <span className={r.accepted ? "text-[var(--warn)]" : "muted"}>{inr(r.accepted)}</span> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {p.phones.length > 0 && (
        <section className="card mt-5 p-4" data-testid="proof-phones">
          <h2>Phones on this case</h2>
          <p className="mt-1 text-[13px] muted">A blind sweep does what Telco-A&apos;s AI suggests and blocks every SIM on the reused ID documents. The team is Imran&apos;s recorded decision.</p>
          <table className="table mt-3 w-full text-[13px]">
            <thead><tr><th>Alert</th><th>Blind sweep</th><th>Team</th></tr></thead>
            <tbody>{p.phones.map((x) => (
              <tr key={x.alert} data-testid="proof-phone"><td>{x.title} <span className="mono muted">{x.alert}</span></td>
                <td>{x.sweep.action}<span className={`block text-[12px] ${x.sweep.genuine ? "text-[var(--bad)]" : "muted"}`}>{x.sweep.genuine} genuine line{x.sweep.genuine === 1 ? "" : "s"} cut</span></td>
                <td>{x.team ? <>{x.team.action}<span className={`block text-[12px] ${x.team.genuine ? "text-[var(--bad)]" : "muted"}`}>{x.team.genuine} genuine line{x.team.genuine === 1 ? "" : "s"} cut</span></> : <span className="muted">Not decided yet</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <section className="card mt-5 p-4" data-testid="proof-sample">
        <h2>Re-check a sample</h2>
        <p className="mt-1 text-[13px] muted">Scalpel picked {p.picks.length} held line{p.picks.length === 1 ? "" : "s"} at random (up to 3). For each, work out the victims&apos; share of one payment out of the account from the statement figures: payment × victims&apos; money before ÷ balance before. If your figure is right and the line has a checkable mistake, it goes back to the person who made it.</p>
        {p.picks.length === 0 ? <p className="mt-3 text-[13.5px] muted">No approved holds with a pinned payment out yet.</p> : (
          <ul className="mt-3 space-y-3">
            {p.picks.map((x) => (
              <li key={x.pid} className="rounded-xl border border-[var(--line)] p-3 text-[13.5px]" data-testid="pick" data-checked={Boolean(x.check)} data-amount={x.amount} data-before={x.balanceBefore} data-victim={x.victimBefore}>
                <p className="font-medium">{x.holder} <span className="mono text-[12px] muted">{x.account}</span></p>
                <p className="mt-1">Payment <span className="mono">{x.txn}</span> on {when(x.at)}: <b>{inr(x.amount)}</b> out. Balance just before: <b>{inr(x.balanceBefore)}</b>, of which victims&apos; money: <b>{inr(x.victimBefore)}</b>.</p>
                {x.check ? (
                  <p className={`mt-2 ${x.check.issues.length ? "text-[var(--bad)]" : "text-[var(--good)]"}`} data-testid="pick-result">
                    <ShieldCheck size={14} className="mr-1 inline" aria-hidden />You found {inr(x.check.typed)}. {x.check.issues.length ? `Sent back to ${x.check.sentTo.map((u) => userById(u)?.name ?? u).join(", ")}: ${x.check.issues.join(" ")}` : "The line holds up."}
                  </p>
                ) : (
                  <ActForm action={proofCheckAction} hidden={{ case: p.caseId, pid: x.pid }} label="Check" variant="ghost" size="sm" testid="pick-check" className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2"><span className="label">Victims&apos; share of this payment (₹)</span><input name="amount" inputMode="decimal" className="input !w-36" data-testid="pick-in" /></label>
                  </ActForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-5 p-4" data-testid="proof-sign">
        <h2>Sign off</h2>
        {p.signed ? (
          <p className="mt-2 text-[13.5px]" data-testid="proof-signed"><span className="chip chip-good">Signed</span> by {userById(p.signed.by)?.name ?? p.signed.by} · {when(p.signed.at)} · {p.signed.issues} line{p.signed.issues === 1 ? "" : "s"} with issues · fingerprint <span className="mono">{p.signed.hash}</span></p>
        ) : (
          <>
            <p className="mt-1 text-[13px] muted">Signing writes these numbers&apos; fingerprint into the tamper-proof record and the case&apos;s evidence file. {t.red ? `${t.red} line${t.red > 1 ? "s" : ""} still show a mistake; the signature records that.` : ""}</p>
            <ActForm action={proofSignAction} hidden={{ case: p.caseId }} label="Sign the proof" testid="proof-sign-btn" className="mt-3" disabled={!allChecked} />
            {!allChecked && <p className="mt-1 text-[12.5px] muted">Re-check every sampled line first.</p>}
          </>
        )}
      </section>
      </>}

      <section className="card mt-5 p-4" data-testid="proof-rules">
        <h2>The rule behind each number</h2>
        <ul className="mt-2 space-y-2">
          <RuleLine r={p.rules.fast} />
          <RuleLine r={p.rules.exact} />
          <RuleLine r={p.rules.request} />
          <RuleLine r={p.rules.clocks} />
          <RuleLine r={p.rules.sop} />
        </ul>
        <p className="mt-3 text-[12.5px] muted">The official dashboards we checked count holds placed and numbers disconnected. They do not report money or lines wrongly held or cut. This page counts both.</p>
      </section>
    </div>
  );
}
