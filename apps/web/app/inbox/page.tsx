import Link from "next/link";
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
          <p className="eyebrow">Inbox · {W.bank.name}</p>
          <h1 className="mt-1">{cases.length} cases from {W.complaints.length} complaints</h1>
          <p className="mt-1 muted">Complaints that paid the same accounts are grouped into one case. {inrShort(total)} of victims' money is still sitting in accounts at this bank.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-[13px] muted">Sort by</label>
          <SortSelect value={key} options={Object.entries(SORTS).map(([k, v]) => ({ value: k, label: v.label }))} />
        </div>
      </div>
      <ul className="mt-5 space-y-2.5" data-testid="case-list">
        {cases.map((c) => {
          const h = held(c);
          const withMoney = c.accounts.filter((a) => (m.accounts.get(a)?.traced ?? 0) > 0);
          const pending = c.accounts.filter((a) => d.pendingByAccount.has(a)).length;
          const linked = c.rigs.flatMap((r) => (m.casesOfRig.get(r) ?? []).filter((x) => x !== c.id));
          return (
            <li key={c.id}>
              <Link href={`/case/${c.id}`} className="card lift grid gap-3 p-4 md:grid-cols-[1.4fr_repeat(3,minmax(0,0.6fr))] md:items-center" data-testid="case-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-[12.5px] muted">{c.id}</span>
                    <span className="font-semibold">{c.scamType}</span>
                    {h.length > 0 && <span className="chip chip-blue">{h.length} held</span>}
                    {pending > 0 && <span className="chip chip-warn">{pending} waiting approval</span>}
                    {h.length === 0 && pending === 0 && <span className="chip chip-grey">New</span>}
                  </div>
                  <p className="mt-1 text-[13.5px] muted">{c.complaints.length} {c.complaints.length === 1 ? "victim" : "victims"} · last complaint {ago(c.lastReportAt, d.now)} · money usually moves on in ~{c.minutesToCashOut} min</p>
                  {linked.length > 0 && <p className="mt-1 text-[13px] text-[var(--phone)]">Same phone as {[...new Set(linked)].join(", ")}</p>}
                </div>
                <div><p className="text-[12px] muted">Reported lost</p><p className="money">{inr(c.reported)}</p></div>
                <div><p className="text-[12px] muted">Still in accounts</p><p className="money text-[var(--accent)]">{inr(c.catchable)}</p></div>
                <div><p className="text-[12px] muted">Accounts holding it</p><p className="money">{h.length} / {withMoney.length} held</p></div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
