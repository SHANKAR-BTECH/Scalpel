import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { desk, phoneTarget } from "@/lib/server/desk";
import { caseById, model, holderName, W } from "@/lib/server/world";
import { caseGraph } from "@/lib/server/graph";
import { TrailGraph } from "@/components/TrailGraph";
import { AccountRow } from "@/components/AccountRow";
import { ActForm } from "@/components/ActForm";
import { CountUp } from "@/components/CountUp";
import { CaseAnalysis } from "@/components/CaseAnalysis";
import { analyse } from "@/lib/server/analysis";
import { askTelcoAction } from "@/app/actions";
import { ago, inr, when } from "@/lib/format";
import { userById } from "@/lib/users";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("officer", "supervisor");
  const { id } = await params;
  const c = caseById(id);
  if (!c) notFound();
  const m = model();
  const d = await desk();
  const g = caseGraph(c, d);
  const accts = c.accounts.map((a) => m.accounts.get(a)!).sort((a, b) => (a.hop ?? 9) - (b.hop ?? 9) || b.traced - a.traced);
  // Below the Rs 1,000 minimum a hold isn't allowed anyway: list those accounts briefly instead of as full cards.
  const withMoney = accts.filter((v) => v.traced >= 1000_00);
  const rest = accts.filter((v) => v.traced < 1000_00);
  const heldTotal = withMoney.reduce((s, v) => s + (d.holdByAccount.get(v.a.id)?.hold.amount ?? 0), 0);
  const linked = [...new Set(c.rigs.flatMap((r) => (m.casesOfRig.get(r) ?? []).filter((x) => x !== c.id)))];
  const log = d.chain.filter((e) => e.caseId === c.id).reverse();
  const asks = d.asks.filter((a) => a.caseId === c.id);
  const rigTargets = c.rigs.map((r) => {
    const rig = W.rigs.find((x) => x.id === r);
    return rig ? { rig, t: phoneTarget("IMEI", rig.imei, d.now, d.checks), kind: "IMEI" as const, value: rig.imei } : { rig: null, t: phoneTarget("MSISDN", r, d.now, d.checks), kind: "MSISDN" as const, value: r };
  });
  return (
    <div>
      <Link href="/inbox" className="text-[13px] muted hover:underline">← Inbox</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow"><span className="mono">{c.id}</span> · {c.complaints.length} complaints · first {when(c.firstAt)}</p>
          <h1 className="mt-1">{c.scamType}: {c.complaints.length} victims</h1>
          <p className="mt-1 max-w-[720px] muted">&ldquo;{c.complaints[0]!.story}&rdquo;</p>
        </div>
        <dl className="grid grid-cols-3 gap-4 text-right">
          <div><dt className="text-[12px] muted">Reported lost</dt><dd className="money text-[20px]"><CountUp value={c.reported} format="inr" /></dd></div>
          <div><dt className="text-[12px] muted">Still in accounts</dt><dd className="money text-[20px] text-[var(--accent)]" data-testid="catchable"><CountUp value={c.catchable} format="inr" /></dd></div>
          <div><dt className="text-[12px] muted">Held so far</dt><dd className="money text-[20px]" data-testid="held-total">{inr(heldTotal)}</dd></div>
        </dl>
      </div>

      <div className="mt-5"><CaseAnalysis a={analyse(c, g)} /></div>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2>Where the calls came from and where the money went</h2>
          <p className="text-[13px] muted">Money usually moves on from the first accounts in about {c.minutesToCashOut} minutes.</p>
        </div>
        <TrailGraph g={g} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <h2>What to hold</h2>
          <p className="mt-1 text-[14px] muted">Every account the police asked about, with what Scalpel suggests. The hold is never more than the victims' money still in the account.</p>
          <div id="accounts" className="mt-3 space-y-2.5 scroll-mt-24" data-testid="accounts">
            {withMoney.map((v) => <AccountRow key={v.a.id} v={v} desk={d} canPropose={u.role === "officer"} />)}
          </div>
          {rest.length > 0 && (
            <details className="mt-3 panel p-3">
              <summary className="text-[14px] font-medium">{rest.length} more accounts on the trail have less than ₹1,000 of victims&apos; money left (below the minimum hold)</summary>
              <ul className="mt-2 grid gap-1 text-[13.5px] sm:grid-cols-2">{rest.map((v) => <li key={v.a.id}>{holderName(v.a)} <span className="mono muted">{v.a.id}</span> <span className="money muted">{inr(v.traced)}</span></li>)}</ul>
            </details>
          )}
        </div>

        <aside className="space-y-3">
          <div className="card p-4" data-testid="phone-panel">
            <p className="eyebrow text-[var(--phone)]">The phone behind it · Telco-A</p>
            <p className="mt-1 text-[14px]">{c.calls.length} scam calls reached these victims.</p>
            <ul className="mt-3 space-y-3">
              {rigTargets.map(({ rig, t, kind, value }) => {
                const ask = asks.find((a) => a.kind === kind && a.value === value);
                const done = d.actions.find((a) => a.kind === kind && a.value === value && a.outcome === "BLOCKED");
                return (
                  <li key={value} className="rounded-lg bg-[var(--phone-tint)] p-3 text-[13.5px]">
                    <p className="font-semibold text-[var(--phone)]">{rig ? `${rig.kind === "simbox" ? "SIM box" : "One handset"} with ${rig.sims.length} SIMs` : "One SIM, swapped recently"}</p>
                    <p className="mono text-[12px] muted">{kind === "IMEI" ? `IMEI ${value}` : value}</p>
                    {rig && <p className="mt-1 text-[12.5px] muted">Cell {rig.cell}. {rig.kind === "simbox" ? "Calls go out through a gateway route." : ""}</p>}
                    {done ? <p className="mt-2 chip chip-good">Blocked by Telco-A {ago(done.at, d.now)}</p>
                      : ask?.done ? <p className="mt-2 chip chip-bad">Telco-A refused: {ask.done.reasons[0]}</p>
                      : ask ? <p className="mt-2 chip chip-warn">Asked Telco-A {ago(ask.at, d.now)}</p>
                      : u.role === "officer" && (
                        <ActForm action={askTelcoAction} hidden={{ case: c.id, kind, value, note: `Calls behind ${c.id}` }} label={kind === "IMEI" ? "Ask Telco-A to block this handset" : "Ask Telco-A to block this SIM"} variant="phone" size="sm" className="mt-2" testid={`ask-${kind}`} />
                      )}
                    {t.signals.length > 0 && <p className="mt-2 text-[12px] muted">Signs: {t.signals.map((s) => SIGN[s] ?? s).join(", ")}</p>}
                  </li>
                );
              })}
            </ul>
            {c.shownCallers.filter((s) => s.spoofed).map((s) => (
              <div key={s.msisdn} className="mt-3 rounded-lg border border-[#f1b8b1] bg-[var(--bad-tint)] p-3 text-[13px]" data-testid="spoof-note">
                <p className="font-semibold text-[var(--bad)]">Do not block {s.msisdn}</p>
                <p className="mt-1">Victims saw this number, but the network shows the calls came from the SIMs above. {s.protected ? "It is a registered 1600-series business number (" + (s.owner ?? "a business") + ")." : `It belongs to an innocent customer${s.owner ? ` (${s.owner})` : ""} whose phone made no such call.`} Blocking it would punish the wrong person.</p>
              </div>
            ))}
            {linked.length > 0 && <p className="mt-3 text-[13px]">The same phone is behind {linked.map((l, i) => <span key={l}>{i > 0 && ", "}<Link className="link" href={`/case/${l}`}>{l}</Link></span>)}.</p>}
          </div>

          <div className="card p-4">
            <p className="eyebrow">Activity on this case</p>
            {log.length === 0 && <p className="mt-2 text-[13.5px] muted">Nothing done yet.</p>}
            <ol className="mt-2 space-y-2 text-[13px]" data-testid="case-log">
              {log.slice(0, 12).map((e) => (
                <li key={e.seq}><span className="muted">{when(e.at)}</span><br />{describe(e)}</li>
              ))}
            </ol>
          </div>
        </aside>
      </section>
    </div>
  );
}

