/**
 * Telco-A's lookup tools for the SIM trace workbench. Each one answers one question from Telco-A's own records,
 * the way an engineer's subscriber, call-record, handset, shop, tower, switch-log, route and KYC tools do.
 * None of them traces anything on its own: the engineer decides what to look up next and what to pin.
 * Call records show numbers only: Telco-A's switch does not know who a Telco-B customer is, or whether they lost money.
 */
import { I, T, norm, same, deviceModel, type TCall } from "./telcodata";
import { W } from "./world";

const DAY = 86_400_000;
const IST = 19_800_000; // +05:30
/** A date string (YYYY-MM-DD) as the start of that day in India. */
export const istDay = (d: string) => Date.parse(`${d}T00:00:00Z`) - IST;

export interface SubscriberResult {
  found: boolean; msisdn: string; note: string;
  operator?: string; iccid?: string; imsi?: string; kycName?: string; kycDoc?: string; plan?: string; status?: string; endUser?: string;
  activatedAt?: number; shop?: { pos: string; name: string; district: string; verified: boolean } | null;
  swaps?: { at: number; shop: string }[]; forwarding?: string | null; recharges?: { at: number; amount: number; shop: string; payRef: string }[];
  chakshu?: number; dlt?: { header: string; entity: string; type: string } | null; police?: { from: string; ref: string; at: number; text: string } | null;
  handsets?: { imei: string; from: number; to: number | null }[];
}

export function subscriber(q: string): SubscriberResult {
  const n = norm(q);
  if (n.length < 10) return { found: false, msisdn: q, note: "Type the full 10-digit number." };
  const { sub, shop } = I();
  const s = sub.get(n);
  if (s) {
    const sh = shop.get(s.pos);
    return {
      found: true, msisdn: s.msisdn, operator: "Telco-A", note: "Telco-A subscriber.", iccid: s.iccid, imsi: s.imsi, kycName: s.kycName, kycDoc: s.kycDoc,
      plan: s.plan, status: s.status, endUser: s.endUser, activatedAt: s.activatedAt,
      shop: sh ? { pos: sh.pos, name: sh.name, district: sh.district, verified: sh.verified } : null,
      swaps: s.swaps.map((w) => ({ at: w.at, shop: shop.get(w.pos)?.name ?? w.pos })), forwarding: s.forwarding,
      recharges: s.recharges.map((r) => ({ at: r.at, amount: r.amount, shop: shop.get(r.pos)?.name ?? r.pos, payRef: r.payRef })),
      chakshu: s.chakshu, dlt: s.dlt, police: s.police,
      handsets: T.attach.filter((a) => same(a.msisdn, n)).map((a) => ({ imei: a.imei, from: a.from, to: a.to })).sort((a, b) => a.from - b.from),
    };
  }
  const v = W.victims.find((x) => same(x.phone, n));
  if (v) return { found: false, msisdn: v.phone, operator: v.telco, note: `Not a Telco-A number. It belongs to ${v.telco}; its subscriber records sit there.` };
  return { found: false, msisdn: q, note: "No Telco-A subscriber with this number." };
}

export interface CallRow { id: string; at: number; dir: "out" | "in"; other: string; seconds: number; imei: string; cell: string }
export interface CallStats { total: number; out: number; inn: number; inRatio: number; others: number; perDay: number; avgSec: number; towers: string[]; handsets: string[]; days: number }

function stats(rows: CallRow[], days: number): CallStats {
  const out = rows.filter((r) => r.dir === "out").length;
  const towers = [...new Set(rows.map((r) => r.cell))], handsets = [...new Set(rows.map((r) => r.imei))];
  const others = new Set(rows.map((r) => norm(r.other))).size;
  return {
    total: rows.length, out, inn: rows.length - out, inRatio: rows.length ? (rows.length - out) / rows.length : 0, others,
    perDay: Math.round((others / Math.max(1, days)) * 10) / 10, avgSec: rows.length ? Math.round(rows.reduce((s, r) => s + r.seconds, 0) / rows.length) : 0, towers, handsets, days,
  };
}

/**
 * Call records for a number or a handset over a window of days (India time). The statistics are worked out
 * over every record in the window, not just the rows shown or pinned.
 */
