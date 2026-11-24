"use client";
import { useEffect, useState } from "react";
import type { DemoData, MemoCase } from "@/lib/demo-schema";
import { formatRupees } from "@/lib/money";
import { badgesFor, istDate, maskAccount, sourceLabel, stillBeingChecked } from "@/lib/rules";
import { Badges } from "@/components/Badges";
import { ClockTable } from "@/components/ClockTable";

type Role = "officer" | "supervisor";
type Approval = { proposed: boolean; approved: boolean };

const TITLES: Record<string, string> = { D00191: "A business current account", D09001: "The story mule account" };
const TINY = 100; // paise: hops carrying under Rs 1 of traced money are summed, not listed

export function Memo({ memo }: { memo: DemoData["memo"] }) {
  const [account, setAccount] = useState(memo.cases[0]!.account);
  const [role, setRole] = useState<Role>("officer");
  const [approval, setApproval] = useState<Record<string, Approval>>({});
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("a");
    if (a && memo.cases.some((c) => c.account === a)) setAccount(a);
  }, [memo.cases]);
  const m = memo.cases.find((c) => c.account === account)!;
  const ap = approval[account] ?? { proposed: false, approved: false };
  const set = (x: Partial<Approval>) => setApproval((s) => ({ ...s, [account]: { ...ap, ...x } }));

  return (
    <>
      <div className="no-print flex flex-wrap gap-2 items-center mt-4">
        {memo.cases.map((c) => (
          <button key={c.account} type="button" onClick={() => setAccount(c.account)} aria-pressed={c.account === account}
            className="rounded-md px-3 py-1.5 border text-sm" style={{ borderColor: "var(--line)", background: c.account === account ? "var(--card)" : "transparent", fontWeight: c.account === account ? 600 : 400 }}>
            {TITLES[c.account] ?? c.account}
          </button>
        ))}
        <span className="ml-auto text-sm flex items-center gap-2">
          <label htmlFor="role">Acting as</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="border rounded-md px-2 py-1" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
            <option value="officer">Officer</option><option value="supervisor">Supervisor</option>
          </select>
          <span className="tag">demo roles, not real login</span>
        </span>
        <button type="button" onClick={() => window.print()} className="rounded-md px-3 py-1.5 text-white text-sm" style={{ background: "var(--s1)" }}>Print memo</button>
      </div>
      <MemoBody m={m} memo={memo} role={role} ap={ap} set={set} />
    </>
  );
}

