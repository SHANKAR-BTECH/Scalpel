import { requireUser } from "@/lib/server/auth";
import { desk, phoneTarget } from "@/lib/server/desk";
import { model, W } from "@/lib/server/world";
import { ActForm } from "@/components/ActForm";
import { simCheckAction, telcoActAction } from "@/app/actions";
import { ago, day, inr } from "@/lib/format";
import { userById } from "@/lib/users";

const SIGN: Record<string, string> = {
  HANDSET_GT5_SIMS: "more than 5 SIMs in one handset", SIMBOX_ROUTE: "calls leave through a SIM-box gateway", SIM_SWAP_LT_72H: "SIM swapped in the last 3 days", GE3_CASE_LINKED_SENDERS: "called 3 or more fraud victims",
};

export default async function Telco() {
  await requireUser("telco");
  const d = await desk();
  const m = model();
  const blocked = (kind: string, value: string) => d.actions.find((a) => a.kind === kind && a.value === value && a.outcome === "BLOCKED");
  const victimsOf = (pred: (c: (typeof W.calls)[number]) => boolean) => {
    const calls = W.calls.filter(pred);
    const phones = new Set(calls.map((c) => c.to));
    const lost = [...phones].reduce((s, p) => { const v = [...m.victimById.values()].find((x) => x.phone === p); const c = v && m.complaintByVictim.get(v.id); return s + (c ? W.txns.find((t) => t.id === c.txnId)!.amount : 0); }, 0);
    return { calls: calls.length, victims: phones.size, lost };
  };
  const finds = [
    ...W.rigs.map((r) => ({ key: r.imei, title: `${r.kind === "simbox" ? "SIM box" : "One handset"} with ${r.sims.length} SIMs`, sub: `IMEI ${r.imei} · cell ${r.cell} (${r.state})`, rig: r, stats: victimsOf((c) => c.imei === r.imei), cases: m.casesOfRig.get(r.id) ?? [], kind: "IMEI" as const })),
    ...W.soloSims.map((s) => ({ key: s.msisdn, title: "One SIM, swapped recently", sub: `${s.msisdn} · IMEI ${s.imei}`, rig: null, stats: victimsOf((c) => c.realSim === s.msisdn), cases: m.casesOfRig.get(s.msisdn) ?? [], kind: "MSISDN" as const })),
  ].sort((a, b) => b.stats.victims - a.stats.victims);
  const openAsks = d.asks.filter((a) => !a.done);
  const shown = [...new Set(W.calls.map((c) => c.shownCaller).filter((n) => m.spoofed.has(n)))];
  return (
    <div>
      <h1 className="mt-1">Find the phone behind the scams</h1>
      <p className="mt-1 max-w-[760px] muted">Our call records show which SIM and handset really made each call. Many cases at the bank lead back to a few devices: block the device, not the number the victim saw.</p>

      <section className="mt-5">
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

      <section className="mt-7">
        <h2>Devices behind the most victims</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2" data-testid="finds">
          {finds.map((f) => {
            const t = phoneTarget(f.kind, f.key, d.now, d.checks);
            const route = f.rig?.route ? phoneTarget("ROUTE", f.rig.route, d.now, d.checks) : null;
            const b = blocked(f.kind, f.key);
            return (
              <div key={f.key} className="card p-4" data-testid="find">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold text-[var(--phone)]">{f.title}</p><p className="mono text-[12px] muted">{f.sub}</p></div>
                  {b ? <span className="chip chip-good">Blocked {ago(b.at, d.now)}</span> : <span className="chip chip-phone">Active</span>}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                  <div><dt className="muted">Scam calls</dt><dd className="money text-[17px]">{f.stats.calls}</dd></div>
                  <div><dt className="muted">Victims called</dt><dd className="money text-[17px]">{f.stats.victims}</dd></div>
                  <div><dt className="muted">They lost</dt><dd className="money text-[17px]">{inr(f.stats.lost)}</dd></div>
                </dl>
                <p className="mt-2 text-[13px]">Linked bank cases: <span className="font-medium">{f.cases.join(", ") || "none"}</span></p>
                <p className="mt-1 text-[12.5px] muted">Signs: {t.signals.map((s) => SIGN[s] ?? s).join(", ") || "none"}</p>
                {!b && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActForm action={telcoActAction} hidden={{ kind: f.kind, value: f.key }} label={f.kind === "IMEI" ? "Block handset (all its SIMs)" : "Block this SIM"} variant="phone" size="sm" testid={`block-${f.kind}`} />
                    {route && !blocked("ROUTE", route.value) && <ActForm action={telcoActAction} hidden={{ kind: "ROUTE", value: route.value }} label={`Block ${route.value}`} variant="ghost" size="sm" testid="block-route" />}
                  </div>
                )}
                {route?.collateral && !b && <p className="mt-2 text-[12.5px] text-[var(--warn)]">Route check: {route.collateral}</p>}
                {f.rig && (
                  <details className="mt-3 text-[13px]">
                    <summary className="link">See its {f.rig.sims.length} SIMs</summary>
                    <ul className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                      {f.rig.sims.map((s) => <li key={s.msisdn} className="mono text-[12px]">{s.msisdn} <span className="muted">· on {day(s.activatedAt)} as &ldquo;{s.kycName}&rdquo;</span></li>)}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-7 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2>Numbers victims saw on screen</h2>
          <p className="mt-1 text-[13.5px] muted">These were faked by the callers. Scalpel will not block them.</p>
          <ul className="mt-3 space-y-3" data-testid="spoofed">
            {shown.map((n) => {
              const t = phoneTarget("MSISDN", n, d.now, d.checks);
              const owner = W.spoofedOwners.find((o) => o.msisdn === n)?.holder.name ?? W.protectedNumbers.find((p) => p.msisdn === n)?.owner ?? "a genuine subscriber";
              const tried = d.actions.filter((a) => a.value === n).at(-1);
              return (
                <li key={n} className="rounded-lg border border-[var(--line)] p-3 text-[13.5px]">
                  <p className="mono font-semibold">{n}</p>
                  <p className="muted">Belongs to {owner}. Shown in {W.calls.filter((c) => c.shownCaller === n).length} scam calls that really came from other SIMs.</p>
                  <p className="mt-1 text-[var(--bad)]">{t.refusal[0]}</p>
                  {tried ? <p className="mt-1 chip chip-bad">Block refused {ago(tried.at, d.now)}</p> : <ActForm action={telcoActAction} hidden={{ kind: "MSISDN", value: n }} label="Try to block it" variant="ghost" size="sm" className="mt-2" testid="try-spoof" />}
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
