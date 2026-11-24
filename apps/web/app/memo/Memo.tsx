"use client";
import { useEffect, useState } from "react";
import type { DemoData, MemoCase } from "@/lib/demo-schema";
import { formatRupees } from "@/lib/money";
import { badgesFor, istDate, maskAccount, sourceLabel, stillBeingChecked } from "@/lib/rules";
import { Badges } from "@/components/Badges";
import { ClockTable } from "@/components/ClockTable";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { ROLES } from "@/components/Roles";
import { CaseActions } from "@/components/CaseActions";
import { useDesk } from "@/lib/desk";
import { AnimatePresence } from "motion/react";
import * as motion from "motion/react-m";
import { SPRING } from "@/components/ui/motion";

type Role = "officer" | "supervisor";
type Approval = { proposed: boolean; approved: boolean };

const TITLES: Record<string, string> = { D00191: "Shop's current account", D09001: "Savings account (3 victims)" };
const TINY = 100; // paise: hops carrying under Rs 1 of traced money are summed, not listed

export function Memo({ memo }: { memo: DemoData["memo"] }) {
  const desk = useDesk();
  const { role } = desk;
  const [account, setAccount] = useState(memo.cases[0]!.account);
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("a");
    if (a && memo.cases.some((c) => c.account === a)) setAccount(a);
  }, [memo.cases]);
  const pick = (a: string) => { setAccount(a); try { history.replaceState(null, "", `?a=${a}`); } catch { /* ignore */ } };
  const m = memo.cases.find((c) => c.account === account)!;
  const st = desk.get(account);
  const ap: Approval = { proposed: st.whole !== "none", approved: st.whole === "approved" };
  const set = (x: Partial<Approval>) => {
    if (x.approved) desk.act(account, { whole: "approved" }, "approved the whole-account freeze");
    else if (x.proposed) desk.act(account, { whole: "proposed" }, "proposed a whole-account freeze");
  };

  return (
    <>
      <div className="no-print mt-6 grid gap-4">
        <div className="card p-4 sm:p-5 grid gap-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <Segmented label="Account" value={account} onChange={pick}
              options={memo.cases.map((c) => ({ value: c.account, label: TITLES[c.account] ?? c.account }))} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setNotice(true)} data-testid="preview-notice">Preview notice to holder</Button>
              <Button variant="primary" onClick={() => window.print()}>
                <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M4 6V1.8h8V6M4 12H2.5V6.5h11V12H12M4.5 9.5h7v5h-7z" /></svg>
                Print memo
              </Button>
            </div>
          </div>
          <CaseActions c={m} showMemoLink={false} />
        </div>
        <RoleNow role={role} />
      </div>
      <NoticeDialog open={notice} onClose={() => setNotice(false)} m={m} sent={st.notice} />
      <MemoBody m={m} memo={memo} role={role} ap={ap} set={set} />
    </>
  );
}