export function callRecords(q: string, from: string | null, to: string | null): { by: "number" | "handset"; key: string; rows: CallRow[]; total: number; stats: CallStats; from: number; to: number } {
  const digits = q.replace(/\D/g, "");
  const isImei = digits.length === 15 || q.startsWith("PRI");
  const lo = from ? istDay(from) : -Infinity, hi = to ? istDay(to) + DAY - 1 : Infinity;
  const { byNumber, byImei } = I();
  const src: TCall[] = isImei ? byImei.get(q.startsWith("PRI") ? q : digits) ?? [] : byNumber.get(norm(q)) ?? [];
  const rows: CallRow[] = [];
  for (const c of src) {
    if (c.at < lo || c.at > hi) continue;
    if (isImei) rows.push({ id: c.id, at: c.at, dir: "out", other: c.to, seconds: c.seconds, imei: c.imei, cell: c.cell });
    else {
      const out = same(c.from, q);
      rows.push({ id: c.id, at: c.at, dir: out ? "out" : "in", other: out ? c.to : c.from, seconds: c.seconds, imei: c.imei, cell: c.cell });
    }
  }
  if (isImei) {
    // For a handset, a call is incoming when it was received by a SIM inside it.
    const sims = new Set(T.attach.filter((a) => a.imei === digits || a.imei === q).map((a) => norm(a.msisdn)));
    const byId = new Map(src.map((x) => [x.id, x]));
    for (const r of rows) { const c = byId.get(r.id)!; if (sims.has(norm(c.to)) && !sims.has(norm(c.from))) { r.dir = "in"; r.other = c.from; } }
  }
  const lo2 = rows.length ? rows[0]!.at : 0, hi2 = rows.length ? rows[rows.length - 1]!.at : 0;
  const days = Math.max(1, Math.round((Math.min(hi, hi2 || hi) - Math.max(lo, lo2 || lo)) / DAY) || 1);
  return { by: isImei ? "handset" : "number", key: isImei ? digits || q : norm(q), rows: rows.slice(0, 300), total: rows.length, stats: stats(rows, days), from: lo2, to: hi2 };
}

export interface HandsetResult { found: boolean; imei: string; note: string; model?: string; kind?: string; sims: { msisdn: string; from: number; to: number | null; calls: number }[]; towers: string[] }

/** What the handset is (from the first 8 digits of its IMEI) and every SIM that has sat in it. */
export function handset(q: string): HandsetResult {
  const imei = q.startsWith("PRI") ? q : q.replace(/\D/g, "");
  if (!imei.startsWith("PRI") && imei.length !== 15) return { found: false, imei: q, note: "An IMEI has 15 digits.", sims: [], towers: [] };
  const att = T.attach.filter((a) => a.imei === imei);
  const calls = I().byImei.get(imei) ?? [];
  if (!att.length && !calls.length) return { found: false, imei, note: "This handset has not been seen on Telco-A's network.", sims: [], towers: [] };
  const m = deviceModel(imei);
  const count = new Map<string, number>();
  for (const c of calls) count.set(norm(c.from), (count.get(norm(c.from)) ?? 0) + 1);
  const sims = att.map((a) => ({ msisdn: a.msisdn, from: a.from, to: a.to, calls: count.get(norm(a.msisdn)) ?? 0 })).sort((a, b) => b.calls - a.calls || a.from - b.from);
  return { found: true, imei, note: `${sims.length} SIM${sims.length === 1 ? "" : "s"} have sat in this device.`, model: m.model, kind: m.kind, sims, towers: [...new Set(calls.map((c) => c.cell))] };
}

export interface ShopResult { found: boolean; pos: string; note: string; name?: string; district?: string; agent?: string; verified?: boolean; days: { day: number; count: number; docs: number }[]; sims: { msisdn: string; at: number; kycName: string; kycDoc: string }[]; docsReused: { doc: string; sims: number }[] }

/** A point of sale: who runs it, whether it is verified, and every SIM it activated, by day. */
export function shopLookup(q: string): ShopResult {
  const { shop } = I();
  const key = q.trim().toUpperCase();
  const s = shop.get(key) ?? T.shops.find((x) => x.name.toLowerCase() === q.trim().toLowerCase());
  if (!s) return { found: false, pos: q, note: "No point of sale with this ID. IDs look like POS-BR-4471.", days: [], sims: [], docsReused: [] };
  const sims = T.subscribers.filter((x) => x.pos === s.pos).map((x) => ({ msisdn: x.msisdn, at: x.activatedAt, kycName: x.kycName, kycDoc: x.kycDoc })).sort((a, b) => a.at - b.at);
  const byDay = new Map<number, { count: number; docs: Set<string> }>();
  for (const x of sims) { const d = Math.floor((x.at + 19_800_000) / DAY); const e = byDay.get(d) ?? { count: 0, docs: new Set() }; e.count++; e.docs.add(x.kycDoc); byDay.set(d, e); }
  const docs = new Map<string, number>();
  for (const x of sims) docs.set(x.kycDoc, (docs.get(x.kycDoc) ?? 0) + 1);
  return {
    found: true, pos: s.pos, note: `${sims.length} SIMs activated here.`, name: s.name, district: `${s.district}, ${s.state}`, agent: s.agent, verified: s.verified,
    days: [...byDay.entries()].map(([d, e]) => ({ day: d * DAY - 19_800_000, count: e.count, docs: e.docs.size })).sort((a, b) => a.day - b.day),
    sims, docsReused: [...docs.entries()].filter(([, n]) => n > 1).map(([doc, n]) => ({ doc, sims: n })).sort((a, b) => b.sims - a.sims),
  };
}

