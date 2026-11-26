/**
 * The AI check on an engineer's trace. It runs on the server and reads only the pins: each pin is a reference
 * (a number, a handset, a shop…) and the facts are looked up again here, so nothing typed in the browser counts.
 * It says what the pins show, which pins don't belong to this alert, and for each possible action what evidence
 * is still missing. It never looks anything up that he didn't pin, and it never says which action is right.
 */
import { createHash } from "node:crypto";
import { alertById, ACTION_LABEL, type TAction } from "./telco";
import { T, norm, I } from "./telcodata";
import { callRecords, subscriber, handset, shopLookup, kycDoc, switchLog, route, tower } from "./lookup";

import { PIN_KINDS, PIN_TITLE, type PinKind, type PinRef } from "@/lib/pins";
export type { PinRef };

/** Everything that belongs to an alert: its handset or number, the SIMs, towers, shops, ID documents and route. */
function scope(alertId: string) {
  const a = alertById(alertId);
  if (!a) return null;
  const numbers = new Set<string>(), imeis = new Set<string>(), towers = new Set<string>(), shops = new Set<string>(), docs = new Set<string>(), routes = new Set<string>();
  if (a.kind === "IMEI") imeis.add(a.value); else numbers.add(norm(a.value));
  for (const at of T.attach) {
    if (imeis.has(at.imei)) numbers.add(norm(at.msisdn));
  }
  for (const at of T.attach) if (numbers.has(norm(at.msisdn))) imeis.add(at.imei);
  for (const imei of imeis) for (const c of I().byImei.get(imei) ?? []) towers.add(c.cell);
  for (const n of numbers) for (const c of I().byNumber.get(n) ?? []) towers.add(c.cell);
  for (const n of numbers) { const s = I().sub.get(n); if (s) { shops.add(s.pos); docs.add(s.kycDoc); for (const w of s.swaps) shops.add(w.pos); } }
  for (const r of T.routes) if (r.devices.some((d) => imeis.has(d))) routes.add(r.id);
  return { a, numbers, imeis, towers, shops, docs, routes };
}

function belongs(p: PinRef, s: NonNullable<ReturnType<typeof scope>>): boolean {
  const key = p.ref.split("|")[0]!;
  switch (p.kind) {
    case "handset": case "sims": return s.imeis.has(key);
    case "number": case "sim": case "spoof": case "police": case "dlt": case "chakshu": case "swap": case "forwarding": return s.numbers.has(norm(key));
    case "stats": return s.imeis.has(key) || s.numbers.has(norm(key));
    case "tower": return s.towers.has(key);
    case "shop": return s.shops.has(key);
    case "doc": return s.docs.has(key);
    case "route": return s.routes.has(key);
    case "call": { const c = I().calls.find((x) => x.id === key); return Boolean(c && (s.imeis.has(c.imei) || s.numbers.has(norm(c.from)) || s.numbers.has(norm(c.to)))); }
  }
}

/** A pin counts only if the record it points to really holds that fact (a "police" pin on a number with no police
 *  letter is nothing). The workbench only offers pins for facts it found, so this guards against a forged request. */
function holds(p: PinRef): boolean {
  const key = p.ref.split("|")[0]!;
  switch (p.kind) {
    case "handset": return handset(key).found;
    case "sims": return T.attach.some((x) => x.imei === key);
    case "number": case "sim": return subscriber(key).found;
    case "police": return Boolean(subscriber(key).police);
    case "dlt": return Boolean(subscriber(key).dlt);
    case "chakshu": return (subscriber(key).chakshu ?? 0) > 0;
    case "swap": return (subscriber(key).swaps?.length ?? 0) > 0;
    case "forwarding": return Boolean(subscriber(key).forwarding);
    case "spoof": return switchLog(key).rows.some((r) => !r.matches);
    case "stats": { const [k, f, t] = p.ref.split("|"); return callRecords(k!, f || null, t || null).stats.total > 0; }
    case "tower": return tower(key).found;
    case "shop": return shopLookup(key).found;
    case "doc": return kycDoc(key).found;
    case "route": return route(key).found;
    case "call": return I().calls.some((x) => x.id === key);
  }
}