/** The letter the account holder receives: plain words, the amount, and how to contest. A preview only; nothing is sent anywhere. */
function NoticeDialog({ open, onClose, m, sent }: { open: boolean; onClose: () => void; m: MemoCase; sent: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="no-print fixed inset-0 z-[60] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: "rgba(10, 12, 18, 0.35)" }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label="Notice to the account holder" data-testid="notice-dialog"
            className="glass rounded-2xl w-full max-w-lg p-6" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={SPRING} onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] muted">Notice to the holder of account <span className="font-mono">{maskAccount(m.account)}</span> · {sent ? "sent" : "not sent yet"}</p>
            <h2 className="title text-[22px] mt-1">Part of your account is on hold</h2>
            <div className="mt-3 text-[15px] leading-relaxed grid gap-2">
              <p>Following a police request linked to cybercrime complaint <span className="font-mono">{m.ncrpAck}</span>, we have held <b className="mono">{formatRupees(m.heldPaise)}</b> in your account.</p>
              <p>The rest of your balance, <b className="mono">{formatRupees(m.balancePaise - m.heldPaise)}</b>, is free to use as normal.</p>
              <p>If you believe this is wrong, visit your branch with an explanation. We will file it for the investigating officer, who must decide or record reasons. You may also approach the District Grievance Officer or a court.</p>
            </div>
            <p className="text-[12.5px] muted mt-3">Demo wording. Nothing is sent from this site.</p>
            <div className="mt-5 flex justify-end"><Button variant="primary" onClick={onClose}>Close</Button></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
    <article className="memo card p-5 sm:p-8 mt-5 relative" data-testid="memo" >
      <p className="watermark" aria-hidden>SIMULATION – NOT AN OFFICIAL ORDER</p>
      <header className="flex flex-wrap justify-between gap-2 border-b pb-2" style={{ borderColor: "var(--line)" }}>
        <div>
          <p className="label no-print">Police-requested lien record</p>
          <h2 className="title text-[22px]">Hold memo · Bharat Demo Bank</h2>
          <p className="text-sm muted">{m.regimeLabel} · request {m.requisitionBasis.replace("_", " s.")} · {m.requisitionStatus.toLowerCase()} · rules {memo.policyId} ({memo.policyStatus})</p>
        </div>
        <div className="text-sm text-right">
          <p>NCRP ack no. <span className="font-mono">{m.ncrpAck}</span> <span className="tag">fake</span></p>
          <p>Account <span className="font-mono">{maskAccount(m.account)}</span> · {m.type.toLowerCase()} · layer {m.layer ?? "-"}</p>
        </div>
      </header>

      <section className="mt-3">
        <p className="text-xl font-semibold" data-testid="hold-line" style={{ color: whole ? "var(--freeze)" : "var(--hold)" }}>
          {whole ? <>Whole account frozen: {formatRupees(m.balancePaise)}</> : <>Hold {formatRupees(m.heldPaise)} of {formatRupees(m.balancePaise)}. The other {formatRupees(free)} stays usable.</>}
        </p>
        <p className="text-sm muted">Traced from the complaints: {formatRupees(m.tracedPaise)}. A whole freeze would have locked {formatRupees(m.balancePaise)}.</p>
        <p className="text-xs muted mt-1" data-testid="trace-rule">
          Traced pro-rata: each payment out took victim money and the holder&apos;s own money in proportion, because nobody has been found guilty yet.
          {m.tracedIfAccusedPaise > m.tracedPaise
            ? <> If the police name the holder as accused, the courts&apos; rule for a wrongdoer (Re Hallett: he spent his own money first) traces <b>{formatRupees(m.tracedIfAccusedPaise)}</b> instead.</>
            : <> Even if the holder is named as accused (Re Hallett: own money spent first), the figure stays the same.</>}
          <span className="no-print">{" "}Cases: {["barlow-clowes", "re-hallett"].map((id) => memo.sources.find((x) => x.id === id)).filter(Boolean)
            .map((x) => `${x!.title.split(" - ")[0]}${x!.verified ? "" : " (still being checked)"}`).join("; ")}.</span>
        </p>
        <h3 className="mt-3 font-semibold text-sm">Money trail into this account</h3>
        <div className="overflow-x-auto">
          <table className="data-table text-sm" data-testid="hops">
            <thead><tr><th>Ref (UTR)</th><th className="pr-2">Date</th><th className="pr-2">From</th><th className="pr-2">Layer</th><th className="pr-2">Credit</th><th>Of it, traced fraud money</th></tr></thead>
            <tbody>{m.hops.filter((h) => h.taintPaise >= TINY).map((h) => (
              <tr key={h.utr}>
                <td className="py-1 pr-2 font-mono text-xs">{h.utr}</td><td className="pr-2">{istDate(h.at)}</td><td className="pr-2 font-mono text-xs">{maskAccount(h.from)}</td>
                <td className="pr-2">{h.layer ?? "-"}</td><td className="pr-2">{formatRupees(h.amountPaise)}</td><td>{formatRupees(h.taintPaise)}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
        {tiny.length > 0 && <p className="text-xs muted mt-1" data-testid="tiny-hops">+ {tiny.length} more credits each carrying under ₹1 of traced money ({formatRupees(tiny.reduce((s, h) => s + h.taintPaise, 0))} in all), from deep layers where the money was spread thin.</p>}
      </section>

      <section className="mt-6">
        <h3 className="font-semibold text-sm">The three checks</h3>
        <div className="no-print mt-2 mb-4 rounded-xl p-4 text-[14.5px] leading-relaxed" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} data-testid="why-sources">
          <b>Why are there links under each check?</b> Each check rests on a law, an RBI or police rule, or a court judgment. The link opens that original document,
          so a bank manager, a lawyer or a judge can check the hold for themselves instead of trusting this page. Only sources we have read against the original are
          linked here; anything not yet checked is listed under &ldquo;Still being checked&rdquo; at the bottom and never counts towards a green tick.
        </div>
        <Badges badges={badges} sources={memo.sources} />
      </section>

      <section className="mt-4 card-flat p-4 text-sm" data-testid="whole-compare" style={{ background: "var(--freeze-tint)", borderColor: "transparent" }}>
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

      <section className="mt-4 card-flat p-4" data-testid="approvals">
        <h3 className="font-semibold text-sm">Approvals</h3>
        <p className="text-sm">Exact hold: proposed by Officer · approved by Supervisor <span className="tag">demo roles</span></p>
        {m.suggestedWholeFreeze ? (
          <div className="mt-2 text-sm">
            <p>The rules would also allow a <b>whole-account freeze</b> here (R2: high mule score, several warning signs). It needs two people.</p>
            <div className="no-print flex flex-wrap gap-2 mt-2">
              <Button data-testid="propose" className="!py-1.5 !text-sm" disabled={role !== "officer" || ap.proposed} onClick={() => set({ proposed: true })}>Officer: propose whole freeze</Button>
              <Button data-testid="approve" className="!py-1.5 !text-sm" disabled={role !== "supervisor" || !ap.proposed || ap.approved} onClick={() => set({ approved: true })}>Supervisor: approve</Button>
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

/** What the person at the keyboard may do right now, in plain words. Changes with the Officer / Supervisor switch. */
function RoleNow({ role }: { role: Role }) {
  const r = ROLES[role];
  return (
    <section className="no-print mt-4 rounded-2xl p-5 grid gap-4 md:grid-cols-[1fr_1fr_1fr]" style={{ background: "var(--accent-tint)", border: "1px solid var(--accent-line)" }} data-testid="role-now">
      <div>
        <p className="label" style={{ color: "var(--accent-ink)" }}>You are acting as</p>
        <p className="font-semibold text-[20px] mt-1">{r.title}</p>
        <p className="text-[14.5px] muted mt-1">{r.who} Two people are enough to run every hold: one officer and one supervisor.</p>
      </div>
      <div>
        <p className="label" style={{ color: "var(--good)" }}>You can</p>
        <ul className="mt-1.5 text-[15px] space-y-1 list-disc ml-5">{r.can.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div>
        <p className="label" style={{ color: "var(--bad)" }}>You cannot</p>
        <ul className="mt-1.5 text-[15px] space-y-1 list-disc ml-5">{r.cannot.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
    </section>
  );
}