export interface TowerResult { found: boolean; id: string; note: string; district?: string; handsets: { imei: string; calls: number; otherTowers: number; model: string }[] }

/** A tower: where it is, which handsets made calls through it, and whether they were ever seen anywhere else. */
export function tower(q: string): TowerResult {
  const id = q.trim().toUpperCase();
  const t = I().tower.get(id);
  if (!t) return { found: false, id: q, note: "No tower with this ID. IDs look like TA-BR-0747.", handsets: [] };
  const calls = I().byCell.get(id) ?? [];
  const per = new Map<string, number>();
  for (const c of calls) per.set(c.imei, (per.get(c.imei) ?? 0) + 1);
  const handsets = [...per.entries()].map(([imei, n]) => ({ imei, calls: n, otherTowers: new Set((I().byImei.get(imei) ?? []).map((c) => c.cell).filter((c) => c !== id)).size, model: deviceModel(imei).model })).sort((a, b) => b.calls - a.calls);
  return { found: true, id, note: `${t.district}, ${t.state}. ${handsets.length} handset${handsets.length === 1 ? "" : "s"} made calls here.`, district: `${t.district}, ${t.state}`, handsets };
}

export interface SwitchRow { call: string; at: number; originSim: string; presented: string; entry: string; matches: boolean; presentedBelongsTo: string }

/** The switch log for calls made by one SIM: the caller ID each call carried, against the SIM that really made it. */
export function switchLog(q: string): { found: boolean; note: string; rows: SwitchRow[] } {
  const rows = (I().switchBySim.get(norm(q)) ?? []).map((s) => {
    const sub = I().sub.get(norm(s.presented));
    const prot = W.protectedNumbers.find((p) => same(p.msisdn, s.presented));
    return {
      call: s.call, at: s.at, originSim: s.originSim, presented: s.presented, entry: s.entry, matches: same(s.presented, s.originSim),
      presentedBelongsTo: same(s.presented, s.originSim) ? "this SIM" : prot ? `${prot.owner}` : sub ? `Telco-A subscriber ${sub.kycName}` : "another operator's subscriber",
    };
  });
  if (!rows.length) return { found: false, note: "No switch-log entries for calls from this number in the window kept (30 days).", rows: [] };
  const off = rows.filter((r) => !r.matches).length;
  return { found: true, note: `${rows.length} calls logged; ${off} carried a caller ID that is not this SIM's own number.`, rows };
}

export function route(q: string): { found: boolean; note: string; id: string; lines: { owner: string; kind: string }[]; devices: string[] } {
  const r = T.routes.find((x) => x.id.toLowerCase().includes(q.trim().toLowerCase()) && q.trim().length >= 4);
  if (!r) return { found: false, note: "No route with this name. Routes look like TA-GW-56.", id: q, lines: [], devices: [] };
  return { found: true, note: `${r.lines.length} registered line${r.lines.length === 1 ? "" : "s"} and ${r.devices.length} flagged device${r.devices.length === 1 ? "" : "s"} use this route.`, id: r.id, lines: r.lines, devices: r.devices };
}

export function kycDoc(q: string): { found: boolean; note: string; doc: string; sims: { msisdn: string; kycName: string; pos: string; at: number }[] } {
  const d = q.trim();
  const sims = T.subscribers.filter((s) => s.kycDoc === d || (/^\d{4}$/.test(d) && s.kycDoc === `XXXX XXXX ${d}`)).map((s) => ({ msisdn: s.msisdn, kycName: s.kycName, pos: s.pos, at: s.activatedAt }));
  if (!sims.length) return { found: false, note: "No SIMs on this ID document.", doc: d, sims: [] };
  const names = new Set(sims.map((s) => s.kycName)).size;
  return { found: true, note: `${sims.length} SIM${sims.length === 1 ? "" : "s"} on this ID document${names > 1 ? `, under ${names} different names` : ""}.`, doc: d, sims };
}