export interface TraceCheck {
  shows: string[]; offAlert: string[]; empty: string[];
  actions: { action: TAction; label: string; ready: boolean; missing: string[] }[];
}

export function checkTrace(alertId: string, pins: PinRef[]): TraceCheck {
  const s = scope(alertId);
  if (!s) return { shows: [], offAlert: [], empty: [], actions: [] };
  const name = (p: PinRef) => `${PIN_TITLE[p.kind]} ${p.label}`;
  const offAlert = pins.filter((p) => !belongs(p, s)).map(name);
  const empty = pins.filter((p) => belongs(p, s) && !holds(p)).map(name);
  const inPins = pins.filter((p) => belongs(p, s) && holds(p));
  const has = (k: PinKind) => inPins.some((p) => p.kind === k);
  const shows: string[] = [];

  // Facts, recomputed from the references.
  const hs = inPins.filter((p) => p.kind === "handset").map((p) => handset(p.ref));
  for (const h of hs) if (h.found) shows.push(`Handset ${h.imei} is a ${h.model?.toLowerCase()}; ${h.sims.length} SIM${h.sims.length === 1 ? "" : "s"} have sat in it.`);
  const attached = new Set(T.attach.filter((x) => s.imeis.has(x.imei)).map((x) => norm(x.msisdn)));
  const pinnedSims = new Set<string>();
  for (const p of inPins) if (p.kind === "sims") for (const x of T.attach) if (x.imei === p.ref) pinnedSims.add(norm(x.msisdn));
  for (const p of inPins) if (p.kind === "sim") pinnedSims.add(norm(p.ref));
  if (pinnedSims.size) shows.push(`${pinnedSims.size} SIM${pinnedSims.size === 1 ? "" : "s"} pinned${attached.size > 1 ? ` of ${attached.size} seen in the handset` : ""}.`);
  const st = inPins.filter((p) => p.kind === "stats").map((p) => { const [k, f, t] = p.ref.split("|"); return callRecords(k!, f || null, t || null); });
  for (const r of st) shows.push(`${r.stats.total} calls (${r.by} ${r.key}): ${Math.round(r.stats.inRatio * 100)}% incoming, ${r.stats.perDay} different numbers a day, ${r.stats.avgSec} s on average, ${r.stats.towers.length} tower${r.stats.towers.length === 1 ? "" : "s"}.`);
  for (const p of inPins.filter((x) => x.kind === "tower")) { const t = tower(p.ref); if (t.found) shows.push(`Tower ${t.id} (${t.district}).`); }
  for (const p of inPins.filter((x) => x.kind === "shop")) { const r = shopLookup(p.ref); if (r.found) shows.push(`Shop ${r.name} (${r.pos}) is ${r.verified ? "verified" : "NOT verified"}; ${r.sims.length} SIMs activated there${r.docsReused.length ? `, ${r.docsReused.length} ID document${r.docsReused.length > 1 ? "s" : ""} used more than once` : ""}.`); }
  for (const p of inPins.filter((x) => x.kind === "doc")) { const r = kycDoc(p.ref); if (r.found) shows.push(`ID document ${r.doc}: ${r.note}`); }
  for (const p of inPins.filter((x) => x.kind === "spoof")) { const r = switchLog(p.ref); if (r.found) shows.push(`Switch log for ${p.ref}: ${r.note}`); }
  for (const p of inPins.filter((x) => x.kind === "route")) { const r = route(p.ref); if (r.found) shows.push(`${r.id}: ${r.note}`); }
  const sub = (p: PinRef) => subscriber(p.ref);
  for (const p of inPins.filter((x) => x.kind === "police")) { const r = sub(p); if (r.police) shows.push(`Police letter ${r.police.ref} on ${r.msisdn}: ${r.police.text}`); }
  for (const p of inPins.filter((x) => x.kind === "dlt")) { const r = sub(p); if (r.dlt) shows.push(`${r.msisdn} is a registered sender (${r.dlt.header}, ${r.dlt.entity}).`); }
  for (const p of inPins.filter((x) => x.kind === "chakshu")) { const r = sub(p); shows.push(`${r.chakshu ?? 0} citizen reports on ${r.msisdn}.`); }
  for (const p of inPins.filter((x) => x.kind === "swap")) { const r = sub(p); if (r.swaps?.length) shows.push(`${r.msisdn} owned since ${new Date(r.activatedAt!).getFullYear()}, swapped at ${r.swaps.at(-1)!.shop}.`); }
  for (const p of inPins.filter((x) => x.kind === "forwarding")) { const r = sub(p); if (r.forwarding) shows.push(`${r.msisdn} forwards its calls to ${r.forwarding}.`); }

  const statsHandset = st.some((r) => r.by === "handset");
  const statsAny = st.length > 0;
  const enoughSims = attached.size <= 1 || pinnedSims.size >= Math.ceil(attached.size / 2);
  const need: Record<TAction, [boolean, string][]> = {
    BAR_IMEI: [[hs.length > 0, "the handset (look it up and pin it)"], [enoughSims && pinnedSims.size > 0, "the SIMs in the handset (pin them all)"], [statsHandset, "call statistics for the handset"], [has("tower"), "the tower it uses"]],
    BLOCK_ROUTE: [[has("route"), "the route lookup (who else uses it)"], [hs.length > 0, "the handset"], [statsAny, "call statistics"]],
    KEEP_LIVE: [[has("police"), "the police letter on file"], [has("number") || hs.length > 0, "the number or handset"]],
    DISCONNECT: [[has("number"), "the number's subscriber record"], [statsAny, "call statistics"], [has("swap") || has("forwarding") || has("spoof"), "what makes the line bad (swap, forwarding or switch log)"]],
    REVERIFY: [[has("number"), "the number's subscriber record"], [has("swap"), "the SIM swap history"]],
    LABEL_SPAM: [[has("number"), "the number"], [has("chakshu"), "the citizen reports"], [statsAny, "call statistics"]],
    CLEAR_REPORT: [[has("number"), "the number"], [has("chakshu"), "the citizen reports"], [has("dlt"), "the business sender registration"]],
    GENUINE: [[hs.length > 0 || has("number"), "the handset or number"], [has("dlt"), "the business sender registration"], [statsAny, "call statistics (both directions)"]],
  };
  const actions = s.a.options.map((o) => {
    const missing = need[o].filter(([ok]) => !ok).map(([, t]) => t);
    return { action: o, label: ACTION_LABEL[o], ready: missing.length === 0, missing };
  });
  return { shows, offAlert, empty, actions };
}

export const traceHash = (pins: PinRef[]) => createHash("sha256").update(JSON.stringify(pins.map((p) => [p.kind, p.ref]))).digest("hex").slice(0, 16);

export function cleanPins(raw: unknown): PinRef[] {
  if (!Array.isArray(raw)) return [];
  const out: PinRef[] = [];
  for (const p of raw.slice(0, 400)) {
    if (!p || typeof p !== "object") continue;
    const { kind, ref, label } = p as Record<string, unknown>;
    if (typeof kind !== "string" || !(PIN_KINDS as readonly string[]).includes(kind) || typeof ref !== "string" || ref.length > 120) continue;
    if (out.some((x) => x.kind === kind && x.ref === ref)) continue;
    out.push({ kind: kind as PinKind, ref, label: typeof label === "string" ? label.slice(0, 160) : ref });
  }
  return out;
}
