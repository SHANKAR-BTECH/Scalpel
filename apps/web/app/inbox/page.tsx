import Link from "next/link";
import { Stagger } from "@/components/Stagger";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { model, W } from "@/lib/server/world";
import { ago, inr, inrShort } from "@/lib/format";
import { SortSelect } from "@/components/SortSelect";

const SORTS = {
  money: { label: "Most money still in accounts", fn: (a: S, b: S) => b.catchable - a.catchable },
  urgent: { label: "Most urgent (money × victims ÷ minutes)", fn: (a: S, b: S) => b.priority - a.priority },
  newest: { label: "Newest complaint", fn: (a: S, b: S) => b.lastReportAt - a.lastReportAt },
  victims: { label: "Most victims", fn: (a: S, b: S) => b.complaints.length - a.complaints.length },
  fastest: { label: "Money moves fastest", fn: (a: S, b: S) => a.minutesToCashOut - b.minutesToCashOut },
} as const;
type S = ReturnType<typeof model>["cases"][number];

export default async function Inbox({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  await requireUser("officer", "supervisor");
  const { sort = "money" } = await searchParams;
  const key = (sort in SORTS ? sort : "money") as keyof typeof SORTS;
  const m = model();
  const d = await desk();
  const cases = [...m.cases].sort(SORTS[key].fn);
  const held = (c: S) => c.accounts.filter((a) => d.holdByAccount.has(a));
  const total = cases.reduce((s, c) => s + c.catchable, 0);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{cases.length} cases from {W.complaints.length} complaints</h1>
          <p className="mt-1 muted">Complaints that paid the same accounts are grouped into one case. {inrShort(total)} of victims' money is still sitting in accounts at this bank.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-[13px] muted">Sort by</label>
          <SortSelect value={key} options={Object.entries(SORTS).map(([k, v]) => ({ value: k, label: v.label }))} />
        </div>
      </div>
      <Stagger className="card board mt-5" data-testid="case-list">
        <div className="inbox-grid board-head"><span>Case</span><span className="text-right">Reported lost</span><span className="text-right">Still in accounts</span><span>Held</span><span /></div>
        {cases.map((c) => {
          const h = held(c);
          const withMoney = c.accounts.filter((a) => (m.accounts.get(a)?.traced ?? 0) > 0);
          const pending = c.accounts.filter((a) => d.pendingByAccount.has(a)).length;
          const linked = c.rigs.flatMap((r) => (m.casesOfRig.get(r) ?? []).filter((x) => x !== c.id));
          return (
            <Link key={c.id} href={`/case/${c.id}`} className="inbox-grid board-row group" data-testid="case-row">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.scamType}</span>
                  <span className="mono text-[12px] muted">{c.id}</span>
                  {pending > 0 && <span className="chip chip-warn">{pending} waiting approval</span>}
                </span>
                <span className="mt-0.5 block text-[13px] muted">{c.complaints.length} {c.complaints.length === 1 ? "victim" : "victims"} · last complaint {ago(c.lastReportAt, d.now)} · money moves on in ~{c.minutesToCashOut} min{linked.length > 0 && <span className="text-[var(--phone)]"> · same phone as {[...new Set(linked)].join(", ")}</span>}</span>
              </span>
              <span className="money text-right">{inr(c.reported)}</span>
              <span className="money text-right text-[var(--accent-ink)]">{inr(c.catchable)}</span>
              <span className="flex items-center gap-2 text-[13px]">
                <span className="thread w-16"><span className="thread-fill" style={{ width: `${withMoney.length ? (h.length / withMoney.length) * 100 : 0}%` }} /></span>
                <span className="num muted">{h.length}/{withMoney.length}</span>
              </span>
              <ChevronRight size={16} className="justify-self-end text-[var(--muted)] transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </Link>
          );
        })}
      </Stagger>
    </div>
  );
}
