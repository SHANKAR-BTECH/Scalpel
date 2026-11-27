import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Bot, Mail } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { desk, LEA_REASONS } from "@/lib/server/desk";
import { leaById, leaPreRead, leaDay, LEA_MAX_DAYS } from "@/lib/server/lea";
import { ActForm } from "@/components/ActForm";
import { LeaDecideForm } from "@/components/LeaDecideForm";
import { leaOfficerAction, leaCallbackAction, leaNumberAction } from "@/app/actions";
import { when } from "@/lib/format";
import { userById } from "@/lib/users";

const OUT: Record<string, string> = { RELEASE: "Released as asked", NARROW: "Released less than asked", REFUSE: "Refused" };

export default async function PoliceRequest({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("telco");
  const { id } = await params;
  const r = leaById(id);
  if (!r) notFound();
  const d = await desk();
  const done = d.leaByReq.get(r.id);
  const checks = d.leaChecks.filter((x) => x.req === r.id);
  const officer = [...checks].reverse().find((x) => x.kind === "officer");
  const callback = checks.find((x) => x.kind === "callback");
  const numberCheck = (n: string) => [...checks].reverse().find((x) => x.kind === "number" && x.ref === n);
  const days = Math.round((r.to - r.from) / 86_400_000);
  return (
    <div>
      <Link href="/telco/police" className="link inline-flex items-center gap-1 text-[13.5px]"><ChevronLeft size={15} aria-hidden />All police requests</Link>
      <h1 className="mt-2">{r.id}: {r.caseRef}</h1>
      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <section className="card p-5" data-testid="lea-letter">
            <h2 className="flex items-center gap-2"><Mail size={17} className="text-[var(--phone)]" aria-hidden />The request as it arrived</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2">
              <div><dt className="label">From</dt><dd className="mono text-[13px]">{r.fromEmail}</dd></div>
              <div><dt className="label">Received</dt><dd>{when(r.receivedAt)}{r.urgent && <span className="ml-1.5 chip chip-warn">Marked urgent</span>}</dd></div>
              <div><dt className="label">Officer, as written</dt><dd>{r.officer}, {r.rankWritten}</dd></div>
              <div><dt className="label">Station</dt><dd>{r.station}</dd></div>
              <div><dt className="label">Case</dt><dd>{r.caseRef}</dd></div>
              <div><dt className="label">Dates asked for</dt><dd>{leaDay(r.from)} to {leaDay(r.to)} <span className="muted">({days} days)</span></dd></div>
            </dl>
            <p className="mt-3 text-[14px]"><span className="label block">Purpose</span>{r.purpose}</p>
            <p className="mt-3 text-[14px]"><span className="label block">Numbers</span><span className="mono">{r.numbers.join(" · ")}</span></p>
            <p className="mt-3 text-[12.5px] muted">{r.signed}</p>
          </section>

          <section className="card p-5" data-testid="lea-checks">
            <h2>Your checks</h2>
            <p className="mt-0.5 text-[13.5px] muted">Use the directory, not the letter: a forged request carries its own phone number.</p>
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="font-medium">1 · Who is the officer?</p>
              {officer && <p className={`mt-1 text-[13.5px] ${officer.ok ? "" : "text-[var(--warn)]"}`} data-testid="lea-officer-done">{officer.text}</p>}
              {!done && !officer?.ok && <ActForm action={leaOfficerAction} hidden={{ req: r.id }} label="Look up in the directory" variant="ghost" size="sm" testid="lea-officer" className="mt-2 flex flex-wrap items-center gap-2">
                <input name="name" className="input max-w-[280px]" placeholder="Officer's name, as on the request" data-testid="lea-officer-name" />
              </ActForm>}
            </div>
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="font-medium">2 · Did the station really send it?</p>
              {callback ? <p className={`mt-1 text-[13.5px] ${callback.ok ? "" : "font-medium text-[var(--bad)]"}`} data-testid="lea-callback-done">Called {callback.ref}&apos;s office on the directory number: {callback.text}</p>
                : !done && <ActForm action={leaCallbackAction} hidden={{ req: r.id }} label="Call the station back on the directory number" variant="ghost" size="sm" testid="lea-callback" className="mt-2" />}
            </div>
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="font-medium">3 · Does each number belong to the case?</p>
              <ul className="mt-2 space-y-2 text-[13.5px]">
                {r.numbers.map((n) => {
                  const c = numberCheck(n);
                  return (
                    <li key={n} data-testid="lea-number">
                      <span className="mono">{n}</span>
                      {c ? <span className="mt-0.5 block" data-testid="lea-number-done">{c.text}</span> : !done && (
                        <ActForm action={leaNumberAction} hidden={{ req: r.id, number: n }} label="Look it up" variant="ghost" size="sm" testid="lea-number-check" className="mt-1" />
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[12.5px] muted">Compare each with the case: the alerts and handsets you know, the purpose in the letter. A number that has nothing to do with it is someone&apos;s private life.</p>
            </div>
            <div className="mt-4 border-t border-[var(--line)] pt-3 text-[13.5px]">
              <p className="font-medium">4 · Do the dates fit the purpose?</p>
              <p className="mt-1">{days} days asked for. Telco-A releases at most {LEA_MAX_DAYS} days, and only the period the purpose needs.</p>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5" data-testid="lea-preread">
            <h2 className="flex items-center gap-2"><Bot size={17} className="text-[var(--phone)]" aria-hidden />Telco-A assistant (rule-based)</h2>
            <p className="mt-0.5 text-[12.5px] muted">It reads the letter only and sets it against the checklist. It does not decide.</p>
            <ul className="mt-3 space-y-1.5 text-[13.5px]">{leaPreRead(r).map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--phone)]" />{x}</li>)}</ul>
            <p className="mt-3 text-[11.5px] muted">Rank rule: Superintendent of Police or above, as reported of a 2019 MHA/DoT tightening (the order itself is not checked). The {LEA_MAX_DAYS}-day line is Telco-A&apos;s own policy in this demo.</p>
          </section>
          <section className="card p-5" data-testid="lea-decide-panel">
            <h2>Your answer</h2>
            {done ? (
              <div className="mt-3 text-[13.5px]" data-testid="lea-done">
                <p className="font-semibold">{OUT[done.outcome]}</p>
                <p className="mt-1 muted">{done.reason}{done.note ? `: ${done.note}` : ""}</p>
                {done.numbers.length > 0 && <p className="mt-1">{done.numbers.join(", ")} · {leaDay(done.from)} to {leaDay(done.to)}</p>}
                <p className="mt-1 muted">{userById(done.by)?.name ?? done.by} · {when(done.at)}</p>
                {done.flags.map((f) => <p key={f} className="mt-2 rounded-xl bg-[var(--bad-tint,#fdecec)] px-3 py-2 text-[var(--bad)]" data-testid="lea-flag">{f}</p>)}
                {done.numbers.length > 0 && <a href={`/api/lea/${r.id}`} className="btn btn-sm mt-3" download data-testid="lea-download">Download the file for {r.officer} (CSV)</a>}
              </div>
            ) : (
              <LeaDecideForm req={r.id} numbers={r.numbers} from={leaDay(r.from)} to={leaDay(r.to)} reasons={LEA_REASONS} ready={{ officer: Boolean(officer), callback: Boolean(callback), looked: r.numbers.filter((n) => numberCheck(n)) }} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
