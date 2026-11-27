"use client";
/**
 * The supervisor's check of one hold. Each of the four checks opens its own evidence (cut to this one account);
 * "Checked" unlocks only after he has opened it. One payment is a spot-check: he works out its share himself.
 * Approve unlocks when all four are checked and the spot-check is answered. Time spent is recorded for compliance.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, TriangleAlert, Check } from "lucide-react";
import { ActForm } from "./ActForm";
import { decideAction } from "@/app/actions";
import type { HoldReview as Review } from "@/lib/server/review";
import { inr, when, day } from "@/lib/format";

const CODES = ["Trail doesn't reach this account", "Amount doesn't match the trail", "Police request not usable yet", "Holder needs a carve-out (pension or salary)", "Looks innocent: don't hold", "Other"];
const CHECKS: { key: "path" | "amount" | "police" | "impact"; title: string; ask: string }[] = [
  { key: "path", title: "Money path", ask: "Does the money really come from a victim to this account?" },
  { key: "amount", title: "Amount", ask: "Is the hold no more than the victims' money here?" },
  { key: "police", title: "Police request", ask: "Is the request usable: signed, magistrate told, asks for enough?" },
  { key: "impact", title: "Holder impact", ask: "What does the hold leave the holder to live on?" },
];

export function HoldReview({ pid, r }: { pid: string; r: Review }) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [spot, setSpot] = useState("");
  const [code, setCode] = useState("");
  const t0 = useRef(Date.now());
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs(Math.round((Date.now() - t0.current) / 1000)), 1000); return () => clearInterval(t); }, []);

  const toggle = (k: string) => { setOpen((o) => (o === k ? null : k)); setOpened((s) => new Set(s).add(k)); };
  const ready = done.size === 4 && (!r.spot || spot.trim() !== "");
  const left = CHECKS.filter((c) => !done.has(c.key)).length;

  return (
    <div className="mt-4 space-y-3" data-testid="hold-review">
      {r.flags.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-[var(--warn-tint)] px-3 py-2 text-[13.5px] text-[var(--warn)]" data-testid="review-flags">
          {r.flags.map((f) => <li key={f} className="flex gap-2"><TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />{f}</li>)}
        </ul>
      )}

      {CHECKS.map((c) => (
        <div key={c.key} className="rounded-xl border border-[var(--line)]" data-testid={`check-${c.key}`}>
          <button type="button" onClick={() => toggle(c.key)} aria-expanded={open === c.key} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" data-testid={`open-${c.key}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done.has(c.key) ? "border-[var(--good)] bg-[var(--good)] text-white" : "border-[var(--line-strong)]"}`}>{done.has(c.key) && <Check size={13} aria-hidden />}</span>
            <span className="flex-1"><span className="font-semibold">{c.title}</span><span className="block text-[12.5px] muted">{c.ask}</span></span>
            <ChevronDown size={16} className={`transition-transform ${open === c.key ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {open === c.key && (
            <div className="border-t border-[var(--line)] px-3 py-3 text-[13.5px]">
              {c.key === "path" && <PathView r={r} />}
              {c.key === "amount" && <AmountView r={r} spot={spot} setSpot={setSpot} />}
              {c.key === "police" && <PoliceView r={r} />}
              {c.key === "impact" && <ImpactView r={r} />}
              <label className="mt-3 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={done.has(c.key)} disabled={!opened.has(c.key)} onChange={(e) => setDone((s) => { const n = new Set(s); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} data-testid={`checked-${c.key}`} />
                I checked the {c.title.toLowerCase()}
              </label>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-start gap-3 border-t border-[var(--line)] pt-4">
        <ActForm action={decideAction} hidden={{ pid, approve: "yes", seconds: secs }} label={ready ? "Approve" : `Approve (${left ? `${left} check${left === 1 ? "" : "s"} left` : "spot-check left"})`} testid="approve" disabled={!ready} className="flex flex-wrap items-center gap-2">
          {[...done].map((k) => <input key={k} type="hidden" name="check" value={k} />)}
          <input type="hidden" name="spot" value={spot} />
          <input name="note" placeholder="Note (needed if your spot-check differs)" className="input w-64 py-2" />
        </ActForm>
        <ActForm action={decideAction} hidden={{ pid, approve: "no", seconds: secs, code }} label="Send back" variant="danger" testid="reject" className="flex min-w-[320px] flex-1 flex-wrap items-center gap-2">
          {[...done].map((k) => <input key={k} type="hidden" name="check" value={k} />)}
          <select className="input min-w-[230px] flex-1 py-2" value={code} onChange={(e) => setCode(e.target.value)} data-testid="back-code" aria-label="Why send it back">
            <option value="">Why send it back?</option>
            {CODES.map((x) => <option key={x}>{x}</option>)}
          </select>
          <input name="note" placeholder="Note to the officer" className="input flex-1 py-2" />
        </ActForm>
      </div>
      <p className="text-[12px] muted">Time on this hold: {secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`}. Compliance sees what you checked and how long you spent.</p>
    </div>
  );
}

function PathView({ r }: { r: Review }) {
  if (!r.path.length) return <p className="text-[var(--bad)]">The officer&apos;s saved trail has no pinned payment into this account.</p>;
  return (
    <div>
      <p className="muted">From the officer&apos;s saved trail{r.trailVersion ? ` (version ${r.trailVersion})` : ""}, only the steps that lead here.</p>
      <ol className="mt-2 space-y-1.5" data-testid="review-path">
        {r.path.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="mono text-[12px] muted">{i + 1}.</span>
            <span className={s.kind === "payment" ? "font-semibold text-[var(--bad)]" : ""}>{s.from}</span>
            <span className="muted">→</span><span className="font-medium">{s.to}</span>
            <span className="money">{inr(s.amount)}</span><span className="text-[12px] muted">{when(s.at)} · <span className="mono">{s.id}</span></span>
          </li>
        ))}
      </ol>
      {r.path[0]?.kind !== "payment" && <p className="mt-2 text-[var(--bad)]">The path stops before a victim&apos;s payment: there is a gap.</p>}
    </div>
  );
}

function AmountView({ r, spot, setSpot }: { r: Review; spot: string; setSpot: (s: string) => void }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-3">
        <div><dt className="label">Hold asked</dt><dd className={`money text-[16px] ${r.sum.hold > r.sum.traced + 100 ? "text-[var(--bad)]" : ""}`}>{inr(r.sum.hold)}</dd></div>
        <div><dt className="label">Victims&apos; money here</dt><dd className="money text-[16px]">{inr(r.sum.traced)}</dd></div>
        <div><dt className="label">Police asked</dt><dd className="money text-[16px]">{r.sum.asked === null ? "Whole a/c" : inr(r.sum.asked)}</dd></div>
      </dl>
      {r.rows.length > 0 && (
        <div className="max-h-[260px] overflow-auto">
          <table className="table w-full min-w-[560px] text-[12.5px]" data-testid="review-rows">
            <thead><tr><th>Time</th><th>Narration</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.id} className={x.id === r.spot?.txn ? "bg-[var(--warn-tint)]" : ""}>
                  <td className="whitespace-nowrap">{when(x.at)}</td>
                  <td className="max-w-[220px]"><span className="mono block truncate">{x.narration}</span><span className="muted">{x.other}</span></td>
                  <td className="money text-right">{x.dir === "out" ? inr(x.amount) : ""}</td>
                  <td className={`money text-right ${x.mark === "victim" ? "font-semibold text-[var(--bad)]" : ""}`}>{x.dir === "in" ? inr(x.amount) : ""}</td>
                  <td className="money text-right">{inr(x.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[12px] muted">The rows the officer pinned on this account. Victims&apos; money coming in is in red.</p>
        </div>
      )}
      {r.spot ? (
        <div className="rounded-xl bg-[var(--warn-tint)] p-3" data-testid="spot" data-amount={r.spot.amount} data-before={r.spot.balanceBefore} data-victim={r.spot.victimBefore}>
          <p className="font-semibold">Spot-check: work out one share yourself</p>
          <p className="mt-1">Payment <span className="mono">{r.spot.txn}</span> ({when(r.spot.at)}) took <b className="money">{inr(r.spot.amount)}</b> out of a balance of <b className="money">{inr(r.spot.balanceBefore)}</b>, of which <b className="money">{inr(r.spot.victimBefore)}</b> was victims&apos; money. Pro-rata: how much victims&apos; money left with it?</p>
          <label className="mt-2 flex items-center gap-2"><span className="text-[13px]">₹</span><input className="input w-40 mono" inputMode="decimal" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Your answer" data-testid="spot-in" /></label>
        </div>
      ) : <p className="muted">No pinned payment out of this account to spot-check.</p>}
    </div>
  );
}

function PoliceView({ r }: { r: Review }) {
  const p = r.police;
  return (
    <dl className="grid gap-2 sm:grid-cols-2" data-testid="review-police">
      <div><dt className="label">Request</dt><dd className="mono">{p.id}</dd></div>
      <div><dt className="label">From</dt><dd>{p.issuer}</dd></div>
      <div><dt className="label">Signed</dt><dd className={p.signed ? "text-[var(--good)]" : "font-semibold text-[var(--bad)]"}>{p.signed ? "Yes" : "No"}</dd></div>
      <div><dt className="label">Magistrate told</dt><dd className={p.magistrate ? "" : "font-semibold text-[var(--bad)]"}>{p.magistrate ? day(p.magistrate) : "Not yet"}</dd></div>
      <div><dt className="label">Asks for</dt><dd>{p.asked}</dd></div>
      <div><dt className="label">Received</dt><dd>{when(p.receivedAt, true)}</dd></div>
      {p.rules.length > 0 && <div className="sm:col-span-2"><dt className="label">Rule checks that failed</dt><dd className="text-[var(--bad)]">{p.rules.join("; ")}</dd></div>}
    </dl>
  );
}

function ImpactView({ r }: { r: Review }) {
  const i = r.impact;
  return (
    <div data-testid="review-impact">
      <dl className="grid grid-cols-3 gap-3">
        <div><dt className="label">Balance now</dt><dd className="money text-[16px]">{inr(i.balance)}</dd></div>
        <div><dt className="label">Hold</dt><dd className="money text-[16px]">{inr(i.hold)}</dd></div>
        <div><dt className="label">Left to use</dt><dd className={`money text-[16px] ${i.monthly && i.left < i.monthly ? "text-[var(--bad)]" : ""}`}>{inr(i.left)}</dd></div>
      </dl>
      <p className="mt-2">{i.before ? <>Before the scam: {i.before}{i.monthly ? ` (about ${inr(i.monthly)} a month)` : ""}.</> : "No regular income seen before the scam."}</p>
      {i.monthly && i.left < i.monthly && <p className="mt-1 font-semibold text-[var(--bad)]">The hold leaves less than one month&apos;s income. Consider sending it back for a carve-out.</p>}
    </div>
  );
}