const SIGN: Record<string, string> = {
  HANDSET_GT5_SIMS: "more than 5 SIMs in one handset", SIMBOX_ROUTE: "SIM-box route", SIM_SWAP_LT_72H: "SIM swapped in the last 3 days",
  GE3_CASE_LINKED_SENDERS: "called 3 or more victims", CALL_FORWARDING_ACTIVE: "call forwarding on", FRI_VERY_HIGH: "DoT fraud-risk rating very high", MNRL_LISTED: "on the revoked-numbers list",
};

function describe(e: { type: string; actor: string; payload: unknown }): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = e.payload as Record<string, any>;
  const who = userById(e.actor)?.name ?? (e.actor.startsWith("holder:") ? "The account holder" : e.actor === "system" ? "Scalpel" : e.actor);
  const acct = p.account ? holderName(model().accounts.get(p.account)!.a) : "";
  switch (e.type) {
    case "PROPOSE": return `${who} proposed ${p.kind === "HOLD" ? `a hold of ${inr(p.amount)}` : "a release"} on ${acct}`;
    case "DECIDE": return `${who} ${p.approved ? "approved" : "rejected"} it${p.note ? `: "${p.note}"` : ""}`;
    case "HOLD_PLACED": return `Hold ${p.ref} placed: ${inr(p.amount)} on ${acct}`;
    case "NOTICE_SENT": return `Account holder told by ${p.channel} (${p.ref})`;
    case "REPLY_RECEIVED": return `Account holder explained (${p.ref})`;
    case "GRM_UPLOADED": return `${who} sent the explanation to the police (${p.ref})`;
    case "RELEASED": return `Hold released`;
    case "TELCO_ASK": return `${who} asked Telco-A to block ${p.kind === "IMEI" ? "handset" : "number"} ${p.value}`;
    case "TELCO_ACTION": return `Telco-A ${p.outcome === "BLOCKED" ? "blocked" : "refused to block"} ${p.value}`;
    case "EVIDENCE_EXPORTED": return `${who} downloaded the evidence file`;
    default: return `${who}: ${e.type}`;
  }
}
