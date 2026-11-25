"use client";
/** The supervisor's queue: short items on the left, everything about the chosen one on the right. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, TriangleAlert, X } from "lucide-react";
import { ActForm } from "./ActForm";
import { decideAction, signoffAction } from "@/app/actions";

export interface ApprovalItem {
  key: string; kind: "HOLD" | "RELEASE" | "OVERRULE";
  name: string; account: string; caseId: string; amount: number | null; amountText: string | null;
  by: string; ago: string; mine: boolean;
  agreed: boolean | null; aiText: string | null; clash: string | null;
  traced: string; withinTraced: boolean | null; rules: string | null; score: string | null;
  officerChoice: string | null; reason: string | null; note: string | null;
  pid?: string; did?: string;
}

const KIND: Record<ApprovalItem["kind"], string> = { HOLD: "Hold", RELEASE: "Release", OVERRULE: "Overrule" };

export function ApprovalBoard({ items }: { items: ApprovalItem[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.key ?? null);
  // When the chosen item is decided it leaves the list: move on to the next one.
  useEffect(() => { if (!items.some((i) => i.key === open)) setOpen(items[0]?.key ?? null); }, [items, open]);
  const cur = items.find((i) => i.key === open) ?? null;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,440px)_1fr]">
      <ul className="space-y-2" data-testid="queue">
        {items.map((i) => {
          const on = i.key === open;
          return (
            <li key={i.key}>
              <button type="button" onClick={() => setOpen(i.key)} aria-pressed={on} data-testid={i.kind === "OVERRULE" ? "overrule-item" : "pending-item"}
                className={`queue-item ${on ? "queue-item-on" : ""}`}>
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold">{KIND[i.kind]} {i.amountText ? <span className="money">{i.amountText}</span> : null} · {i.name}</span>
                    <span className="shrink-0 text-[12px] muted">{i.ago}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    <span className="muted">{i.caseId} · {i.by}</span>
                    {i.agreed === true && <span className="chip chip-good">Agrees with AI</span>}
                    {i.agreed === false && <span className="chip chip-warn">Overrules AI</span>}
                    {i.clash && <span className="chip chip-warn"><TriangleAlert size={12} aria-hidden />Clash</span>}
                    {i.mine && <span className="chip chip-grey">Yours</span>}
                  </span>
                </span>
                <ChevronRight size={16} className={`shrink-0 transition-transform duration-300 ${on ? "translate-x-0.5 text-[var(--accent)]" : "text-[var(--muted)]"}`} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      {cur && (
        <section key={cur.key} className="card detail-in sticky top-24 p-5" data-testid="detail" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[21px]">{KIND[cur.kind]} {cur.amountText ? <span className="money">{cur.amountText}</span> : null} on {cur.name}</h2>
              <p className="mt-0.5 text-[13px] muted">{cur.by} · {cur.ago} · <Link className="link" href={`/case/${cur.caseId}#acct-${cur.account}`}>{cur.caseId}</Link> · <span className="mono">{cur.account}</span></p>
            </div>
            <div className="text-right"><p className="label">Victims&apos; money in it</p><p className="money text-[20px]">{cur.traced}</p></div>
          </div>

          <dl className="mt-5 grid gap-x-8 gap-y-4 text-[14px] md:grid-cols-2">
            {cur.withinTraced !== null && (
              <Row k="Right size">
                {cur.withinTraced ? <span className="inline-flex items-center gap-1.5 text-[var(--good)]"><Check size={15} aria-hidden />Not more than the victims&apos; money</span>
                  : <span className="inline-flex items-center gap-1.5 text-[var(--bad)]"><X size={15} aria-hidden />More than the victims&apos; money</span>}
              </Row>
            )}
            {cur.aiText && <Row k="AI suggested">{cur.aiText}</Row>}
            {cur.officerChoice && <Row k="Officer chose">{cur.officerChoice}</Row>}
            {cur.reason && <Row k="Officer's reason">{cur.reason}{cur.note ? <span className="block text-[13px] muted">&ldquo;{cur.note}&rdquo;</span> : null}</Row>}
            {cur.score && <Row k="Mule score">{cur.score}</Row>}
            {cur.rules && <Row k="Rules">{cur.rules}</Row>}
          </dl>
          {cur.clash && <p className="mt-4 rounded-lg bg-[var(--warn-tint)] px-3 py-2 text-[13.5px] text-[var(--warn)]"><b>Evidence clashes:</b> {cur.clash}</p>}

          <div className="mt-5 border-t border-[var(--line)] pt-4">
            {cur.mine ? <p className="chip chip-warn">You proposed this. Another supervisor must decide.</p>
              : cur.kind === "OVERRULE" ? (
                <div className="flex flex-wrap items-start gap-3">
                  <ActForm action={signoffAction} hidden={{ did: cur.did!, approve: "yes", note: "" }} label="Agree with the officer" testid="signoff-approve" />
                  <ActForm action={signoffAction} hidden={{ did: cur.did!, approve: "no" }} label="Send back" variant="danger" testid="signoff-back" className="flex min-w-[320px] flex-1 items-center gap-2">
                    <input name="note" placeholder="Why (the officer sees this)" className="input flex-1 py-2" />
                  </ActForm>
                </div>
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  <ActForm action={decideAction} hidden={{ pid: cur.pid!, approve: "yes", note: "" }} label="Approve" testid="approve" />
                  <ActForm action={decideAction} hidden={{ pid: cur.pid!, approve: "no" }} label="Reject" variant="danger" testid="reject" className="flex min-w-[320px] flex-1 items-center gap-2">
                    <input name="note" placeholder="Why (sent to the officer)" className="input flex-1 py-2" />
                  </ActForm>
                </div>
              )}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><dt className="label">{k}</dt><dd className="mt-0.5">{children}</dd></div>;
}
