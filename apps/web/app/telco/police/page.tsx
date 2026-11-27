import Link from "next/link";
import { ChevronRight, FileLock2 } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { desk } from "@/lib/server/desk";
import { leaRequests, leaDay } from "@/lib/server/lea";
import { ago } from "@/lib/format";

const OUT: Record<string, string> = { RELEASE: "Released as asked", NARROW: "Released less", REFUSE: "Refused" };

export default async function PoliceRequests() {
  await requireUser("telco");
  const d = await desk();
  const list = [...leaRequests()].sort((a, b) => b.receivedAt - a.receivedAt);
  const open = list.filter((r) => !d.leaByReq.has(r.id));
  return (
    <div>
      <h1>Police requests for call records</h1>
      <p className="mt-1 max-w-[780px] muted">Check who really sent each one before anything leaves Telco-A: the officer in the directory, a call back on the directory number, every number, and the dates. Then release what was asked, release less, or refuse. Records go to the officer only, never to a bank.</p>
      <section className="card board mt-5" data-testid="lea-list">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line-strong)] px-4 py-3">
          <h2>{open.length} to answer</h2>
          <p className="text-[13px] muted">{list.length - open.length} answered</p>
        </div>
        <ul>
          {list.map((r) => {
            const done = d.leaByReq.get(r.id);
            const checks = d.leaChecks.filter((x) => x.req === r.id).length;
            return (
              <li key={r.id} className="board-row" data-testid="lea-row">
                <Link href={`/telco/police/${r.id}`} className="grid items-center gap-x-5 gap-y-2 px-4 py-3.5 md:grid-cols-[minmax(260px,1.4fr)_minmax(200px,1fr)_150px_20px]">
                  <span className="flex min-w-0 items-start gap-3">
                    <FileLock2 size={18} className="mt-0.5 shrink-0 text-[var(--phone)]" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-semibold">{r.officer}, {r.station}</span>
                      <span className="block text-[12.5px] muted">{r.caseRef}</span>
                      <span className="block text-[12.5px] muted">{r.numbers.length} number{r.numbers.length === 1 ? "" : "s"} · {leaDay(r.from)} to {leaDay(r.to)}{r.urgent && <span className="ml-1.5 chip chip-warn">Marked urgent</span>}</span>
                    </span>
                  </span>
                  <span className="text-[13px]">{done ? <><span className="label block">Answered</span>{OUT[done.outcome]}{done.flags.length > 0 && <span className="block text-[var(--bad)]">{done.flags.length} flag{done.flags.length > 1 ? "s" : ""}</span>}</> : <><span className="label block">Your checks</span>{checks ? `${checks} done` : <span className="muted">Not started</span>}</>}</span>
                  <span className="text-[12px] muted">{r.id} · {ago(r.receivedAt, d.now)}</span>
                  <ChevronRight size={16} className="hidden text-[var(--muted)] md:block" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
