"use client";
/**
 * Imran's SIM trace workbench. No one-click answer: he types a number, handset, shop, tower, route or ID document
 * into Telco-A's lookup tools, reads the raw records, and pins what matters. The trace on the right is built only
 * from his pins. "Check my trace" asks the server's AI check, which reads only his pins: it says what they show,
 * what doesn't belong to this alert, and what evidence each action still needs. Saving writes the trace to the
 * shared record; the alert's decision opens only on a saved trace that supports it.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, X, Search, Save, ShieldCheck } from "lucide-react";
import {
  lookupSubscriber, lookupCalls, lookupHandset, lookupShop, lookupTower, lookupSwitch, lookupRoute, lookupDoc, lookupSisters, checkTraceAction, saveTraceAction,
} from "@/app/actions";
import type { SubscriberResult, CallRow, CallStats, HandsetResult, ShopResult, TowerResult, SwitchRow } from "@/lib/server/lookup";
import type { TraceCheck } from "@/lib/server/tracecheck";
import type { SisterResult } from "@/lib/server/telcogroup";
import { PIN_TITLE, type PinKind, type PinRef } from "@/lib/pins";

type Tool = "sub" | "cdr" | "imei" | "shop" | "tower" | "switch" | "route" | "doc" | "group";
const TOOLS: [Tool, string, string][] = [
  ["sub", "Subscriber", "Phone number"], ["cdr", "Call records", "Phone number or IMEI"], ["imei", "Handset", "IMEI (15 digits)"], ["shop", "Shop", "Point of sale ID, e.g. POS-BR-4471"],
  ["tower", "Tower", "Tower ID, e.g. TA-BR-0747"], ["switch", "Switch log", "Phone number that made the calls"], ["route", "Route", "Route, e.g. TA-GW-56"], ["doc", "KYC document", "ID document as shown on a SIM"],
  ["group", "Linked SIMs", "One SIM's number: finds SIMs on the same ID or from the same batch"],
];
const fmt = (t: number) => new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const dayOf = (t: number) => new Date(t + 19_800_000).toISOString().slice(0, 10);
const norm = (s: string) => s.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
const pct = (x: number) => `${Math.round(x * 100)}%`;

type Results = {
  sub?: SubscriberResult; cdr?: { by: string; key: string; rows: CallRow[]; total: number; stats: CallStats; from: number; to: number };
  imei?: HandsetResult; shop?: ShopResult; tower?: TowerResult; switch?: { found: boolean; note: string; rows: SwitchRow[] };
  route?: { found: boolean; note: string; id: string; lines: { owner: string; kind: string }[]; devices: string[] };
  doc?: { found: boolean; note: string; doc: string; sims: { msisdn: string; kycName: string; pos: string; at: number }[] };
  group?: SisterResult;
};


export interface SavedView { version: number; pins: PinRef[]; ticks: string[]; by: string; at: number }

function PinBtn({ on, onClick, label = "Pin", testid = "pin" }: { on: boolean; onClick: () => void; label?: string; testid?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={on} className="btn btn-ghost btn-sm shrink-0" data-testid={testid}>
      <Pin size={13} aria-hidden /> {on ? "Pinned" : label}
    </button>
  );
}
function Go({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="link mono" onClick={onClick}>{children}</button>;
}

export function SimWorkbench({ alert, leads, start, firstDay, lastDay, saved, locked = false }: {
  alert: { id: string; title: string; kind: "IMEI" | "MSISDN"; value: string } | null;
  leads: { label: string; value: string; tool: Tool }[]; start: string | null; firstDay: number; lastDay: number; saved: SavedView | null; locked?: boolean;
}) {
  const router = useRouter();
  const startTool: Tool = alert ? (alert.kind === "IMEI" ? "imei" : "sub") : "sub";
  const [tool, setTool] = useState<Tool>(startTool);
  const [q, setQ] = useState<Record<Tool, string>>({ sub: "", cdr: "", imei: "", shop: "", tower: "", switch: "", route: "", doc: "", group: "", [startTool]: alert?.value ?? start ?? "" });
  const [from, setFrom] = useState(dayOf(firstDay));
  const [to, setTo] = useState(dayOf(lastDay));
  const [dir, setDir] = useState<"all" | "out" | "in">("all");
  const [sw, setSw] = useState<"all" | "other" | "gateway">("all");
  const [res, setRes] = useState<Results>({});
  const [pins, setPins] = useState<PinRef[]>(saved?.pins ?? []);
  const [check, setCheck] = useState<TraceCheck | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, go] = useTransition();
  const key = `scalpel-simbench-v2:${alert?.id ?? "free"}`;

  // A draft per alert, kept in this browser between saves.
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(key) ?? "null"); if (s && (!saved || s.base === saved.version)) { setPins(s.pins ?? []); } } catch { /* storage blocked */ } }, [key, saved]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify({ pins, base: saved?.version ?? 0 })); } catch { /* storage blocked */ } }, [key, pins, saved]);

  const has = (kind: PinKind, ref: string) => pins.some((p) => p.kind === kind && p.ref === ref);
  const add = (p: PinRef) => { if (!has(p.kind, p.ref)) { setPins((x) => [...x, p]); setCheck(null); } };
  const drop = (p: PinRef) => { setPins((x) => x.filter((y) => !(y.kind === p.kind && y.ref === p.ref))); setCheck(null); };

  const run = (t: Tool, value = q[t]) => go(async () => {
    const v = value.trim();
    if (!v) return;
    if (t === "sub") { const r = await lookupSubscriber(v); setRes((x) => ({ ...x, sub: r })); }
    if (t === "cdr") { const r = await lookupCalls(v, from, to); setRes((x) => ({ ...x, cdr: r })); }
    if (t === "imei") { const r = await lookupHandset(v); setRes((x) => ({ ...x, imei: r })); }
    if (t === "shop") { const r = await lookupShop(v); setRes((x) => ({ ...x, shop: r })); }
    if (t === "tower") { const r = await lookupTower(v); setRes((x) => ({ ...x, tower: r })); }
    if (t === "switch") { const r = await lookupSwitch(v); setRes((x) => ({ ...x, switch: r })); }
    if (t === "route") { const r = await lookupRoute(v); setRes((x) => ({ ...x, route: r })); }
    if (t === "doc") { const r = await lookupDoc(v); setRes((x) => ({ ...x, doc: r })); }
    if (t === "group") { const r = await lookupSisters(v); setRes((x) => ({ ...x, group: r })); }
  });
  /** Put a value into a tool and open it. He still presses Look up. */
  const fill = (t: Tool, v: string) => { setQ((x) => ({ ...x, [t]: v })); setTool(t); };

  const grouped = useMemo(() => {
    const m = new Map<PinKind, PinRef[]>();
    for (const p of pins) m.set(p.kind, [...(m.get(p.kind) ?? []), p]);
    return [...m.entries()];
  }, [pins]);

  const doCheck = () => go(async () => { if (alert) setCheck(await checkTraceAction(alert.id, pins)); });
  const doSave = () => go(async () => {
    if (!alert) return;
    const seen = (await checkTraceAction(alert.id, pins)).signals.filter((x) => x.seen).map((x) => x.key);
    const r = await saveTraceAction(alert.id, pins, seen, note);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setNote(""); setCheck(await checkTraceAction(alert.id, pins)); router.refresh(); }
  });

  const cur = TOOLS.find(([t]) => t === tool)!;
  const r = res;
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        {!alert && (
          <section className="card p-4">
            <h2>Leads</h2>
            <p className="mt-1 text-[13.5px] muted">Where to start. Pick one, or type into any tool. To decide an alert, open the workbench from that alert.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {leads.map((l) => <button key={l.label + l.value} type="button" className="chip chip-phone" onClick={() => fill(l.tool, l.value)} data-testid="lead">{l.label}</button>)}
            </div>
          </section>
        )}

        <section className="card p-4" data-testid="tools">
          <div className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-2" role="tablist">
            {TOOLS.map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tool === t} onClick={() => setTool(t)} className={`btn btn-sm ${tool === t ? "btn-primary" : "btn-ghost"}`} data-testid={`tool-${t}`}>{label}</button>
            ))}
          </div>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(tool); }}>
            <label className="min-w-[220px] flex-1">
              <span className="label">{cur[2]}</span>
              <input className="input mono mt-1" value={q[tool]} onChange={(e) => setQ((x) => ({ ...x, [tool]: e.target.value }))} data-testid="tool-input" />
            </label>
            {tool === "cdr" && (
              <>
                <label><span className="label">From</span><input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="cdr-from" /></label>
                <label><span className="label">To</span><input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} data-testid="cdr-to" /></label>
                <label><span className="label">Show</span>
                  <select className="input mt-1" value={dir} onChange={(e) => setDir(e.target.value as typeof dir)}><option value="all">In and out</option><option value="out">Outgoing</option><option value="in">Incoming</option></select>
                </label>
              </>
            )}
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="tool-run"><Search size={14} aria-hidden /> {pending ? "Looking up…" : "Look up"}</button>
          </form>

          <div className="mt-4 text-[14px]" data-testid={`result-${tool}`}>
            {tool === "sub" && r.sub && (
              <div>
                <p className={r.sub.found ? "" : "muted"}>{r.sub.note}</p>
                {r.sub.found && (
                  <>
                    <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      <div><dt className="label">Number</dt><dd className="mono">{r.sub.msisdn}</dd></div>
                      <div><dt className="label">Plan</dt><dd>{r.sub.plan} · {r.sub.status}</dd></div>
                      <div><dt className="label">KYC name</dt><dd>{r.sub.kycName}{r.sub.endUser && <span className="block text-[12.5px] muted">{r.sub.endUser}</span>}</dd></div>
                      <div><dt className="label">ID document</dt><dd><Go onClick={() => fill("doc", r.sub!.kycDoc!)}>{r.sub.kycDoc}</Go></dd></div>
                      <div><dt className="label">Activated</dt><dd>{fmt(r.sub.activatedAt!)}</dd></div>
                      <div><dt className="label">Shop</dt><dd>{r.sub.shop ? <><Go onClick={() => fill("shop", r.sub!.shop!.pos)}>{r.sub.shop.pos}</Go> <span className="muted">{r.sub.shop.name}, {r.sub.shop.district}</span></> : "—"}</dd></div>
                      <div><dt className="label">SIM card ID</dt><dd className="mono">{r.sub.iccid}</dd></div>
                      <div><dt className="label">IMSI</dt><dd className="mono">{r.sub.imsi}</dd></div>
                      <div><dt className="label">Call forwarding</dt><dd>{r.sub.forwarding ? <span className="mono">to {r.sub.forwarding}</span> : "Off"}</dd></div>
                      <div><dt className="label">Citizen reports</dt><dd>{r.sub.chakshu ?? 0}</dd></div>
                      <div><dt className="label">Business sender</dt><dd>{r.sub.dlt ? `${r.sub.dlt.header} · ${r.sub.dlt.entity} (${r.sub.dlt.type})` : "Not registered"}</dd></div>
                      <div><dt className="label">SIM swaps</dt><dd>{r.sub.swaps!.length ? r.sub.swaps!.map((w) => `${fmt(w.at)} at ${w.shop}`).join("; ") : "None"}</dd></div>
                    </dl>
                    {r.sub.handsets!.length > 0 && <p className="mt-3"><span className="label">Handsets this SIM sat in</span>{r.sub.handsets!.map((h) => <span key={h.imei + h.from} className="mt-1 block"><Go onClick={() => fill("imei", h.imei)}>{h.imei}</Go> <span className="muted">{fmt(h.from)} → {h.to ? fmt(h.to) : "now"}</span></span>)}</p>}
                    {r.sub.recharges!.length > 0 && <p className="mt-3"><span className="label">Recharges</span>{r.sub.recharges!.slice(0, 4).map((x) => <span key={x.at} className="mt-1 block text-[13px]">{fmt(x.at)} · ₹{x.amount / 100} at {x.shop} · <span className="mono">{x.payRef}</span></span>)}</p>}
                    {r.sub.police && <p className="mt-3 border-l-2 border-[#0d0d0d] pl-3 text-[13.5px]"><span className="label">Police letter on file · {r.sub.police.ref}</span><span className="block">{r.sub.police.text}</span></p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <PinBtn on={has("number", r.sub.msisdn)} label="Pin the number" onClick={() => add({ kind: "number", ref: r.sub!.msisdn, label: `${r.sub!.msisdn} · ${r.sub!.kycName}` })} />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => fill("group", r.sub!.msisdn)} data-testid="find-linked">Find linked SIMs</button>
                      {r.sub.swaps!.length > 0 && <PinBtn on={has("swap", r.sub.msisdn)} label="Pin swap history" onClick={() => add({ kind: "swap", ref: r.sub!.msisdn, label: `${r.sub!.msisdn} swapped ${fmt(r.sub!.swaps!.at(-1)!.at)}` })} />}
                      {r.sub.forwarding && <PinBtn on={has("forwarding", r.sub.msisdn)} label="Pin call forwarding" onClick={() => add({ kind: "forwarding", ref: r.sub!.msisdn, label: `forwards to ${r.sub!.forwarding}` })} />}
                      {r.sub.dlt && <PinBtn on={has("dlt", r.sub.msisdn)} label="Pin sender registration" onClick={() => add({ kind: "dlt", ref: r.sub!.msisdn, label: `${r.sub!.dlt!.header} · ${r.sub!.dlt!.entity}` })} />}
                      {(r.sub.chakshu ?? 0) > 0 && <PinBtn on={has("chakshu", r.sub.msisdn)} label="Pin citizen reports" onClick={() => add({ kind: "chakshu", ref: r.sub!.msisdn, label: `${r.sub!.chakshu} reports` })} />}
                      {r.sub.police && <PinBtn on={has("police", r.sub.msisdn)} label="Pin police letter" onClick={() => add({ kind: "police", ref: r.sub!.msisdn, label: r.sub!.police!.ref })} />}
                    </div>
                  </>
                )}
              </div>
            )}

            {tool === "cdr" && r.cdr && (
              <div>
                <p className="muted">{r.cdr.total ? `${r.cdr.total} call records for ${r.cdr.by} ${r.cdr.key} in this window${r.cdr.total > r.cdr.rows.length ? `; the first ${r.cdr.rows.length} are listed, the statistics cover all of them` : ""}.` : "No call records in this window."}</p>
                {r.cdr.total > 0 && (
                  <div className="mt-3 grid gap-3 border-y border-[var(--line)] py-3 sm:grid-cols-[1fr_auto] sm:items-center" data-testid="cdr-stats">
                    <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-[13.5px] sm:grid-cols-4">
                      <div><dt className="label">Incoming</dt><dd>{pct(r.cdr.stats.inRatio)} ({r.cdr.stats.inn} of {r.cdr.stats.total})</dd></div>
                      <div><dt className="label">Numbers a day</dt><dd>{r.cdr.stats.perDay}</dd></div>
                      <div><dt className="label">Average call</dt><dd>{r.cdr.stats.avgSec} s</dd></div>
                      <div><dt className="label">Towers · handsets</dt><dd>{r.cdr.stats.towers.length} · {r.cdr.stats.handsets.length}</dd></div>
                    </dl>
                    <PinBtn testid="pin-stats" on={has("stats", `${r.cdr.key}|${from}|${to}`)} label="Pin these statistics" onClick={() => add({ kind: "stats", ref: `${r.cdr!.key}|${from}|${to}`, label: `${r.cdr!.by} ${r.cdr!.key}, ${from} to ${to}: ${pct(r.cdr!.stats.inRatio)} incoming, ${r.cdr!.stats.perDay}/day, ${r.cdr!.stats.towers.length} tower(s)` })} />
                  </div>
                )}
                {r.cdr.rows.length > 0 && (
                  <div className="mt-2 max-h-[420px] overflow-auto">
                    <table className="table w-full min-w-[620px] text-[13px]">
                      <thead><tr><th>Time (IST)</th><th>Dir</th><th>Other number</th><th>Secs</th><th>Handset</th><th>Tower</th><th /></tr></thead>
                      <tbody>
                        {r.cdr.rows.filter((x) => dir === "all" || x.dir === dir).map((x) => (
                          <tr key={x.id} data-testid="cdr-row">
                            <td className="whitespace-nowrap">{fmt(x.at)}</td><td>{x.dir === "out" ? "Out" : "In"}</td>
                            <td><Go onClick={() => fill("sub", x.other)}>{x.other}</Go></td><td>{x.seconds}</td>
                            <td><Go onClick={() => fill("imei", x.imei)}>{x.imei}</Go></td><td><Go onClick={() => fill("tower", x.cell)}>{x.cell}</Go></td>
                            <td><PinBtn on={has("call", x.id)} onClick={() => add({ kind: "call", ref: x.id, label: `${fmt(x.at)} ${x.dir} ${x.other} ${x.seconds}s` })} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tool === "imei" && r.imei && (
              <div>
                <p className={r.imei.found ? "" : "muted"}>{r.imei.note}</p>
                {r.imei.found && (
                  <>
                    <p className="mt-2"><span className="label">Device (from the first 8 digits)</span><span className="block font-medium">{r.imei.model}</span></p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <PinBtn testid="pin-handset" on={has("handset", r.imei.imei)} label="Pin this handset" onClick={() => add({ kind: "handset", ref: r.imei!.imei, label: `${r.imei!.imei} · ${r.imei!.model}` })} />
                      {r.imei.sims.length > 1 && <PinBtn testid="pin-all-sims" on={has("sims", r.imei.imei)} label={`Pin all ${r.imei.sims.length} SIMs`} onClick={() => add({ kind: "sims", ref: r.imei!.imei, label: `${r.imei!.sims.length} SIMs in ${r.imei!.imei}` })} />}
                    </div>
                    {r.imei.towers.length > 0 && <p className="mt-3"><span className="label">Towers its calls used</span>{r.imei.towers.slice(0, 8).map((t) => <span key={t} className="mr-3"><Go onClick={() => fill("tower", t)}>{t}</Go></span>)}{r.imei.towers.length > 8 && <span className="muted">+{r.imei.towers.length - 8}</span>}</p>}
                    <div className="mt-3 max-h-[360px] overflow-auto">
                      <table className="table w-full min-w-[520px] text-[13px]">
                        <thead><tr><th>SIM</th><th>Calls from it here</th><th>In the device</th><th /></tr></thead>
                        <tbody>
                          {r.imei.sims.map((s) => (
                            <tr key={s.msisdn + s.from} data-testid="imei-sim">
                              <td><Go onClick={() => fill("sub", s.msisdn)}>{s.msisdn}</Go></td><td>{s.calls}</td>
                              <td className="whitespace-nowrap">{fmt(s.from)} → {s.to ? fmt(s.to) : "now"}</td>
                              <td><PinBtn on={has("sim", s.msisdn) || has("sims", r.imei!.imei)} onClick={() => add({ kind: "sim", ref: s.msisdn, label: s.msisdn })} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {tool === "shop" && r.shop && (
              <div>
                <p className={r.shop.found ? "" : "muted"}>{r.shop.note}</p>
                {r.shop.found && (
                  <>
                    <p className="mt-2"><b>{r.shop.name}</b> · {r.shop.district} · agent {r.shop.agent} · <span className={`chip ${r.shop.verified ? "chip-good" : "chip-warn"}`}>{r.shop.verified ? "Verified point of sale" : "Not verified"}</span></p>
                    <PinBtn testid="pin-shop" on={has("shop", r.shop.pos)} label="Pin this shop" onClick={() => add({ kind: "shop", ref: r.shop!.pos, label: `${r.shop!.pos} · ${r.shop!.name}` })} />
                    {r.shop.docsReused.length > 0 && <p className="mt-3"><span className="label">ID documents used for more than one SIM</span>{r.shop.docsReused.map((d) => <span key={d.doc} className="mt-1 block"><Go onClick={() => fill("doc", d.doc)}>{d.doc}</Go> <span className="muted">{d.sims} SIMs</span></span>)}</p>}
                    <div className="mt-3 max-h-[260px] overflow-auto">
                      <table className="table w-full text-[13px]"><thead><tr><th>Day</th><th>SIMs activated</th><th>ID documents</th></tr></thead>
                        <tbody>{r.shop.days.map((d) => <tr key={d.day}><td>{fmt(d.day).slice(0, 9)}</td><td>{d.count}</td><td>{d.docs}</td></tr>)}</tbody></table>
                    </div>
                  </>
                )}
              </div>
            )}

            {tool === "tower" && r.tower && (
              <div>
                <p className={r.tower.found ? "" : "muted"}>{r.tower.note}</p>
                {r.tower.found && (
                  <>
                    <PinBtn testid="pin-tower" on={has("tower", r.tower.id)} label="Pin this tower" onClick={() => add({ kind: "tower", ref: r.tower!.id, label: `${r.tower!.id} · ${r.tower!.district}` })} />
                    <table className="table mt-3 w-full text-[13px]"><thead><tr><th>Handset</th><th>Device</th><th>Calls here</th><th>Seen on other towers</th></tr></thead>
                      <tbody>{r.tower.handsets.slice(0, 20).map((h) => <tr key={h.imei}><td><Go onClick={() => fill("imei", h.imei)}>{h.imei}</Go></td><td>{h.model}</td><td>{h.calls}</td><td>{h.otherTowers}</td></tr>)}</tbody></table>
                  </>
                )}
              </div>
            )}

            {tool === "switch" && r.switch && (
              <div>
                <p className={r.switch.found ? "" : "muted"}>{r.switch.note}</p>
                {r.switch.found && (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PinBtn testid="pin-switch" on={has("spoof", q.switch.trim())} label="Pin as spoofed calls" onClick={() => add({ kind: "spoof", ref: q.switch.trim(), label: `${q.switch.trim()}: ${r.switch!.rows.filter((x) => !x.matches).length} calls showed another number` })} />
                      <label className="text-[13px]"><span className="sr-only">Show</span>
                        <select className="input !py-1 text-[13px]" value={sw} onChange={(e) => setSw(e.target.value as typeof sw)} data-testid="switch-filter">
                          <option value="all">All calls</option><option value="other">Only calls showing someone else&apos;s number</option><option value="gateway">Came in through a gateway, showing a +91 number</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 max-h-[320px] overflow-auto">
                      <table className="table w-full min-w-[560px] text-[13px]"><thead><tr><th>Time</th><th>Real SIM</th><th>Caller ID carried</th><th>Belongs to</th><th>Entered via</th></tr></thead>
                        <tbody>{r.switch.rows.filter((x) => sw === "all" || (!x.matches && (sw === "other" || (x.entry !== "Local radio network" && x.presented.startsWith("+91"))))).map((x) => <tr key={x.call} data-testid="switch-row"><td className="whitespace-nowrap">{fmt(x.at)}</td><td className="mono">{x.originSim}</td><td className={`mono ${x.matches ? "" : "font-semibold"}`}>{x.presented}</td><td>{x.presentedBelongsTo}</td><td>{x.entry}</td></tr>)}</tbody></table>
                    </div>
                  </>
                )}
              </div>
            )}

            {tool === "route" && r.route && (
              <div>
                <p className={r.route.found ? "" : "muted"}>{r.route.note}</p>
                {r.route.found && (
                  <>
                    <ul className="mt-2 list-disc pl-5">{r.route.lines.map((l) => <li key={l.owner}>{l.owner} <span className="muted">({l.kind})</span></li>)}{r.route.devices.map((d) => <li key={d}>Flagged device <Go onClick={() => fill("imei", d)}>{d}</Go></li>)}</ul>
                    <PinBtn testid="pin-route" on={has("route", r.route.id)} label="Pin this route" onClick={() => add({ kind: "route", ref: r.route!.id, label: `${r.route!.id}: ${r.route!.lines.length} genuine line(s)` })} />
                  </>
                )}
              </div>
            )}

            {tool === "doc" && r.doc && (
              <div>
                <p className={r.doc.found ? "" : "muted"}>{r.doc.note}</p>
                {r.doc.found && (
                  <>
                    <PinBtn testid="pin-doc" on={has("doc", r.doc.doc)} label="Pin this document" onClick={() => add({ kind: "doc", ref: r.doc!.doc, label: `${r.doc!.doc}: ${r.doc!.sims.length} SIMs` })} />
                    <table className="table mt-3 w-full text-[13px]"><thead><tr><th>SIM</th><th>Name on the SIM</th><th>Shop</th><th>Activated</th></tr></thead>
                      <tbody>{r.doc.sims.map((s) => <tr key={s.msisdn}><td><Go onClick={() => fill("sub", s.msisdn)}>{s.msisdn}</Go></td><td>{s.kycName}</td><td><Go onClick={() => fill("shop", s.pos)}>{s.pos}</Go></td><td>{fmt(s.at)}</td></tr>)}</tbody></table>
                  </>
                )}
              </div>
            )}
            {tool === "group" && r.group && (
              <div>
                <p className={r.group.found ? "" : "muted"} data-testid="group-note">{r.group.note}</p>
                {r.group.found && (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.group.overLimit && <span className="chip chip-warn" data-testid="over-limit">Over DoT&apos;s limit: {r.group.docCount} SIMs on one person&apos;s ID (the limit is 9)</span>}
                      <PinBtn testid="pin-group" on={has("group", r.group.anchor!)} label="Pin this group" onClick={() => add({ kind: "group", ref: r.group!.anchor!, label: `${r.group!.rows.length} SIMs linked to ${r.group!.anchor}` })} />
                    </div>
                    <p className="mt-2 text-[12.5px] muted">Read each row before you act on the group. A real person&apos;s own SIM can sit on the same ID if the gang used their stolen document.</p>
                    <div className="mt-2 max-h-[380px] overflow-auto">
                      <table className="table w-full min-w-[680px] text-[13px]">
                        <thead><tr><th>SIM</th><th>Name on the SIM</th><th>Why linked</th><th>Shop</th><th>Activated</th><th>Calls out · in</th><th>Handsets</th></tr></thead>
                        <tbody>{r.group.rows.map((x) => (
                          <tr key={x.msisdn} data-testid="group-row" className={x.msisdn === r.group!.anchor ? "font-medium" : ""}>
                            <td className="whitespace-nowrap"><Go onClick={() => fill("sub", x.msisdn)}>{x.msisdn}</Go></td><td>{x.kycName}</td><td>{x.why.join(", ")}</td>
                            <td className="whitespace-nowrap"><Go onClick={() => fill("shop", x.pos)}>{x.pos}</Go></td><td className="whitespace-nowrap">{fmt(x.activatedAt)}{x.ownerYears > 0 && <span className="block text-[12px] muted">{x.ownerYears} yr{x.ownerYears > 1 ? "s" : ""} ago</span>}</td>
                            <td>{x.callsOut} · {x.callsIn}</td><td>{x.handsets.length ? x.handsets.map((h) => <span key={h} className="block"><Go onClick={() => fill("imei", h)}>{h}</Go></span>) : "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
            {!r[tool] && <p className="muted">Nothing looked up yet.</p>}
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="card p-4" data-testid="pin-board">
          <div className="flex items-baseline justify-between gap-2">
            <h2>Your trace</h2>
            {pins.length > 0 && <button type="button" className="link text-[13px]" onClick={() => { setPins([]); setCheck(null); }}>Clear</button>}
          </div>
          <p className="mt-1 text-[13px] muted">Built only from what you pin. {pins.length} pinned.{saved && ` Saved version ${saved.version}.`}</p>
          {pins.length === 0 ? <p className="mt-4 text-[14px] muted" data-testid="pins-empty">Nothing pinned yet. Look something up and pin what matters.</p> : (
            <ol className="mt-3 space-y-3 text-[13.5px]">
              {grouped.map(([kind, list]) => (
                <li key={kind} className="border-l-2 border-[#0d0d0d] pl-3" data-testid="trace-step">
                  <p className="label">{PIN_TITLE[kind]}</p>
                  <ul className="mt-1 space-y-1">
                    {list.slice(0, 10).map((p) => (
                      <li key={p.ref} className="flex items-center justify-between gap-2"><span className="truncate">{p.label}</span>
                        <button type="button" aria-label="Unpin" className="text-[var(--muted)] hover:text-[#0d0d0d]" onClick={() => drop(p)}><X size={13} /></button>
                      </li>
                    ))}
                    {list.length > 10 && <li className="muted">+{list.length - 10} more</li>}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-4" data-testid="signals-sheet">
          <h2>Check my trace</h2>
          <p className="mt-1 text-[13px] muted">The AI looks up each of your clues again in Telco-A&apos;s records. It shows which signs of fraud your clues prove, with the data behind each, and what each action still needs. You still decide.</p>
          {alert && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" onClick={doCheck} disabled={pins.length === 0 || pending} data-testid="ai-check"><ShieldCheck size={14} aria-hidden /> Check my trace</button>
            </div>
          )}
          {check && (
            <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-3 text-[13.5px]" data-testid="ai-result">
              <div><p className="label">Signs your clues show</p>
                <ul className="mt-1 space-y-1.5" data-testid="ai-signals">
                  {check.signals.map((x) => (
                    <li key={x.key} data-testid={`sign-${x.key}`} data-seen={x.seen} className="flex gap-2">
                      <span className={`mt-0.5 shrink-0 font-semibold ${x.seen ? "text-[var(--bad)]" : "text-[var(--muted)]"}`} aria-hidden>{x.seen ? "✓" : "–"}</span>
                      <span><span className={x.seen ? "font-medium" : "muted"}>{x.label}</span><span className="block text-[12.5px] muted">{x.why}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              {check.shows.length > 0 && <div><p className="label">Your pins show</p><ul className="mt-1 list-disc pl-5">{check.shows.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {check.empty.length > 0 && <div><p className="label">Pinned, but the record holds nothing</p><ul className="mt-1 list-disc pl-5 text-[var(--warn)]" data-testid="ai-empty">{check.empty.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              {check.offAlert.length > 0 && <div><p className="label">Not part of this alert</p><ul className="mt-1 list-disc pl-5 text-[var(--warn)]" data-testid="ai-offalert">{check.offAlert.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              <div><p className="label">What each action still needs</p>
                <ul className="mt-1 space-y-1.5" data-testid="ai-actions">
                  {check.actions.map((a) => (
                    <li key={a.action} data-testid={`ready-${a.action}`} data-ready={a.ready}>
                      <span className={`chip ${a.ready ? "chip-good" : "chip-grey"} mr-1.5`}>{a.ready ? "Evidence in place" : "Missing"}</span>{a.label}
                      {!a.ready && <span className="block pl-1 text-[12.5px] muted">Needs: {a.missing.join("; ")}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[12.5px] muted">You pinned {pins.length} {pins.length === 1 ? "clue" : "clues"}. The AI checked {pins.length === 1 ? "it" : "each one"} against Telco-A&apos;s records. Pin more clues to build a stronger case. The decision is yours.</p>
            </div>
          )}
        </section>

        {alert && (
          <section className="card p-4" data-testid="save-panel">
            <h2>Save to the record</h2>
            {locked ? <p className="mt-1 text-[13px] muted" data-testid="save-locked">{alert.id} is decided, so version {saved?.version} is locked as the evidence on file. You can still look things up.</p> : <>
            <p className="mt-1 text-[13px] muted">Saving writes your pins to the tamper-proof record. Your decision on {alert.id} will point to this version.</p>
            <input className="input mt-3" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="btn btn-primary mt-3" onClick={doSave} disabled={pins.length === 0 || pending} data-testid="save-trace"><Save size={14} aria-hidden /> Save trace</button>
            </>}
            {msg && <p role="status" className={`mt-2 text-[13px] ${msg.ok ? "text-[var(--good)]" : "text-[var(--bad)]"}`} data-testid="save-result">{msg.text}</p>}
            <a href={`/telco/${alert.id}`} className="link mt-3 block text-[13.5px]">Back to {alert.id} to decide</a>
          </section>
        )}
      </aside>
    </div>
  );
}
