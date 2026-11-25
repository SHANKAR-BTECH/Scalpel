import Link from "next/link";
import { ChevronRight, Smartphone, Phone } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { desk, phoneTarget } from "@/lib/server/desk";
import { model, W } from "@/lib/server/world";
import { alerts, ACTION_LABEL } from "@/lib/server/telco";
import { ActForm } from "@/components/ActForm";
import { simCheckAction, telcoActAction } from "@/app/actions";
import { ago } from "@/lib/format";
import { userById } from "@/lib/users";

export default async function Telco() {
  await requireUser("telco");
  const d = await desk();
  const m = model();
  const list = alerts();
  const open = list.filter((a) => !d.telcoByAlert.has(a.id));
  const openAsks = d.asks.filter((a) => !a.done);
  const shown = [...new Set(W.calls.map((c) => c.shownCaller).filter((n) => m.spoofed.has(n)))].slice(0, 4);
  return (
    <div>
      <h1>Alerts from Telco-A&apos;s AI</h1>
      <p className="mt-1 max-w-[780px] muted">The AI watches network counters and flags handsets and numbers that look like fraud. Open one, run the trace, and decide with it. Your report goes to DoT, which rates the risk for banks; call records go only to police.</p>

      <section className="card board mt-5" data-testid="alerts">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line-strong)] px-4 py-3">
          <h2>{open.length} to decide</h2>
          <p className="text-[13px] muted">{list.length - open.length} decided · {d.telco.filter((t) => !t.agreed).length} overruled the AI</p>
        </div>
        <ul>
          {list.map((a) => {
            const t = d.telcoByAlert.get(a.id);
            const Icon = a.kind === "IMEI" ? Smartphone : Phone;
            return (
              <li key={a.id} className="board-row" data-testid="alert-card">
                <Link href={`/telco/${a.id}`} className="grid items-center gap-x-5 gap-y-2 px-4 py-3.5 md:grid-cols-[minmax(240px,1.3fr)_minmax(220px,1fr)_150px_20px]" data-testid="open-trace">
                  <span className="flex min-w-0 items-start gap-3">
                    <Icon size={18} className="mt-0.5 shrink-0 text-[var(--phone)]" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-semibold">{a.title}</span>
                      <span className="block truncate mono text-[12px] muted">{a.sub}</span>
                      <span className="mt-0.5 block text-[12.5px] muted">{a.facts[0]}</span>
                    </span>
                  </span>
                  <span className="text-[13px]">
                    <span className="label block">AI suggests · {Math.round(a.ai.confidence * 100)}%</span>
                    <span className="block">{ACTION_LABEL[a.ai.suggest]}</span>
                    <span className="thread mt-1.5 block" style={{ height: 4 }}><span className="thread-fill block" style={{ width: `${a.ai.confidence * 100}%`, background: "#0d0d0d" }} /></span>
                  </span>
                  <span>
                    {t ? <span className={`chip ${t.agreed ? "chip-good" : "chip-warn"}`}>{t.agreed ? "Decided with AI" : "AI overruled"}</span>
                      : <span className="chip chip-phone">New</span>}
                    {t && <span className="mt-1 block text-[12px] muted">{userById(t.by)?.name.split(" ")[0]} · {ago(t.at, d.now)}</span>}
                  </span>
                  <ChevronRight size={16} className="hidden text-[var(--muted)] md:block" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-7">
        <h2>Requests from banks {openAsks.length > 0 && <span className="chip chip-blue ml-1 align-middle">{openAsks.length} new</span>}</h2>
        {openAsks.length === 0 && <p className="mt-2 text-[14px] muted">No open requests. Bharat Demo Bank&apos;s officer can send one from any case.</p>}
        <ul className="mt-2 space-y-2" data-testid="asks">
          {openAsks.map((a) => {
            const t = phoneTarget(a.kind, a.value, d.now, d.checks);
            return (
              <li key={a.aid} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="text-[14px]"><p className="font-semibold">{t.label}</p><p className="muted text-[13px]">{userById(a.by)?.name}, Bharat Demo Bank · {a.caseId} · {ago(a.at, d.now)}</p></div>
                <ActForm action={telcoActAction} hidden={{ kind: a.kind, value: a.value }} label={t.refusal.length ? "Check and answer" : "Block"} variant="phone" size="sm" testid="ask-block" />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-2">
        <div className="card p-4">
          <h2>Block a number the victim saw?</h2>
          <p className="mt-1 text-[13.5px] muted">Banks often ask for this. These numbers were faked by the callers and belong to other people, so the block is refused with the reason.</p>
          <ul className="mt-3 space-y-3" data-testid="spoofed">
            {shown.map((n) => {
              const t = phoneTarget("MSISDN", n, d.now, d.checks);
              const owner = W.spoofedOwners.find((o) => o.msisdn === n)?.holder.name ?? W.protectedNumbers.find((p) => p.msisdn === n)?.owner ?? "a genuine subscriber";
              const tried = d.actions.filter((a) => a.value === n).at(-1);
              return (
                <li key={n} className="border-t border-[var(--line)] pt-3 text-[13.5px] first:border-0 first:pt-0">
                  <p className="mono font-semibold">{n} <span className="font-sans font-normal muted">· belongs to {owner}</span></p>
                  {tried ? <p className="mt-1 chip chip-bad">Block refused {ago(tried.at, d.now)}: {t.refusal[0]}</p> : <ActForm action={telcoActAction} hidden={{ kind: "MSISDN", value: n }} label="Try to block it" variant="ghost" size="sm" className="mt-2" testid="try-spoof" />}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card p-4">
          <h2>SIM-swap check</h2>
          <p className="mt-1 text-[13.5px] muted">Asks the network when a number&apos;s SIM card was last changed (CAMARA SIM Swap API, simulated here). A swap in the last 3 days is a warning sign.</p>
          <ActForm action={simCheckAction} label="Check" variant="phone" className="mt-3 flex flex-wrap gap-2" testid="sim-check">
            <input name="msisdn" required defaultValue={W.soloSims[0]?.msisdn} className="input mono w-[220px]" aria-label="Phone number" />
          </ActForm>
          <ul className="mt-3 space-y-1 text-[13px]">
            {d.checks.slice(-6).reverse().map((c, i) => (
              <li key={i}><span className="mono">{c.msisdn}</span>: {c.swappedHoursAgo === null ? "no swap on record" : `swapped ${c.swappedHoursAgo} h ago`} <span className="muted">· {ago(c.at, d.now)}</span></li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
