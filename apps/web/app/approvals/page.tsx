import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { model, holderName } from "@/lib/server/world";
import { ApprovalBoard, type ApprovalItem } from "@/components/ApprovalBoard";
import { suggestion } from "@/components/AccountRow";
import { CHOICE_LABEL } from "@/lib/server/judge";
import { ago, inr } from "@/lib/format";
import { userById } from "@/lib/users";
import { YourJob } from "@/components/YourJob";

export default async function Approvals() {
  const u = await requireUser("supervisor");
  const d = await desk();
  const m = model();
  const pending = d.proposals.filter((p) => p.status === "pending").sort((a, b) => a.at - b.at);
  const overrules = d.decisions.filter((x) => x.open && x.needsSignoff && !x.signoff && !x.pid).sort((a, b) => a.at - b.at);
  const decOf = (pid: string) => d.decisions.find((x) => x.pid === pid);
  const done = d.proposals.filter((p) => p.status !== "pending").sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0)).slice(0, 8);
  const items: ApprovalItem[] = [
    ...overrules.map((x): ApprovalItem => {
      const v = m.accounts.get(x.account)!;
      return {
        key: x.did, did: x.did, kind: "OVERRULE", name: holderName(v.a), account: x.account, caseId: x.caseId, amount: null, amountText: null,
        by: userById(x.by)?.name ?? x.by, ago: ago(x.at, d.now), mine: false, agreed: false,
        aiText: `${CHOICE_LABEL[x.ai.suggest]} · ${Math.round(x.ai.confidence * 100)}% sure`, clash: x.ai.clash, traced: inr(v.traced), withinTraced: null,
        rules: null, score: v.a.score ? `${Math.round(v.a.score.muleScore * 100)}/100: ${v.a.score.reasons.join(" · ")}` : null,
        officerChoice: CHOICE_LABEL[x.choice], reason: x.reason, note: x.note || null,
      };
    }),
    ...pending.map((p): ApprovalItem => {
      const v = m.accounts.get(p.account)!;
      const x = decOf(p.pid);
      return {
        key: p.pid, pid: p.pid, kind: p.kind, name: holderName(v.a), account: p.account, caseId: p.caseId, amount: p.amount, amountText: inr(p.amount),
        by: userById(p.by)?.name ?? p.by, ago: ago(p.at, d.now), mine: p.by === u.id,
        agreed: x ? x.agreed : null, aiText: x ? `${CHOICE_LABEL[x.ai.suggest]} · ${Math.round(x.ai.confidence * 100)}% sure` : null, clash: x?.ai.clash ?? null,
        traced: inr(v.traced), withinTraced: p.amount <= v.traced, rules: p.kind === "HOLD" ? suggestion(v).text : null,
        score: v.a.score ? `${Math.round(v.a.score.muleScore * 100)}/100: ${v.a.score.reasons.join(" · ")}` : null,
        officerChoice: null, reason: x?.reason ?? null, note: (x ? x.note : p.note) || null,
      };
    }),
  ];
  return (
    <div>
      <YourJob who="Bank supervisor">Check the officer&apos;s freezes and overrules. Say yes, or send them back with a reason.</YourJob>
      <h1>{items.length ? `${items.length} waiting for you` : "Nothing waiting"}</h1>
      <p className="mt-1 max-w-[760px] muted">Nothing is held or released until you approve it, and you can never approve your own proposal. When the officer overrules a confident AI, you check it too.</p>
      <div className="mt-5" data-testid="pending-list">{items.length > 0 ? <ApprovalBoard items={items} /> : <p className="sheet p-4 text-[14px] muted">When the officer proposes a hold or overrules the AI, it lands here.</p>}</div>
      {done.length > 0 && (
        <section className="mt-10 max-w-[760px]">
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
