import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { model, holderName } from "@/lib/server/world";
import { ActForm } from "@/components/ActForm";
import { suggestion } from "@/components/AccountRow";
import { decideAction, signoffAction } from "@/app/actions";
import { CHOICE_LABEL } from "@/lib/server/judge";
import { ago, inr } from "@/lib/format";
import { userById } from "@/lib/users";

export default async function Approvals() {
  const u = await requireUser("supervisor");
  const d = await desk();
  const m = model();
  const pending = d.proposals.filter((p) => p.status === "pending").sort((a, b) => a.at - b.at);
  const overrules = d.decisions.filter((x) => x.open && x.needsSignoff && !x.signoff && !x.pid).sort((a, b) => a.at - b.at);
  const decOf = (pid: string) => d.decisions.find((x) => x.pid === pid);
  const done = d.proposals.filter((p) => p.status !== "pending").sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0)).slice(0, 8);
  return (
    <div className="max-w-[920px]">
      <p className="eyebrow">Approvals · two-person rule</p>
      <h1 className="mt-1">{pending.length + overrules.length ? `${pending.length + overrules.length} waiting for you` : "Nothing waiting"}</h1>
      <p className="mt-1 muted">Nothing is held or released until you approve it. You can never approve something you proposed. When the officer overrules a confident AI, you check it.</p>
      {overrules.length > 0 && (
        <section className="mt-5" data-testid="overrules">
          <h2>Overrules to check</h2>
          <ul className="mt-2 space-y-3">
            {overrules.map((x) => {
              const v = m.accounts.get(x.account)!;
              return (
                <li key={x.did} className="card p-4" data-testid="overrule-item">
                  <p className="font-semibold">{holderName(v.a)}: {userById(x.by)?.name} chose &ldquo;{CHOICE_LABEL[x.choice]}&rdquo;</p>
                  <p className="text-[13px] muted">{ago(x.at, d.now)} · <Link className="link" href={`/case/${x.caseId}#acct-${x.account}`}>{x.caseId}</Link> · victims&apos; money here {inr(v.traced)}</p>
                  <div className="mt-3 grid gap-2 text-[13.5px] md:grid-cols-2">
                    <div className="panel p-3"><p className="eyebrow">AI suggested</p><p className="mt-1 font-medium">{CHOICE_LABEL[x.ai.suggest]} · {Math.round(x.ai.confidence * 100)}% sure</p>{v.a.score && <p className="mt-1 text-[12.5px] muted">{v.a.score.reasons.join(" · ")}</p>}{x.ai.clash && <p className="mt-1 text-[12.5px] text-[var(--warn)]">Clash: {x.ai.clash}</p>}</div>
                    <div className="panel p-3"><p className="eyebrow">Officer&apos;s reason</p><p className="mt-1 font-medium">{x.reason}</p>{x.note && <p className="mt-1 text-[12.5px] muted">&ldquo;{x.note}&rdquo;</p>}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActForm action={signoffAction} hidden={{ did: x.did, approve: "yes", note: "" }} label="Agree with the officer" testid="signoff-approve" />
                    <ActForm action={signoffAction} hidden={{ did: x.did, approve: "no" }} label="Send back" variant="danger" testid="signoff-back" className="flex flex-wrap items-center gap-2">
                      <input name="note" placeholder="Why (the officer sees this)" className="input w-[260px] py-1.5" />
                    </ActForm>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {pending.length > 0 && overrules.length > 0 && <h2 className="mt-6">Holds and releases</h2>}
      <ul className="mt-5 space-y-3" data-testid="pending-list">
        {pending.map((p) => {
          const v = m.accounts.get(p.account)!;
          const s = suggestion(v);
          const mine = p.by === u.id;
          return (
            <li key={p.pid} className="card p-4" data-testid="pending-item">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{p.kind === "HOLD" ? "Hold" : "Release"} <span className="money">{inr(p.amount)}</span> on {holderName(v.a)}</p>
                  <p className="text-[13px] muted">{userById(p.by)?.name} · {ago(p.at, d.now)} · <Link className="link" href={`/case/${p.caseId}#acct-${p.account}`}>{p.caseId}</Link></p>
                </div>
                <div className="text-right text-[13px]"><p className="muted">Victims' money in it</p><p className="money text-[16px]">{inr(v.traced)}</p></div>
              </div>
              <ul className="mt-3 space-y-1 text-[13.5px]">
                <li>{p.amount <= v.traced ? <span className="text-[var(--good)]">✓ Not more than the traced victim money.</span> : <span className="text-[var(--bad)]">✗ More than the traced victim money.</span>}</li>
                {p.kind === "HOLD" && <li className="muted">Rules: {s.text}</li>}
                {v.a.score && <li className="muted">Mule score {Math.round(v.a.score.muleScore * 100)}/100: {v.a.score.reasons.join(" · ")}</li>}
                {p.note && <li className="muted">Note: {p.note}</li>}
                {(() => { const x = decOf(p.pid); return x ? <li><span className={`chip ${x.agreed ? "chip-good" : "chip-warn"}`}>{x.agreed ? "Officer agreed with the AI" : `Officer overruled the AI (${Math.round(x.ai.confidence * 100)}% sure of "${CHOICE_LABEL[x.ai.suggest]}")`}</span>{x.ai.clash && <span className="ml-2 text-[12.5px] text-[var(--warn)]">Clash: {x.ai.clash}</span>}</li> : null; })()}
              </ul>
              {mine ? <p className="mt-3 chip chip-warn">You proposed this: another supervisor must decide.</p> : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActForm action={decideAction} hidden={{ pid: p.pid, approve: "yes", note: "" }} label="Approve" testid="approve" />
                  <ActForm action={decideAction} hidden={{ pid: p.pid, approve: "no" }} label="Reject" variant="danger" testid="reject" className="flex flex-wrap items-center gap-2">
                    <input name="note" placeholder="Why (sent to the officer)" className="input w-[240px] py-1.5" />
                  </ActForm>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <section className="mt-8">
          <h2>Recently decided</h2>
          <ul className="mt-2 divide-y divide-[var(--line)] text-[14px]">
            {done.map((p) => (
              <li key={p.pid} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{p.kind === "HOLD" ? "Hold" : "Release"} {inr(p.amount)} on {holderName(m.accounts.get(p.account)!.a)}</span>
                <span className={p.status === "approved" ? "text-[var(--good)]" : "text-[var(--bad)]"}>{p.status} {ago(p.decidedAt!, d.now)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
