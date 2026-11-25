"use client";
/**
 * Imran's SIM trace workbench. No one-click answer: he types a number or handset ID into Telco-A's lookup
 * tools, reads the raw results, and pins what matters. The trace on the right is built only from his pins,
 * and the AI check only reads his pins: it says what they support and what is still missing.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { Pin, X, Search } from "lucide-react";
import { lookupSubscriber, lookupCalls, lookupHandset } from "@/app/actions";
import type { SubscriberResult, CallRow, HandsetResult } from "@/lib/server/lookup";

type PinT =
  | { kind: "number"; key: string; msisdn: string; kyc: string | null; activatedAt: number | null }
  | { kind: "handset"; key: string; imei: string }
  | { kind: "sim"; key: string; msisdn: string; imei: string; calls: number }
  | { kind: "call"; key: string; row: CallRow }
  | { kind: "tower"; key: string; cell: string; imei: string };

type Tool = "sub" | "cdr" | "imei";
const fmt = (t: number) => new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const dayStr = (t: number) => new Date(t).toISOString().slice(0, 10);
const norm = (s: string) => s.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
const STORE = "scalpel-simbench-v1";

function PinBtn({ on, onClick, label = "Pin" }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={on} className="btn btn-ghost btn-sm shrink-0" data-testid="pin">
      <Pin size={13} aria-hidden /> {on ? "Pinned" : label}
    </button>
  );
}

export function SimWorkbench({ leads, start, firstDay, lastDay }: { leads: { label: string; value: string; tool: Tool }[]; start: string | null; firstDay: number; lastDay: number }) {
  const [tool, setTool] = useState<Tool>("sub");
  const [q, setQ] = useState({ sub: start ?? "", cdr: start ?? "", imei: "" });
  const [from, setFrom] = useState(dayStr(firstDay));
  const [to, setTo] = useState(dayStr(lastDay));
  const [dir, setDir] = useState<"all" | "out" | "in">("all");
  const [sub, setSub] = useState<SubscriberResult | null>(null);
  const [cdr, setCdr] = useState<{ rows: CallRow[]; total: number } | null>(null);
  const [hs, setHs] = useState<HandsetResult | null>(null);
  const [pins, setPins] = useState<PinT[]>([]);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [check, setCheck] = useState<null | { fits: string; support: string[]; missing: string[]; clash: string[] }>(null);
  const [pending, go] = useTransition();

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(STORE) ?? "null"); if (s) { setPins(s.pins ?? []); setTicks(s.ticks ?? {}); } } catch { /* storage blocked */ } }, []);
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify({ pins, ticks })); } catch { /* storage blocked */ } }, [pins, ticks]);

  const has = (key: string) => pins.some((p) => p.key === key);
  const add = (p: PinT) => { if (!has(p.key)) { setPins((x) => [...x, p]); setCheck(null); } };
  const drop = (key: string) => { setPins((x) => x.filter((p) => p.key !== key)); setCheck(null); };

  const run = (t: Tool) => go(async () => {
    if (t === "sub") setSub(await lookupSubscriber(q.sub));
    if (t === "cdr") setCdr(await lookupCalls(q.cdr, new Date(from).getTime(), new Date(to).getTime() + 86_399_999));
    if (t === "imei") setHs(await lookupHandset(q.imei));
  });
  const fill = (t: Tool, v: string) => { setQ((x) => ({ ...x, [t]: v })); setTool(t); };

  // The trace, built only from pins.
  const trace = useMemo(() => {
    const handsets = pins.filter((p) => p.kind === "handset").map((p) => (p as Extract<PinT, { kind: "handset" }>).imei);
    const sims = pins.filter((p) => p.kind === "sim") as Extract<PinT, { kind: "sim" }>[];
    const calls = pins.filter((p) => p.kind === "call") as Extract<PinT, { kind: "call" }>[];
    const towers = pins.filter((p) => p.kind === "tower") as Extract<PinT, { kind: "tower" }>[];
    const numbers = pins.filter((p) => p.kind === "number") as Extract<PinT, { kind: "number" }>[];
    const people = [...new Map(calls.filter((c) => c.row.dir === "out").map((c) => [norm(c.row.other), c.row])).values()];
    return { handsets, sims, calls, towers, numbers, people };
  }, [pins]);

  const SIGNALS = [
    ["many", "Many SIMs used in one handset"],
    ["noin", "Almost no incoming calls"],
    ["tower", "Never moves from one tower"],
    ["spoof", "Victims saw a different number (spoofed)"],
  ] as const;

  function aiCheck() {
    const support: string[] = [], missing: string[] = [], clash: string[] = [];
    const { handsets, sims, calls, towers } = trace;
    const out = calls.filter((c) => c.row.dir === "out").length, inn = calls.length - out;
    const realSpoofs = calls.filter((c) => c.row.dir === "out" && norm(c.row.shownAs) !== norm(c.row.sim)).length;
    const towerSet = new Set(towers.map((t) => t.cell));
    const ev = {
      many: sims.length >= 5, noin: calls.length >= 5 && inn / calls.length < 0.15, tower: towerSet.size === 1 && towers.length > 0, spoof: realSpoofs > 0,
    };
    if (!handsets.length) missing.push("No handset pinned: look up the IMEI from the call records.");
    if (sims.length < 5) missing.push(`Only ${sims.length} SIM${sims.length === 1 ? "" : "s"} pinned: a SIM box claim needs the handset's SIM list.`);
    if (calls.length < 5) missing.push(`Only ${calls.length} call${calls.length === 1 ? "" : "s"} pinned: pin enough rows to show the in/out pattern.`);
    if (!towers.length) missing.push("No tower pinned: the handset lookup lists the towers it used.");
    if (ev.many) support.push(`${sims.length} SIMs pinned on ${handsets.length || "one"} handset.`);
    if (calls.length) support.push(`${out} outgoing, ${inn} incoming in your pinned calls.`);
    if (towers.length) support.push(`${towerSet.size} tower${towerSet.size > 1 ? "s" : ""} in your pins.`);
    if (ev.spoof) support.push(`${realSpoofs} pinned call${realSpoofs > 1 ? "s" : ""} showed a different caller number to the victim.`);
    for (const [k, label] of SIGNALS) {
      if (ticks[k] && !ev[k]) clash.push(`You ticked "${label}", but your pins don't show it yet.`);
      if (!ticks[k] && ev[k]) clash.push(`Your pins show "${label}", but you haven't ticked it.`);
    }
    const score = Number(ev.many) + Number(ev.noin) + Number(ev.tower);
    const fits = score >= 3 ? "Your evidence fits a SIM box. Decide the action yourself on the alert page." : score === 2 ? "Partly fits a SIM box. Fill the missing pieces before deciding." : "Not enough evidence yet to say what this is.";
    setCheck({ fits, support, missing, clash });
  }

  const TOOLS: [Tool, string][] = [["sub", "Subscriber lookup"], ["cdr", "Call records"], ["imei", "Handset (IMEI) lookup"]];

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <section className="card p-4">
          <h2>Leads</h2>
          <p className="mt-1 text-[13.5px] muted">Where to start. Pick one, or type any number into a tool.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {leads.map((l) => (
              <button key={l.label + l.value} type="button" className="chip chip-phone" onClick={() => fill(l.tool, l.value)} data-testid="lead">{l.label}</button>
            ))}
          </div>
        </section>

        <section className="card p-4" data-testid="tools">
          <div className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-2" role="tablist">
            {TOOLS.map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tool === t} onClick={() => setTool(t)} className={`btn btn-sm ${tool === t ? "btn-primary" : "btn-ghost"}`} data-testid={`tool-${t}`}>{label}</button>
            ))}
          </div>

          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(tool); }}>
            <label className="min-w-[220px] flex-1">
              <span className="label">{tool === "imei" ? "Handset IMEI (15 digits)" : "Phone number"}</span>
              <input className="input mono mt-1" value={q[tool]} onChange={(e) => setQ((x) => ({ ...x, [tool]: e.target.value }))} placeholder={tool === "imei" ? "e.g. 0023 1309 6600 250" : "+91 …"} data-testid="tool-input" />
            </label>
            {tool === "cdr" && (
              <>
                <label><span className="label">From</span><input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label><span className="label">To</span><input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                <label><span className="label">Calls</span>
                  <select className="input mt-1" value={dir} onChange={(e) => setDir(e.target.value as typeof dir)}><option value="all">In and out</option><option value="out">Outgoing</option><option value="in">Incoming</option></select>
                </label>
              </>
            )}
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="tool-run"><Search size={14} aria-hidden /> {pending ? "Looking up…" : "Look up"}</button>
          </form>

          <div className="mt-4" data-testid={`result-${tool}`}>
            {tool === "sub" && sub && (
              <div>
                <p className={`text-[14px] ${sub.found ? "" : "muted"}`}>{sub.note}</p>
                {sub.found && (
                  <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-[14px]">
                    <div><dt className="label">Number</dt><dd className="mono">{sub.msisdn}</dd></div>
                    <div><dt className="label">KYC name on the SIM</dt><dd>{sub.kycName ?? "Not on file"}</dd></div>
                    <div><dt className="label">SIM card ID (ICCID)</dt><dd className="mono">{sub.iccid}</dd></div>
                    <div><dt className="label">IMSI</dt><dd className="mono">{sub.imsi}</dd></div>
                    <div><dt className="label">Activated</dt><dd>{sub.activatedAt ? fmt(sub.activatedAt) : "—"}</dd></div>
                    <div><dt className="label">Last seen in handset</dt><dd className="mono">{sub.lastImei ?? "—"} {sub.lastImei && <button type="button" className="link text-[12.5px]" onClick={() => fill("imei", sub.lastImei!)}>look up</button>}</dd></div>
                    <div><dt className="label">SIM swapped</dt><dd>{sub.swappedAt ? fmt(sub.swappedAt) : "No"}</dd></div>
                    <div><dt className="label">Call forwarding</dt><dd>{sub.forwarding ? "On" : "Off"}</dd></div>
                  </dl>
                )}
                {sub.found && <div className="mt-3"><PinBtn on={has(norm(sub.msisdn))} label="Pin this number" onClick={() => add({ kind: "number", key: norm(sub.msisdn), msisdn: sub.msisdn, kyc: sub.kycName ?? null, activatedAt: sub.activatedAt ?? null })} /></div>}
              </div>
            )}

            {tool === "cdr" && cdr && (
              <div>
                <p className="text-[13.5px] muted">{cdr.total ? `${cdr.total} call records in this window.` : "No call records for this number in this window."} Pin the rows that matter.</p>
                {cdr.rows.length > 0 && (
                  <div className="mt-2 max-h-[420px] overflow-auto">
                    <table className="table w-full text-[13px]">
                      <thead><tr><th>Time</th><th>Dir</th><th>Other party</th><th>Shown to them as</th><th>Secs</th><th>Handset</th><th>Tower</th><th /></tr></thead>
                      <tbody>
                        {cdr.rows.filter((r) => dir === "all" || r.dir === dir).map((r) => (
                          <tr key={r.id} data-testid="cdr-row">
                            <td className="whitespace-nowrap">{fmt(r.at)}</td>
                            <td>{r.dir === "out" ? "Out" : "In"}</td>
                            <td><span className="mono">{r.other}</span>{r.otherNote && <span className="block text-[12px] muted">{r.otherNote}</span>}</td>
                            <td className="mono">{r.dir === "out" ? r.shownAs : "—"}</td>
                            <td>{r.seconds}</td>
                            <td><button type="button" className="link mono" onClick={() => fill("imei", r.imei)} title="Look up this handset">{r.imei}</button></td>
                            <td className="mono">{r.cell}</td>
                            <td><PinBtn on={has(r.id)} onClick={() => add({ kind: "call", key: r.id, row: r })} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tool === "imei" && hs && (
              <div>
                <p className={`text-[14px] ${hs.found ? "" : "muted"}`}>{hs.note}</p>
                {hs.found && (
                  <>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <PinBtn on={has(`h:${hs.imei}`)} label="Pin this handset" onClick={() => add({ kind: "handset", key: `h:${hs.imei}`, imei: hs.imei })} />
                      {hs.cells.map((c) => <PinBtn key={c} on={has(`t:${c}`)} label={`Pin tower ${c}`} onClick={() => add({ kind: "tower", key: `t:${c}`, cell: c, imei: hs.imei })} />)}
                    </div>
                    <div className="mt-3 max-h-[380px] overflow-auto">
                      <table className="table w-full text-[13px]">
                        <thead><tr><th>SIM number</th><th>Calls from this handset</th><th>First seen</th><th>Last seen</th><th /></tr></thead>
                        <tbody>
                          {hs.sims.map((s) => (
                            <tr key={s.msisdn} data-testid="imei-sim">
                              <td><button type="button" className="link mono" onClick={() => fill("sub", s.msisdn)} title="Look up this SIM">{s.msisdn}</button></td>
                              <td>{s.calls}</td><td>{fmt(s.firstAt)}</td><td>{fmt(s.lastAt)}</td>
                              <td><PinBtn on={has(`s:${norm(s.msisdn)}`)} onClick={() => add({ kind: "sim", key: `s:${norm(s.msisdn)}`, msisdn: s.msisdn, imei: hs.imei, calls: s.calls })} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
            {((tool === "sub" && !sub) || (tool === "cdr" && !cdr) || (tool === "imei" && !hs)) && <p className="text-[13.5px] muted">Nothing looked up yet.</p>}
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="card p-4" data-testid="pin-board">
          <div className="flex items-baseline justify-between gap-2">
            <h2>Your trace</h2>
            {pins.length > 0 && <button type="button" className="link text-[13px]" onClick={() => { setPins([]); setTicks({}); setCheck(null); }}>Clear</button>}
          </div>
          <p className="mt-1 text-[13px] muted">Built only from what you pin. {pins.length} pinned.</p>
          {pins.length === 0 ? <p className="mt-4 text-[14px] muted" data-testid="pins-empty">Nothing pinned yet. Look something up and pin what matters.</p> : (
            <ol className="mt-3 space-y-3 text-[13.5px]">
              {[
                ["Number", trace.numbers.map((p) => [p.key, `${p.msisdn}${p.kyc ? ` · KYC ${p.kyc}` : ""}`])],
                ["Handset", trace.handsets.map((h) => [`h:${h}`, h])],
                ["SIMs in it", trace.sims.map((s) => [s.key, `${s.msisdn} · ${s.calls} calls`])],
                ["Towers", trace.towers.map((t) => [t.key, t.cell])],
                ["People called", trace.people.map((r) => [r.id, `${r.other}${r.otherNote ? ` · ${r.otherNote}` : ""}`])],
                ["Calls pinned", trace.calls.map((c) => [c.key, `${fmt(c.row.at)} · ${c.row.dir} · ${c.row.seconds}s`])],
              ].filter(([, items]) => (items as unknown[]).length).map(([title, items]) => (
                <li key={title as string} className="border-l-2 border-[#0d0d0d] pl-3" data-testid="trace-step">
                  <p className="label">{title as string}</p>
                  <ul className="mt-1 space-y-1">
                    {(items as [string, string][]).slice(0, 12).map(([k, text]) => (
                      <li key={k} className="flex items-center justify-between gap-2"><span className="mono truncate">{text}</span>
                        {title !== "People called" && <button type="button" aria-label="Unpin" className="text-[var(--muted)] hover:text-[#0d0d0d]" onClick={() => drop(k)}><X size={13} /></button>}
                      </li>
                    ))}
                    {(items as unknown[]).length > 12 && <li className="muted">+{(items as unknown[]).length - 12} more</li>}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-4" data-testid="signals-sheet">
          <h2>Signals you see</h2>
          <p className="mt-1 text-[13px] muted">Tick what your evidence shows. The AI will check your ticks against your pins.</p>
          <ul className="mt-3 space-y-2 text-[14px]">
            {SIGNALS.map(([k, label]) => (
              <li key={k}><label className="flex items-center gap-2"><input type="checkbox" checked={!!ticks[k]} onChange={(e) => { setTicks((t) => ({ ...t, [k]: e.target.checked })); setCheck(null); }} data-testid={`tick-${k}`} />{label}</label></li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary mt-4" onClick={aiCheck} disabled={pins.length === 0} data-testid="ai-check">Ask the AI to check my trace</button>
          {check && (
            <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-3 text-[13.5px]" data-testid="ai-result">
              <p className="font-semibold">{check.fits}</p>
              {check.support.length > 0 && <div><p className="label">Your pins show</p><ul className="mt-1 list-disc pl-5">{check.support.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {check.missing.length > 0 && <div><p className="label">Still missing</p><ul className="mt-1 list-disc pl-5" data-testid="ai-missing">{check.missing.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {check.clash.length > 0 && <div><p className="label">Check your ticks</p><ul className="mt-1 list-disc pl-5 text-[var(--warn,#9a6700)]">{check.clash.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              <p className="text-[12.5px] muted">The AI read only your {pins.length} pins. It does not look anything up for you.</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