function MemoBody({ m, memo, role, ap, set }: { m: MemoCase; memo: DemoData["memo"]; role: Role; ap: Approval; set: (x: Partial<Approval>) => void }) {
  const badges = badgesFor(m);
  const pending = stillBeingChecked(m, memo.sources);
  const pendingSources = memo.sources.filter((s) => s.verified !== true);
  const checked = memo.sources.filter((s) => s.verified === true).length;
  const free = m.balancePaise - m.heldPaise;
  const tiny = m.hops.filter((h) => h.taintPaise < TINY);
  const whole = ap.approved;
  return (
    <article className="memo card p-4 mt-4 relative" data-testid="memo">
      <p className="watermark" aria-hidden>SIMULATION – NOT AN OFFICIAL ORDER</p>
      <header className="flex flex-wrap justify-between gap-2 border-b pb-2" style={{ borderColor: "var(--line)" }}>
        <div>
          <h2 className="text-lg font-semibold">Hold memo · Bharat Demo Bank</h2>
          <p className="text-sm muted">{m.regimeLabel} · request {m.requisitionBasis.replace("_", " s.")} · {m.requisitionStatus.toLowerCase()} · rules {memo.policyId} ({memo.policyStatus})</p>
        </div>
        <div className="text-sm text-right">
          <p>NCRP ack no. <span className="font-mono">{m.ncrpAck}</span> <span className="tag">fake</span></p>
          <p>Account <span className="font-mono">{maskAccount(m.account)}</span> · {m.type.toLowerCase()} · layer {m.layer ?? "-"}</p>
        </div>
      </header>

      <section className="mt-3">
        <p className="text-xl font-semibold" data-testid="hold-line">
          {whole ? <>Whole account frozen: {formatRupees(m.balancePaise)}</> : <>Hold {formatRupees(m.heldPaise)} of {formatRupees(m.balancePaise)}. The other {formatRupees(free)} stays usable.</>}
        </p>
        <p className="text-sm muted">Traced from the complaints: {formatRupees(m.tracedPaise)}. A whole freeze would have locked {formatRupees(m.balancePaise)}.</p>
        <p className="text-xs muted mt-1" data-testid="trace-rule">
          Traced pro-rata: each payment out took victim money and the holder&apos;s own money in proportion, because nobody has been found guilty yet.
          {m.tracedIfAccusedPaise > m.tracedPaise
            ? <> If the police name the holder as accused, the courts&apos; rule for a wrongdoer (Re Hallett: he spent his own money first) traces <b>{formatRupees(m.tracedIfAccusedPaise)}</b> instead.</>
            : <> Even if the holder is named as accused (Re Hallett: own money spent first), the figure stays the same.</>}
        </p>
        <h3 className="mt-3 font-semibold text-sm">Money trail into this account</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="hops">
            <thead><tr className="text-left muted"><th className="py-1 pr-2">Ref (UTR)</th><th className="pr-2">Date</th><th className="pr-2">From</th><th className="pr-2">Layer</th><th className="pr-2">Credit</th><th>Of it, traced fraud money</th></tr></thead>
            <tbody>{m.hops.filter((h) => h.taintPaise >= TINY).map((h) => (
              <tr key={h.utr} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-1 pr-2 font-mono text-xs">{h.utr}</td><td className="pr-2">{istDate(h.at)}</td><td className="pr-2 font-mono text-xs">{maskAccount(h.from)}</td>
                <td className="pr-2">{h.layer ?? "-"}</td><td className="pr-2">{formatRupees(h.amountPaise)}</td><td>{formatRupees(h.taintPaise)}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
        {tiny.length > 0 && <p className="text-xs muted mt-1" data-testid="tiny-hops">+ {tiny.length} more credits each carrying under ₹1 of traced money ({formatRupees(tiny.reduce((s, h) => s + h.taintPaise, 0))} in all), from deep layers where the money was spread thin.</p>}
      </section>

      <section className="mt-4"><Badges badges={badges} sources={memo.sources} /></section>

      <section className="mt-3 card p-3 text-sm" data-testid="whole-compare">
        <h3 className="font-semibold">If the whole account were frozen instead</h3>
        <p>It would lock {formatRupees(m.wholeFreeze.heldPaise)}, which is {formatRupees(m.wholeFreeze.overTracedPaise)} more than the traced money.
          {" "}Right size? <b style={{ color: m.wholeFreeze.sized === "fail" ? "var(--bad)" : "var(--good)" }} data-testid="whole-sized">{m.wholeFreeze.sized === "fail" ? "✕ No" : "✓ Yes"}</b></p>
        {m.wholeFreeze.risks.length > 0 && <p className="text-xs mt-1">Grounds a court could quash it on: {m.wholeFreeze.risks.map((r) => `${r.id} ${r.ground}`).join("; ")}.</p>}
      </section>

      <section className="mt-4">
        <h3 className="font-semibold text-sm">Deadlines for this hold (from the engine)</h3>
        <ClockTable m={m} />
        <p className="text-xs muted mt-1 no-print">For holds a bank places on its own suspicion, RBI's draft directions (released 11 Sep 2026, proposed from 1 Apr 2027) would cap the hold at 60 days. That draft is not yet in force.</p>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <h3 className="font-semibold text-sm">Why this account (the mule-score model)</h3>
          <p className="text-sm">Mule score {m.muleScore.toFixed(2)}. {m.muleScore < 0.5 ? "The 3 strongest reasons it looks like an ordinary account:" : "Its 3 reasons:"}</p>
          <ol className="list-decimal ml-5 text-sm">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ol>
          {m.signals.length > 0 && <p className="text-xs muted mt-1">Warning signs: {m.signals.join(", ")}. Phone signs are a simulated stand-in for telecom feeds such as DoT's FRI and MNRL.</p>}
          <p className="text-xs muted mt-1">The mule score orders the to-do list and gives reasons. It is also one of the conditions (R2) before an officer may <i>propose</i> a whole-account freeze, which a supervisor must approve. It never sets the hold amount.</p>
        </div>
        <div>
          <h3 className="font-semibold text-sm">What the account holder is told, and how to contest</h3>
          <ul className="list-disc ml-5 text-sm">
            <li>Notice: the amount held, the complaint reference and how to get the hold removed.</li>
            <li>Contest at the branch with an explanation. The bank files it in the grievance module; the investigating officer decides or records reasons. If nothing happens, it goes to the District Grievance Officer.</li>
            <li>At 90 days a contested hold must be reviewed; the bank may lift it unless the police extend it.</li>
            <li>Going to court is always open.</li>
          </ul>
          <p className="text-xs mt-1"><span className="tag">source being checked</span> These steps follow MHA's SOP of 2 Jan 2026, which our rule files still mark unverified.</p>
        </div>
      </section>

      <section className="mt-4 card p-3" data-testid="approvals">
        <h3 className="font-semibold text-sm">Approvals</h3>
        <p className="text-sm">Exact hold: proposed by Officer · approved by Supervisor <span className="tag">demo roles</span></p>
        {m.suggestedWholeFreeze ? (
          <div className="mt-2 text-sm">
            <p>The rules would also allow a <b>whole-account freeze</b> here (R2: high mule score, several warning signs). It needs two people.</p>
            <div className="no-print flex flex-wrap gap-2 mt-2">
              <button type="button" data-testid="propose" disabled={role !== "officer" || ap.proposed} onClick={() => set({ proposed: true })}
                className="rounded-md px-3 py-1 border disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Officer: propose whole freeze</button>
              <button type="button" data-testid="approve" disabled={role !== "supervisor" || !ap.proposed || ap.approved} onClick={() => set({ approved: true })}
                className="rounded-md px-3 py-1 border disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Supervisor: approve</button>
            </div>
            <p className="mt-1" data-testid="wf-status">{ap.approved ? "Whole freeze proposed by Officer and approved by Supervisor." : ap.proposed ? "Proposed by Officer. Waiting for Supervisor." : "Not proposed. The exact hold stands."}</p>
          </div>
        ) : <p className="text-sm mt-1">No whole freeze is allowed or suggested for this account.</p>}
      </section>

      <section className="mt-4">
        <h3 className="font-semibold text-sm">Still being checked</h3>
        <p className="text-xs muted no-print">Rules and sources not yet checked against the original text. They are never used as a badge's citation.</p>
        <ul className="text-sm list-disc ml-5" data-testid="pending">
          {pending.map((p) => <li key={p.id}><span className="font-mono text-xs">{p.id}</span> {p.plain} <span className="tag">unverified</span></li>)}
          {pendingSources.map((s) => <li key={s.id}>{sourceLabel(s)} <span className="tag">unverified</span></li>)}
        </ul>
        <p className="text-xs muted mt-2">How I checked my sources: {checked} of {memo.sources.length} sources read against the original judgment or document. One rule was corrected after the check showed its press summary was wrong.</p>
      </section>
    </article>
  );
}
