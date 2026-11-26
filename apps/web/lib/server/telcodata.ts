/**
 * Telco-A's own records (data/telco.json, built by pipeline/scalpel_sim/telco_world.py around world.json):
 * SIM KYC records and the shops that activated them, towers, handset models, which handset each SIM sat in,
 * ordinary traffic both ways, the switch log of caller IDs, routes, business sender registrations and police letters.
 * Read only by the Telco-A workbench. The bank never reads this file.
 */
import raw from "@/data/telco.json";
import { W } from "./world";

export interface TSub {
  msisdn: string; iccid: string; imsi: string; kycName: string; kycDoc: string; pos: string; plan: string; status: string; activatedAt: number;
  forwarding: string | null; swaps: { at: number; pos: string; reason: string }[]; recharges: { at: number; amount: number; pos: string; payRef: string }[];
  chakshu: number; dlt: { header: string; entity: string; type: string } | null; police: { from: string; ref: string; at: number; text: string } | null; endUser?: string;
}
export interface TShop { pos: string; name: string; district: string; state: string; verified: boolean; agent: string }
export interface TTower { id: string; district: string; state: string }
export interface TCall { id: string; at: number; from: string; to: string; seconds: number; imei: string; cell: string }
export interface TSwitch { call: string; at: number; originSim: string; presented: string; entry: string; imei: string }
export interface TRoute { id: string; lines: { owner: string; kind: string }[]; devices: string[] }
interface TFile {
  towers: TTower[]; shops: TShop[]; subscribers: TSub[]; attach: { msisdn: string; imei: string; from: number; to: number | null }[];
  cdr: TCall[]; switch: TSwitch[]; routes: TRoute[]; callCell: Record<string, string>; tac: Record<string, { model: string; kind: string }>; phoneModels: string[];
}
export const T = raw as unknown as TFile;

export const norm = (s: string) => s.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
export const same = (a: string, b: string) => { const x = norm(a); return x.length > 0 && x === norm(b); };

let idx: null | {
  sub: Map<string, TSub>; shop: Map<string, TShop>; tower: Map<string, TTower>; calls: TCall[];
  byNumber: Map<string, TCall[]>; byImei: Map<string, TCall[]>; byCell: Map<string, TCall[]>; switchBySim: Map<string, TSwitch[]>;
} = null;

/** One call list: world.json's scam calls (with their tower) plus Telco-A's ordinary traffic. */
export function I() {
  if (idx) return idx;
  const calls: TCall[] = [
    ...W.calls.map((c) => ({ id: c.id, at: c.at, from: c.realSim, to: c.to, seconds: c.seconds, imei: c.imei, cell: T.callCell[c.id] ?? "unknown" })),
    ...T.cdr,
  ].sort((a, b) => a.at - b.at);
  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  const byNumber = new Map<string, TCall[]>(), byImei = new Map<string, TCall[]>(), byCell = new Map<string, TCall[]>();
  for (const c of calls) {
    push(byNumber, norm(c.from), c);
    if (norm(c.to) !== norm(c.from)) push(byNumber, norm(c.to), c);
    push(byImei, c.imei, c);
    push(byCell, c.cell, c);
  }
  const switchBySim = new Map<string, TSwitch[]>();
  for (const s of T.switch) push(switchBySim, norm(s.originSim), s);
  idx = {
    sub: new Map(T.subscribers.map((s) => [norm(s.msisdn), s])), shop: new Map(T.shops.map((s) => [s.pos, s])),
    tower: new Map(T.towers.map((t) => [t.id, t])), calls, byNumber, byImei, byCell, switchBySim,
  };
  return idx;
}

export function deviceModel(imei: string): { model: string; kind: string } {
  const t = T.tac[imei.slice(0, 8)];
  if (t) return t;
  if (imei.startsWith("PRI")) return { model: "Fixed-line PRI trunk (no handset)", kind: "trunk" };
  let h = 0; for (const c of imei) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { model: T.phoneModels[h % T.phoneModels.length]!, kind: "phone" };
}
