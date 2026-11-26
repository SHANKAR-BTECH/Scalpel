"use client";
/**
 * Priya's money trail workbench. No one-click answer: she starts from a victim's payment (its UTR), reads the
 * receiving account's statement, and pins the payments that carry the victims' money on. A payment to another of
 * our accounts adds that account to her trail; she opens its statement and repeats. Cash-outs are pinned as gone.
 * The statement never marks victims' money: she works it out with the pro-rata share calculator. "Check my trail"
 * asks the server, which reads only her pins and holds. Saving writes the trail to the tamper-proof record; she
 * can then decide any account her saved trail reaches.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, X, Search, Save, ShieldCheck, ArrowRight, Calculator } from "lucide-react";
import { lookupPayment, lookupStatement, lookupKyc, checkTrailAction, saveTrailAction } from "@/app/actions";
import type { PaymentResult, StatementResult, KycResult, StatementRow } from "@/lib/server/bank";
import type { TrailCheck } from "@/lib/server/trailcheck";
import { TRAIL_TITLE, type TrailKind, type TrailPin, type TrailHolds } from "@/lib/trail";
import { inr, inrShort, when, day } from "@/lib/format";

type Tool = "pay" | "stmt" | "kyc";
const TOOLS: [Tool, string, string][] = [["pay", "Payment", "UTR on the complaint, e.g. TP0002624"], ["stmt", "Statement", "Account ID, e.g. P00157"], ["kyc", "KYC card", "Account ID"]];
const dayOf = (t: number) => new Date(t + 19_800_000).toISOString().slice(0, 10);
const rupees = (s: string) => { const n = Number(s.replace(/[₹,\s]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
const TYPE: Record<string, string> = { SAVINGS: "Savings", CURRENT: "Current", SALARY: "Salary" };

export interface ComplaintItem { id: string; ack: string; utr: string; victim: string; amount: number; reportedAt: number }
export interface SavedTrailView { version: number; pins: TrailPin[]; holds: TrailHolds; by: string; at: number; accounts: { id: string; name: string }[] }

function PinBtn({ on, onClick, label = "Pin", testid = "pin" }: { on: boolean; onClick: () => void; label?: string; testid?: string }) {
  return <button type="button" onClick={onClick} disabled={on} className="btn btn-ghost btn-sm shrink-0" data-testid={testid}><Pin size={13} aria-hidden /> {on ? "Pinned" : label}</button>;
}

export function TrailWorkbench({ caseId, complaints, firstDay, lastDay, saved, canSave }: {
  caseId: string; complaints: ComplaintItem[]; firstDay: number; lastDay: number; saved: SavedTrailView | null; canSave: boolean;
}) {
  const router = useRouter();
  const [tool, setTool] = useState<Tool>("pay");
  const [q, setQ] = useState<Record<Tool, string>>({ pay: "", stmt: "", kyc: "" });
  const [from, setFrom] = useState(dayOf(firstDay));
  const [to, setTo] = useState(dayOf(lastDay));
  const [pay, setPay] = useState<PaymentResult | null>(null);
  const [stmt, setStmt] = useState<StatementResult | null>(null);
  const [kyc, setKyc] = useState<KycResult | null>(null);
  const [pins, setPins] = useState<TrailPin[]>(saved?.pins ?? []);
  const [holds, setHolds] = useState<Record<string, string>>(Object.fromEntries(Object.entries(saved?.holds ?? {}).map(([k, v]) => [k, String(v / 100)])));
  const [accts, setAccts] = useState<Record<string, string>>(Object.fromEntries((saved?.accounts ?? []).map((a) => [a.id, a.name])));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [calcRow, setCalcRow] = useState<string | null>(null);
  const [calcIn, setCalcIn] = useState("");
  const [check, setCheck] = useState<TrailCheck | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, go] = useTransition();
  const key = `scalpel-trail-v1:${caseId}`;

  // A draft per case, kept in this browser between saves.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? "null");
      if (s && s.base === (saved?.version ?? 0)) { setPins(s.pins ?? []); setHolds(s.holds ?? {}); setAccts((a) => ({ ...a, ...(s.accts ?? {}) })); }
    } catch { /* storage blocked */ }
  }, [key, saved]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify({ pins, holds, accts, base: saved?.version ?? 0 })); } catch { /* storage blocked */ } }, [key, pins, holds, accts, saved]);

  const has = (kind: TrailKind, ref: string) => pins.some((p) => p.kind === kind && p.ref === ref);
  const add = (list: TrailPin[], reach: Record<string, string> = {}) => {
    setPins((x) => [...x, ...list.filter((p) => !x.some((y) => y.kind === p.kind && y.ref === p.ref))]);
    setAccts((a) => ({ ...a, ...reach }));
    setCheck(null);
  };
  const drop = (p: TrailPin) => { setPins((x) => x.filter((y) => !(y.kind === p.kind && y.ref === p.ref))); setCheck(null); };

  const run = (t: Tool, value = q[t]) => go(async () => {
    const v = value.trim();
    if (!v) return;
    if (t === "pay") setPay(await lookupPayment(v));
    if (t === "stmt") { setStmt(await lookupStatement(v, from, to)); setSel(new Set()); setCalcRow(null); }
    if (t === "kyc") setKyc(await lookupKyc(v));
  });
  /** Put a value into a tool and open it. She still presses Look up. */
  const fill = (t: Tool, v: string) => { setQ((x) => ({ ...x, [t]: v })); setTool(t); };

  const utrs = useMemo(() => new Set(complaints.map((c) => c.utr)), [complaints]);
  const rowPin = (r: StatementRow, acct: string, name: string): { pin: TrailPin; reach?: [string, string] } | null => {
    if (r.dir === "in") return utrs.has(r.id) ? { pin: { kind: "payment", ref: r.id, label: `${r.id} · ${inr(r.amount)} from ${r.otherName} to ${name}` }, reach: [acct, name] } : null;
    if (r.ours) return { pin: { kind: "move", ref: r.id, label: `${r.id} · ${inr(r.amount)} ${name} → ${r.otherName}` }, reach: [r.other, r.otherName] };
    return { pin: { kind: "gone", ref: r.id, label: `${r.id} · ${inr(r.amount)} from ${name}: ${r.where ?? r.otherName}` } };
  };
  const pinSelected = () => {
    if (!stmt?.found) return;
    const out: TrailPin[] = [], reach: Record<string, string> = {};
    for (const r of stmt.rows) {
      if (!sel.has(r.id)) continue;
      const x = rowPin(r, stmt.id, stmt.name);
      if (!x) continue;
      out.push(x.pin);
      if (x.reach) reach[x.reach[0]] = x.reach[1];
    }
    add(out, reach);
    setSel(new Set());
  };
  const tickAfter = (id: string) => {
    if (!stmt?.found) return;
    const i = stmt.rows.findIndex((r) => r.id === id);
    setSel(new Set(stmt.rows.slice(i + 1).filter((r) => r.dir === "out").map((r) => r.id)));
  };

  const grouped = useMemo(() => {
    const m = new Map<TrailKind, TrailPin[]>();
    for (const p of pins) m.set(p.kind, [...(m.get(p.kind) ?? []), p]);
    return [...m.entries()];
  }, [pins]);
  const holdPaise = (): TrailHolds => Object.fromEntries(Object.entries(holds).map(([k, v]) => [k, rupees(v)]).filter(([k, v]) => v !== null && accts[k as string]) as [string, number][]);
  const holdTotal = Object.values(holdPaise()).reduce((s, x) => s + x, 0);

  const doCheck = () => go(async () => { const r = await checkTrailAction(caseId, pins, holdPaise()); setCheck(r); });
  const doSave = () => go(async () => {
    const r = await saveTrailAction(caseId, pins, holdPaise(), note);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setNote(""); setCheck(await checkTrailAction(caseId, pins, holdPaise())); router.refresh(); }
  });

  const calc = stmt?.found ? stmt.rows.find((r) => r.id === calcRow) : undefined;
  const calcMoney = rupees(calcIn);
  const before = calc ? calc.balance + (calc.dir === "out" ? calc.amount : -calc.amount) : 0;
  const shareOf = calc && calcMoney !== null && before > 0 ? Math.round(calc.amount * Math.min(1, calcMoney / before)) : null;
  const cur = TOOLS.find(([t]) => t === tool)!;
  const pinned = new Set(pins.map((p) => p.ref));

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <section className="card p-4" data-testid="complaints">
          <h2>Victims&apos; complaints</h2>
          <p className="mt-1 text-[13.5px] muted">Start from a payment. Each complaint carries the UTR of the money the victim sent.</p>
          <ul className="mt-3 divide-y divide-[var(--line)] text-[13.5px]">
            {complaints.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid="complaint">
                <span className="min-w-[140px] font-medium">{c.victim}</span>
                <span className="money">{inr(c.amount)}</span>
                <button type="button" className="link mono" onClick={() => { fill("pay", c.utr); run("pay", c.utr); }} data-testid="utr">{c.utr}</button>
                <span className="ml-auto text-[12.5px] muted">reported {when(c.reportedAt)}</span>
                {has("payment", c.utr) && <span className="chip chip-good">On your trail</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4" data-testid="tools">
          <div className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-2" role="tablist">
            {TOOLS.map(([t, label]) => <button key={t} type="button" role="tab" aria-selected={tool === t} onClick={() => setTool(t)} className={`btn btn-sm ${tool === t ? "btn-primary" : "btn-ghost"}`} data-testid={`tool-${t}`}>{label}</button>)}
          </div>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(tool); }}>
            <label className="min-w-[200px] flex-1"><span className="label">{cur[2]}</span>
              <input className="input mono mt-1" value={q[tool]} onChange={(e) => setQ((x) => ({ ...x, [tool]: e.target.value }))} data-testid="tool-input" />
            </label>
            {tool === "stmt" && <>
              <label><span className="label">From</span><input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="st-from" /></label>
              <label><span className="label">To</span><input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} data-testid="st-to" /></label>
            </>}
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="tool-run"><Search size={14} aria-hidden /> {pending ? "Looking up…" : "Look up"}</button>
          </form>

          <div className="mt-4 text-[14px]" data-testid={`result-${tool}`}>
            {tool === "pay" && pay && (!pay.found ? <p className="muted">{pay.note}</p> : (
              <div>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
                  <div><dt className="label">UTR</dt><dd className="mono">{pay.id}</dd></div>
                  <div><dt className="label">Amount</dt><dd className="money">{inr(pay.amount)}</dd></div>
                  <div><dt className="label">Time</dt><dd>{when(pay.at, true)} · {pay.channel}</dd></div>
                  <div><dt className="label">Paid by</dt><dd>{pay.from}</dd></div>
                  <div><dt className="label">Received by</dt><dd>{pay.toName} <button type="button" className="link mono" onClick={() => fill("stmt", pay.to)}>{pay.to}</button></dd></div>
                  <div><dt className="label">Complaint</dt><dd className="text-[13px]">{pay.note}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pay.complaint && <PinBtn testid="pin-payment" on={has("payment", pay.id)} label="Pin as hop 1" onClick={() => add([{ kind: "payment", ref: pay.id, label: `${pay.id} · ${inr(pay.amount)} from ${pay.from} to ${pay.toName}` }], { [pay.to]: pay.toName })} />}
                  <button type="button" className="btn btn-sm" onClick={() => { fill("stmt", pay.to); setFrom(dayOf(pay.at)); }} data-testid="open-statement">Open {pay.toName}&apos;s statement <ArrowRight size={13} aria-hidden /></button>
                </div>
              </div>
            ))}

            {tool === "stmt" && stmt && (!stmt.found ? <p className="muted">{stmt.note}</p> : (
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p><b>{stmt.name}</b> <span className="mono muted">{stmt.id}</span> · {stmt.total} rows{stmt.total > stmt.rows.length ? `, first ${stmt.rows.length} listed (narrow the dates)` : ""}</p>
                  <p className="text-[13px] muted">Opening <span className="money">{inr(stmt.opening)}</span> · closing <span className="money">{inr(stmt.closing)}</span></p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={sel.size === 0} onClick={pinSelected} data-testid="pin-selected"><Pin size={13} aria-hidden /> Pin selected ({sel.size})</button>
                  {sel.size > 0 && <button type="button" className="link text-[13px]" onClick={() => setSel(new Set())}>Clear selection</button>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fill("kyc", stmt.id)} data-testid="open-kyc">KYC card</button>
                  <span className="text-[12.5px] muted">A payment out to one of our accounts adds it to your trail. Other payments out are pinned as gone.</span>
                </div>
                <div className="mt-2 max-h-[460px] overflow-auto">
                  <table className="table w-full min-w-[720px] text-[13px]" data-testid="statement">
                    <thead><tr><th /><th>Time (IST)</th><th>Narration</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th><th /></tr></thead>
                    <tbody>
                      {stmt.rows.map((r) => {
                        const canPin = r.dir === "out" || utrs.has(r.id);
                        return (
                          <tr key={r.id} data-testid="st-row" data-id={r.id} data-dir={r.dir} className={calcRow === r.id ? "bg-[var(--accent-tint,rgba(0,0,0,0.04))]" : ""}>
                            <td>{canPin && <input type="checkbox" aria-label={`Select ${r.id}`} checked={sel.has(r.id) || pinned.has(r.id)} disabled={pinned.has(r.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />}</td>
                            <td className="whitespace-nowrap">{when(r.at)}</td>
                            <td className="max-w-[260px]">
                              <span className="mono block truncate text-[12px]">{r.narration}</span>
                              <span className="block text-[12px] muted">{r.ours ? <button type="button" className="link" onClick={() => fill("stmt", r.other)}>{r.otherName} ({r.other})</button> : r.otherName}{r.exit ? " · cash-out" : ""}</span>
                            </td>
                            <td className="money text-right">{r.dir === "out" ? inr(r.amount) : ""}</td>
                            <td className="money text-right">{r.dir === "in" ? inr(r.amount) : ""}</td>
                            <td className="money text-right">{inr(r.balance)}</td>
                            <td className="whitespace-nowrap text-right">
                              {r.dir === "in" && <button type="button" className="link text-[12px]" onClick={() => tickAfter(r.id)} title="Select every payment out after this credit" data-testid="tick-after">Select outs after</button>}
                              {r.dir === "out" && <button type="button" className="text-[var(--muted)] hover:text-[var(--fg)]" aria-label={`Share of ${r.id}`} onClick={() => setCalcRow(r.id)} data-testid="calc-row"><Calculator size={14} /></button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {tool === "kyc" && kyc && (!kyc.found ? <p className="muted">{kyc.note}</p> : (
              <div data-testid="kyc-card">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
                  <div><dt className="label">Holder</dt><dd className="font-medium">{kyc.name}</dd></div>
                  <div><dt className="label">Account</dt><dd>{TYPE[kyc.type] ?? kyc.type} · <span className="mono">{kyc.id}</span></dd></div>
                  <div><dt className="label">Opened</dt><dd>{day(kyc.openedAt)}</dd></div>
                  <div><dt className="label">Customer group</dt><dd>{kyc.group}</dd></div>
                  <div><dt className="label">City</dt><dd>{kyc.city}</dd></div>
                  <div><dt className="label">Phone on file</dt><dd className="mono">{kyc.phone ?? "—"}{kyc.kycChangedAt && <span className="block font-sans text-[12.5px] text-[var(--warn)]">changed {when(kyc.kycChangedAt, true)}</span>}</dd></div>
                </dl>
                {kyc.before && <p className="mt-3 text-[13.5px]"><span className="label">Before the scam</span><span className="block">{kyc.before.text}{kyc.before.monthly ? ` (about ${inr(kyc.before.monthly)} a month)` : ""}</span></p>}
                <p className="mt-3 border-l-2 border-[#0d0d0d] pl-3 text-[13.5px]"><span className="label">Police request {kyc.request.id}</span>
                  <span className="block">{kyc.request.issuer}. Asks for {typeof kyc.request.asked === "number" ? inr(kyc.request.asked) : kyc.request.asked}. {kyc.request.signed ? "Signed" : "Not signed"}, received {when(kyc.request.receivedAt, true)}. Magistrate told: {kyc.request.magistrate ? when(kyc.request.magistrate, true) : "not yet"}.</span>
                </p>
                <div className="mt-3"><PinBtn testid="pin-kyc" on={has("kyc", kyc.id)} label="Pin this account check" onClick={() => add([{ kind: "kyc", ref: kyc.id, label: `${kyc.name} (${kyc.id})` }])} /></div>
              </div>
            ))}
            {!(tool === "pay" ? pay : tool === "stmt" ? stmt : kyc) && <p className="muted">Nothing looked up yet.</p>}
          </div>
        </section>

        <section className="card p-4" data-testid="calculator">
          <h2 className="flex items-center gap-2"><Calculator size={17} aria-hidden /> Share calculator</h2>
          <p className="mt-1 text-[13.5px] muted">Rule: pro-rata, the same rule as Scalpel&apos;s rules engine. Each payment out carries victims&apos; money in proportion to the balance just before it. Pick a payment with the calculator icon on a statement row.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr] sm:items-end">
            <label><span className="label">Victims&apos; money in the account before this payment (₹)</span><input className="input mt-1 mono" inputMode="decimal" value={calcIn} onChange={(e) => setCalcIn(e.target.value)} placeholder="Your working, e.g. 328590" data-testid="calc-in" /></label>
            <div className="text-[13.5px]">{calc ? <>Payment <span className="mono">{calc.id}</span>: <span className="money">{inr(calc.amount)}</span> out of a balance of <span className="money">{inr(before)}</span></> : <span className="muted">No payment picked.</span>}</div>
          </div>
          {calc && shareOf !== null && (
            <p className="mt-3 rounded-xl bg-[var(--phone-tint,rgba(0,0,0,0.04))] p-3 text-[14px]" data-testid="calc-out">
              {inr(calc.amount)} × {inr(calcMoney!)} ÷ {inr(before)} = <b className="money">{inr(shareOf)}</b> of victims&apos; money left with this payment. Left in the account after it: <span className="money">{inr(Math.max(0, calcMoney! - shareOf))}</span>.
            </p>
          )}
          <p className="mt-2 text-[12.5px] muted">The calculator only does the sum you give it. It does not know which money is the victims&apos;.</p>
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="card p-4" data-testid="pin-board">
          <div className="flex items-baseline justify-between gap-2">
            <h2>Your trail</h2>
            {pins.length > 0 && canSave && <button type="button" className="link text-[13px]" onClick={() => { setPins([]); setHolds({}); setCheck(null); }}>Clear</button>}
          </div>
          <p className="mt-1 text-[13px] muted">Built only from what you pin. {pins.length} pinned, {Object.keys(accts).length} account{Object.keys(accts).length === 1 ? "" : "s"} reached.{saved && ` Saved version ${saved.version} by ${saved.by}.`}</p>
          {pins.length === 0 ? <p className="mt-4 text-[14px] muted" data-testid="pins-empty">Nothing pinned yet. Click a UTR above to start.</p> : (
            <ol className="mt-3 space-y-3 text-[13.5px]">
              {grouped.map(([kind, list]) => (
                <li key={kind} className="border-l-2 border-[#0d0d0d] pl-3" data-testid="trail-step">
                  <p className="label">{TRAIL_TITLE[kind]} ({list.length})</p>
                  <ul className="mt-1 space-y-1">
                    {list.slice(-8).map((p) => (
                      <li key={p.ref} className="flex items-center justify-between gap-2"><span className="truncate">{p.label}</span>
                        <button type="button" aria-label="Unpin" className="text-[var(--muted)] hover:text-[#0d0d0d]" onClick={() => drop(p)}><X size={13} /></button>
                      </li>
                    ))}
                    {list.length > 8 && <li className="muted">and {list.length - 8} earlier</li>}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-4" data-testid="holds-panel">
          <h2>Your hold amounts</h2>
          <p className="mt-1 text-[13px] muted">For each account on your trail, the amount you would hold (₹). Leave empty if you would not hold.</p>
          {Object.keys(accts).length === 0 ? <p className="mt-3 text-[13.5px] muted">No accounts on your trail yet.</p> : (
            <ul className="mt-3 space-y-2">
              {Object.entries(accts).map(([id, name]) => (
                <li key={id} className="flex items-center gap-2 text-[13.5px]">
                  <button type="button" className="link min-w-0 flex-1 truncate text-left" onClick={() => fill("stmt", id)}>{name} <span className="mono muted">{id}</span></button>
                  <input className="input mono !w-32 shrink-0" inputMode="decimal" aria-label={`Hold on ${name}`} value={holds[id] ?? ""} onChange={(e) => { setHolds((h) => ({ ...h, [id]: e.target.value })); setCheck(null); }} placeholder="₹" data-testid={`hold-${id}`} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[13px]">Your holds add up to <b className="money">{inr(holdTotal)}</b>.</p>
        </section>

        <section className="card p-4" data-testid="check-panel">
          <h2>Check my trail</h2>
          <p className="mt-1 text-[13px] muted">The server looks up every pin again against the bank&apos;s records and the rules engine. It tells you what your trail shows and what it misses. It never says hold or don&apos;t hold.</p>
          <button type="button" className="btn btn-ghost mt-3" onClick={doCheck} disabled={pins.length === 0 || pending} data-testid="ai-check"><ShieldCheck size={14} aria-hidden /> Check my trail</button>
          {check && <CheckResult c={check} pins={pins.length} />}
        </section>

        {canSave ? (
          <section className="card p-4" data-testid="save-panel">
            <h2>Save to the record</h2>
            <p className="mt-1 text-[13px] muted">Saving writes your pins and holds to the tamper-proof record. A decision on any account your trail reaches will point to this version.</p>
            <input className="input mt-3" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="btn btn-primary mt-3" onClick={doSave} disabled={pins.length === 0 || pending} data-testid="save-trail"><Save size={14} aria-hidden /> Save trail</button>
            {msg && <p role="status" className={`mt-2 text-[13px] ${msg.ok ? "text-[var(--good)]" : "text-[var(--bad)]"}`} data-testid="save-result">{msg.text}</p>}
            <a href={`/case/${caseId}`} className="link mt-3 block text-[13.5px]">Back to {caseId} to decide</a>
          </section>
        ) : <p className="text-[13px] muted">Only the fraud officer saves a trail. You can look things up.</p>}
      </aside>
    </div>
  );
}

function CheckResult({ c, pins }: { c: TrailCheck; pins: number }) {
  const b = c.balance;
  const parts = [["In accounts on your trail", b.inAccounts, "var(--accent)"], ["Gone (your cash-outs)", b.gone, "#0d0d0d"], ["Small pieces under ₹1,000", b.small, "var(--muted)"], ["Not yet found", b.notFound, "var(--bad)"]] as const;
  const VERDICT = { none: "No hold written", above: "Above the victims' money here: not allowed", below: "Well below the victims' money here: some of it would stay unheld", matches: "Matches the victims' money here" } as const;
  return (
    <div className="mt-4 space-y-4 border-t border-[var(--line)] pt-3 text-[13.5px]" data-testid="ai-result">
      <div data-testid="money-balance">
        <p className="label">Money balance</p>
        <p className="mt-1">Reported lost <b className="money">{inr(b.reported)}</b></p>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[var(--line)]" aria-hidden>
          {parts.map(([k, v, col]) => <span key={k} style={{ width: `${b.reported ? (v / b.reported) * 100 : 0}%`, background: col }} />)}
        </div>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {parts.map(([k, v, col]) => <li key={k} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: col }} />{k}<span className="money ml-auto">{inrShort(v)}</span></li>)}
        </ul>
        {b.notFound === 0 ? <p className="mt-2 chip chip-good" data-testid="all-found">Every rupee accounted for</p> : <p className="mt-2 text-[13px] text-[var(--bad)]" data-testid="not-found">{inrShort(b.notFound)} not yet on your trail.</p>}
      </div>
      {c.unpaid.count > 0 && <p className="text-[var(--warn)]" data-testid="ai-unpaid">{c.unpaid.count} victim payment{c.unpaid.count === 1 ? "" : "s"} ({inr(c.unpaid.amount)}) not pinned yet.</p>}
      {c.missing.length > 0 && <div><p className="label">Money that left an account on your trail and is not on it</p>
        <ul className="mt-1 list-disc pl-5" data-testid="ai-missing">{c.missing.slice(0, 8).map((m) => <li key={m.account}>{inr(m.amount)} left {m.name} <span className="mono muted">{m.account}</span></li>)}{c.missing.length > 8 && <li className="muted">and {c.missing.length - 8} more accounts</li>}</ul></div>}
      {c.offCase.length > 0 && <div><p className="label">Pinned, but carries no victims&apos; money from this case</p><ul className="mt-1 list-disc pl-5 text-[var(--warn)]" data-testid="ai-offcase">{c.offCase.map((s) => <li key={s}>{s}</li>)}</ul></div>}
      {c.loose.length > 0 && <div><p className="label">Cash-outs from accounts your trail doesn&apos;t reach yet</p><ul className="mt-1 list-disc pl-5 text-[var(--warn)]" data-testid="ai-loose">{c.loose.map((s) => <li key={s}>{s}</li>)}</ul></div>}
      {c.holds.length > 0 && <div><p className="label">Your holds</p>
        <ul className="mt-1 space-y-1" data-testid="ai-holds">{c.holds.map((h) => <li key={h.account} data-verdict={h.verdict}><span className={`chip mr-1.5 ${h.verdict === "matches" ? "chip-good" : h.verdict === "none" ? "chip-grey" : "chip-warn"}`}>{h.mine === null ? "—" : inr(h.mine)}</span>{h.name}: {VERDICT[h.verdict]}</li>)}</ul></div>}
      {c.shows.length > 0 && <details><summary className="label cursor-pointer">What your pins show ({c.shows.length})</summary><ul className="mt-1 list-disc pl-5">{c.shows.slice(0, 30).map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
      <p className="text-[12.5px] muted">You pinned {pins} {pins === 1 ? "payment" : "payments"}. The AI checked {pins === 1 ? "it" : "each one"} against the bank&apos;s records. Follow the money further to find the rest. Whether to freeze is your decision.</p>
    </div>
  );
}
