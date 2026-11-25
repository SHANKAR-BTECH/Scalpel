/**
 * Telco-A's lookup tools for the SIM trace workbench. Each one answers a single question from Telco-A's own
 * records, the way an engineer's subscriber, call-record and handset tools do. None of them traces anything on
 * its own: the engineer decides what to look up next and what to pin.
 */
import { W } from "./world";

const DAY = 86_400_000;
const norm = (s: string) => s.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
const same = (a: string, b: string) => norm(a) === norm(b) && norm(a).length > 0;
function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** Every Telco-A SIM the world knows about, with the handset it was last seen in. */
function simIndex() {
  const m = new Map<string, { msisdn: string; activatedAt: number | null; kycName: string | null; imei: string | null; swappedAt: number | null; forwarding: boolean }>();
  for (const r of W.rigs) for (const s of r.sims) m.set(norm(s.msisdn), { msisdn: s.msisdn, activatedAt: s.activatedAt, kycName: s.kycName, imei: r.imei, swappedAt: null, forwarding: false });
  for (const s of W.soloSims) m.set(norm(s.msisdn), { msisdn: s.msisdn, activatedAt: null, kycName: null, imei: s.imei, swappedAt: s.swappedAt, forwarding: false });
  for (const p of W.phones) if (p.telco === "Telco-A") {
    const a = W.accounts.find((x) => x.id === p.account);
    m.set(norm(p.msisdn), { msisdn: p.msisdn, activatedAt: null, kycName: a?.holder.name ?? null, imei: p.imei, swappedAt: p.swappedAt, forwarding: p.forwarding });
  }
  return m;
}

export interface SubscriberResult {
  found: boolean; msisdn: string; note: string;
  operator?: string; iccid?: string; imsi?: string; kycName?: string | null; activatedAt?: number | null;
  lastImei?: string | null; swappedAt?: number | null; forwarding?: boolean;
}

export function subscriber(q: string): SubscriberResult {
  const n = norm(q);
  if (n.length < 10) return { found: false, msisdn: q, note: "Type the full 10-digit number." };
  const s = simIndex().get(n);
  if (s) {
    const h = hash(n);
    return {
      found: true, msisdn: s.msisdn, operator: "Telco-A", note: "Telco-A subscriber.",
      iccid: `8991 0${String(h % 1e9).padStart(9, "0")} ${String(hash(n + "i") % 1e5).padStart(5, "0")}`,
      imsi: `404 45 ${String(hash(n + "s") % 1e10).padStart(10, "0")}`,
      kycName: s.kycName, activatedAt: s.activatedAt ?? W.now - (60 + (h % 900)) * DAY,
      lastImei: s.imei, swappedAt: s.swappedAt, forwarding: s.forwarding,
    };
  }
  const v = W.victims.find((x) => same(x.phone, n));
  if (v) return { found: false, msisdn: v.phone, operator: v.telco, note: `Not a Telco-A number: ${v.telco} subscriber. Their records sit with ${v.telco}.` };
  return { found: false, msisdn: q, note: "No Telco-A subscriber with this number." };
}

export interface CallRow { id: string; sim: string; at: number; dir: "out" | "in"; other: string; otherNote: string; shownAs: string; seconds: number; imei: string; cell: string }

const cellOf = (imei: string, at: number) => {
  const r = W.rigs.find((x) => x.imei === imei);
  return r ? r.cell : `TA-${["MH", "KA", "DL", "WB"][hash(imei) % 4]}-0${100 + (hash(imei + at) % 800)}`;
};
const victimName = (n: string) => W.victims.find((v) => same(v.phone, n))?.name ?? null;

/** Call records for one number over a date window: what Telco-A's switch logged, nothing more. */
export function callRecords(q: string, fromDay: number | null, toDay: number | null): { rows: CallRow[]; total: number } {
  const n = norm(q);
  const lo = fromDay ?? -Infinity, hi = toDay ?? Infinity;
  const rows: CallRow[] = [];
  for (const c of W.calls) {
    const out = same(c.realSim, n);
    const inn = same(c.to, n);
    if (!out && !inn) continue;
    if (c.at < lo || c.at > hi) continue;
    const other = out ? c.to : c.realSim;
    const vn = victimName(other);
    rows.push({ id: c.id, sim: c.realSim, at: c.at, dir: out ? "out" : "in", other, otherNote: vn ? `${vn} (Telco-B)` : "", shownAs: c.shownCaller, seconds: c.seconds, imei: c.imei, cell: cellOf(c.imei, c.at) });
  }
  rows.sort((a, b) => a.at - b.at);
  return { rows: rows.slice(0, 200), total: rows.length };
}

export interface HandsetResult { found: boolean; imei: string; note: string; sims: { msisdn: string; calls: number; firstAt: number; lastAt: number }[]; cells: string[] }

/** Every SIM that has made a call from this handset (IMEI), from the switch logs. */
export function handset(q: string): HandsetResult {
  const imei = q.replace(/\D/g, "");
  if (imei.length !== 15) return { found: false, imei: q, note: "An IMEI has 15 digits.", sims: [], cells: [] };
  const by = new Map<string, { msisdn: string; calls: number; firstAt: number; lastAt: number }>();
  const cells = new Set<string>();
  for (const c of W.calls) if (c.imei === imei) {
    const k = norm(c.realSim);
    const e = by.get(k) ?? { msisdn: c.realSim, calls: 0, firstAt: c.at, lastAt: c.at };
    e.calls++; e.firstAt = Math.min(e.firstAt, c.at); e.lastAt = Math.max(e.lastAt, c.at);
    by.set(k, e); cells.add(cellOf(imei, c.at));
  }
  const rig = W.rigs.find((r) => r.imei === imei);
  if (rig) for (const s of rig.sims) if (!by.has(norm(s.msisdn))) by.set(norm(s.msisdn), { msisdn: s.msisdn, calls: 0, firstAt: s.activatedAt, lastAt: s.activatedAt });
  const sims = [...by.values()].sort((a, b) => b.calls - a.calls);
  if (!sims.length) return { found: false, imei, note: "This handset has not been seen on Telco-A's network.", sims: [], cells: [] };
  return { found: true, imei, note: `${sims.length} SIM${sims.length > 1 ? "s" : ""} seen in this handset.`, sims, cells: [...cells] };
}
