/**
 * The AI check on an engineer's trace. It runs on the server and reads only the pins: each pin is a reference
 * (a number, a handset, a shop…) and the facts are looked up again here, so nothing typed in the browser counts.
 * It says what the pins show, which pins don't belong to this alert, and for each possible action what evidence
 * is still missing. It never looks anything up that he didn't pin, and it never says which action is right.
 */
import { createHash } from "node:crypto";
import { alertById, ACTION_LABEL, type TAction } from "./telco";
import { T, norm, I } from "./telcodata";
import { sisters, DOT_SIM_LIMIT } from "./telcogroup";
import { callRecords, subscriber, handset, shopLookup, kycDoc, switchLog, route, tower } from "./lookup";

import { PIN_KINDS, PIN_TITLE, type PinKind, type PinRef } from "@/lib/pins";
export type { PinRef };
export type Tool = "sub" | "cdr" | "imei" | "shop" | "tower" | "switch" | "route" | "doc" | "group";

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

type Scope = NonNullable<ReturnType<typeof scope>>;
const CHECKS: readonly PinKind[] = ["police", "dlt", "chakshu", "swap", "forwarding", "bulk"];
export const pinKey = (p: Pick<PinRef, "kind" | "ref">) => `${p.kind}::${p.ref}`;

function belongs(p: PinRef, s: Scope): boolean {
  const key = p.ref.split("|")[0]!;
  switch (p.kind) {
    case "handset": case "sims": return s.imeis.has(key);
    case "group": case "number": case "sim": case "spoof": case "police": case "dlt": case "chakshu": case "swap": case "forwarding": case "bulk": return s.numbers.has(norm(key));
    case "stats": return s.imeis.has(key) || s.numbers.has(norm(key));
    case "tower": return s.towers.has(key);
    case "shop": return s.shops.has(key);
    case "doc": return s.docs.has(key);
    case "route": return s.routes.has(key);
    case "call": { const c = I().calls.find((x) => x.id === key); return Boolean(c && (s.imeis.has(c.imei) || s.numbers.has(norm(c.from)) || s.numbers.has(norm(c.to)))); }
  }
}

/** Whether the record a pin points to holds that fact. For the six checks on a number (police letter, sender
 *  registration, citizen reports, swaps, forwarding, company papers) a "no" is a finding too: he can pin that the
 *  record holds nothing, and it counts as evidence (against some actions). For the rest, a "no" pin is empty. */
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
    case "group": return sisters(key).rows.length > 1;
    case "bulk": return Boolean(subscriber(key).bulk);
  }
}

/** A sign of fraud (or of innocence), worked out from his pins with the data that shows it. */
export interface TraceSignal { key: string; label: string; seen: boolean; why: string }

export interface TraceCheck {
  shows: string[]; offAlert: string[]; empty: string[]; signals: TraceSignal[]; pins: PinMeaning[];
  actions: { action: TAction; label: string; ready: boolean; missing: string[]; steps: { text: string; tool: Tool; q: string }[] }[];
}

/** What one pin says about each action: evidence for it, against it, or neither. Worked out from the record. */
export interface PinMeaning { key: string; kind: PinKind; label: string; positive: boolean; says: string; for: TAction[]; against: TAction[] }

const BLOCKS: TAction[] = ["BAR_IMEI", "BLOCK_ROUTE", "DISCONNECT", "LABEL_SPAM"];
const YEAR = 365 * 86_400_000;

function meaning(p: PinRef, positive: boolean): PinMeaning {
  const key = p.ref.split("|")[0]!;
  const m = (says: string, f: TAction[] = [], ag: TAction[] = []): PinMeaning => ({ key: pinKey(p), kind: p.kind, label: `${PIN_TITLE[p.kind]}: ${p.label}`, positive, says, for: f, against: ag });
  switch (p.kind) {
    case "dlt": return positive ? m("a registered business sender", ["GENUINE", "CLEAR_REPORT"], BLOCKS) : m(`no sender registration on ${key}`, [], ["GENUINE", "CLEAR_REPORT"]);
    case "bulk": return positive ? m("company papers checked at the enterprise desk", ["GENUINE"], ["BAR_IMEI", "BLOCK_ROUTE", "DISCONNECT"]) : m(`no company papers on ${key}`, [], ["GENUINE"]);
    case "police": return positive ? m("a police letter asking to keep the line live", ["KEEP_LIVE"], ["DISCONNECT", "BAR_IMEI", "REVERIFY", "BLOCK_ROUTE"]) : m(`no police letter on ${key}`, [], ["KEEP_LIVE"]);
    case "chakshu": {
      if (!positive) return m(`no citizen reports on ${key}`, [], ["LABEL_SPAM"]);
      const kind = subscriber(key).chakshuKind ?? "";
      return /pretend|otp|impersonat/i.test(kind) ? m(`citizen reports of a caller who ${kind.charAt(0).toLowerCase()}${kind.slice(1)}`, ["DISCONNECT", "LABEL_SPAM"], ["GENUINE", "CLEAR_REPORT"]) : m(`citizen reports (${kind.toLowerCase() || "no category"})`, ["LABEL_SPAM"]);
    }
    case "swap": {
      if (!positive) return m(`no SIM swap on ${key}`, [], ["REVERIFY"]);
      const r = subscriber(key);
      const last = r.swaps?.at(-1)?.at ?? 0;
      return r.activatedAt && last - r.activatedAt >= YEAR ? m("a long-time owner's SIM was swapped", ["REVERIFY"], ["DISCONNECT"]) : m("a SIM swap on a new connection", ["DISCONNECT", "REVERIFY"]);
    }
    case "forwarding": return positive ? m("calls forwarded to an unknown number", ["DISCONNECT", "KEEP_LIVE"]) : m(`no call forwarding on ${key}`);
    case "stats": {
      const [k, f, t] = p.ref.split("|");
      const r = callRecords(k!, f || null, t || null).stats;
      if (r.total >= 20 && r.inRatio >= 0.2) return m(`${Math.round(r.inRatio * 100)}% of calls come in: two-way traffic`, ["GENUINE"], ["BAR_IMEI", "BLOCK_ROUTE", "LABEL_SPAM", "DISCONNECT"]);
      if (r.total >= 20 && r.inRatio < 0.05) return m("almost no calls come in", ["BAR_IMEI", "BLOCK_ROUTE", "DISCONNECT"], ["GENUINE", "CLEAR_REPORT"]);
      return m("call statistics");
    }
    case "handset": {
      const h = handset(key);
      return h.kind === "gateway" && h.sims.length > 5 ? m(`a multi-SIM gateway with ${h.sims.length} SIMs`, ["BAR_IMEI", "BLOCK_ROUTE"], ["GENUINE"]) : m("the handset");
    }
    case "doc": { const r = kycDoc(key); return r.sims.length > DOT_SIM_LIMIT ? m(`${r.sims.length} SIMs on one person's ID`, ["BAR_IMEI", "BLOCK_ROUTE"], ["GENUINE"]) : m("the ID document"); }
    case "group": { const r = sisters(key); return r.overLimit ? m(`${r.docCount} SIMs on one person's ID`, ["BAR_IMEI", "BLOCK_ROUTE"], ["GENUINE"]) : m("the linked SIMs"); }
    case "shop": { const r = shopLookup(key); return r.found && (!r.verified || r.docsReused.length > 0) ? m("a shop that reused ID documents or is not verified", ["BAR_IMEI", "BLOCK_ROUTE"]) : m("the shop"); }
    case "spoof": return m("calls that carried someone else's caller ID", ["BLOCK_ROUTE", "BAR_IMEI"]);
    default: return m(PIN_TITLE[p.kind].toLowerCase());
  }
}

/** The pins of a trace sorted out: what belongs to the alert, what holds, and what each one means. */
function sortPins(s: Scope, pins: PinRef[]) {
  const inScope = pins.filter((p) => belongs(p, s));
  const pos = inScope.filter((p) => holds(p));
  const neg = inScope.filter((p) => !holds(p) && CHECKS.includes(p.kind));
  const empty = inScope.filter((p) => !holds(p) && !CHECKS.includes(p.kind));
  const meanings = [...pos.map((p) => meaning(p, true)), ...neg.map((p) => meaning(p, false))];
  return { inScope, pos, neg, empty, meanings, offAlert: pins.filter((p) => !belongs(p, s)) };
}

type Need = [boolean, string, Tool, string];
/** For each action, the evidence it needs and whether these (holding, in-scope) pins provide it. */
function needs(s: Scope, inPins: PinRef[]): Record<TAction, Need[]> {
  const has = (k: PinKind) => inPins.some((p) => p.kind === k);
  const hs = inPins.filter((p) => p.kind === "handset");
  const attached = new Set(T.attach.filter((x) => s.imeis.has(x.imei)).map((x) => norm(x.msisdn)));
  const pinnedSims = new Set<string>();
  for (const p of inPins) if (p.kind === "sims") for (const x of T.attach) if (x.imei === p.ref) pinnedSims.add(norm(x.msisdn));
  for (const p of inPins) if (p.kind === "sim") pinnedSims.add(norm(p.ref));
  const st = inPins.filter((p) => p.kind === "stats").map((p) => { const [k, f, t] = p.ref.split("|"); return callRecords(k!, f || null, t || null); });
  const statsHandset = st.some((r) => r.by === "handset");
  const statsAny = st.length > 0;
  const enoughSims = attached.size <= 1 || pinnedSims.size >= Math.ceil(attached.size / 2);
  const impersonation = inPins.some((p) => p.kind === "chakshu" && /pretend|otp|impersonat/i.test(subscriber(p.ref).chakshuKind ?? ""));
  // Where each missing clue is found: the tool and what to type. The AI points the way; he still looks it up and pins it.
  const imei = s.a.kind === "IMEI" ? s.a.value : [...s.imeis][0] ?? "";
  const num = s.a.kind === "MSISDN" ? s.a.value : T.attach.find((x) => x.imei === imei)?.msisdn ?? "";
  const policeSim = (s.a.kind === "MSISDN" ? [s.a.value] : T.attach.filter((x) => x.imei === imei).map((x) => x.msisdn)).find((n) => I().sub.get(norm(n))?.police) ?? num;
  return {
    BAR_IMEI: [[hs.length > 0, "the handset (look it up and pin it)", "imei", imei], [enoughSims && pinnedSims.size > 0, "the SIMs in the handset (pin them all)", "imei", imei], [statsHandset, "call statistics for the handset", "cdr", imei], [has("tower"), "the tower it uses (click one of the handset's towers, then pin it)", "imei", imei]],
    BLOCK_ROUTE: [[has("route"), "the route lookup (who else uses it)", "switch", num], [hs.length > 0, "the handset", "imei", imei], [statsAny, "call statistics", "cdr", imei || num]],
    KEEP_LIVE: [[has("police"), "the police letter on file", "sub", policeSim], [has("number") || hs.length > 0, "the number or handset", "sub", num]],
    DISCONNECT: [[has("number"), "the number's subscriber record", "sub", num], [statsAny, "call statistics", "cdr", num], [has("swap") || has("forwarding") || has("spoof") || impersonation, "what makes the line bad (a swap, forwarding, the switch log, or reports of what the calls were)", "sub", num]],
    REVERIFY: [[has("number"), "the number's subscriber record", "sub", num], [has("swap"), "the SIM swap history", "sub", num]],
    LABEL_SPAM: [[has("number"), "the number", "sub", num], [has("chakshu"), "the citizen reports", "sub", num], [statsAny, "call statistics", "cdr", num]],
    CLEAR_REPORT: [[has("number"), "the number", "sub", num], [has("chakshu"), "the citizen reports", "sub", num], [has("dlt"), "the business sender registration", "sub", num]],
    GENUINE: [[hs.length > 0 || has("number"), "the handset or number", "imei", imei || num], [has("dlt") || has("bulk"), "proof it is a business: the sender registration or the company papers", "sub", num], [statsAny, "call statistics (both directions)", "cdr", imei || num]],
  };
}

export function checkTrace(alertId: string, pins: PinRef[]): TraceCheck {
  const s = scope(alertId);
  if (!s) return { shows: [], offAlert: [], empty: [], signals: [], actions: [], pins: [] };
  const sorted = sortPins(s, pins);
  const name = (p: PinRef) => `${PIN_TITLE[p.kind]} ${p.label}`;
  const offAlert = sorted.offAlert.map(name);
  const empty = sorted.empty.map(name);
  const inPins = sorted.pos;
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
  for (const r of st) shows.push(`${r.stats.total} calls (${r.by} ${r.key}): ${r.stats.inRatio > 0 && r.stats.inRatio < 0.01 ? "under 1%" : `${Math.round(r.stats.inRatio * 100)}%`} incoming, ${r.stats.perDay} different numbers a day, ${r.stats.avgSec} s on average, ${r.stats.towers.length} tower${r.stats.towers.length === 1 ? "" : "s"}.`);
  for (const p of inPins.filter((x) => x.kind === "tower")) { const t = tower(p.ref); if (t.found) shows.push(`Tower ${t.id} (${t.district}).`); }
  for (const p of inPins.filter((x) => x.kind === "shop")) { const r = shopLookup(p.ref); if (r.found) shows.push(`Shop ${r.name} (${r.pos}) is ${r.verified ? "verified" : "NOT verified"}; ${r.sims.length} SIMs activated there${r.docsReused.length ? `, ${r.docsReused.length} ID document${r.docsReused.length > 1 ? "s" : ""} used more than once` : ""}.`); }
  for (const p of inPins.filter((x) => x.kind === "doc")) { const r = kycDoc(p.ref); if (r.found) shows.push(`ID document ${r.doc}: ${r.note}`); }
  for (const p of inPins.filter((x) => x.kind === "spoof")) { const r = switchLog(p.ref); if (r.found) shows.push(`Switch log for ${p.ref}: ${r.note}`); }
  for (const p of inPins.filter((x) => x.kind === "route")) { const r = route(p.ref); if (r.found) shows.push(`${r.id}: ${r.note}`); }
  const groupsF = inPins.filter((x) => x.kind === "group").map((p) => sisters(p.ref)).filter((r) => r.found);
  for (const r of groupsF) shows.push(`Linked SIMs of ${r.anchor}: ${r.note}`);
  const sub = (p: PinRef) => subscriber(p.ref);
  for (const p of inPins.filter((x) => x.kind === "police")) { const r = sub(p); if (r.police) shows.push(`Police letter ${r.police.ref} on ${r.msisdn}: ${r.police.text}`); }
  for (const p of inPins.filter((x) => x.kind === "dlt")) { const r = sub(p); if (r.dlt) shows.push(`${r.msisdn} is a registered sender (${r.dlt.header}, ${r.dlt.entity}).`); }
  for (const p of inPins.filter((x) => x.kind === "chakshu")) { const r = sub(p); shows.push(`${r.chakshu ?? 0} citizen reports on ${r.msisdn}.`); }
  for (const p of inPins.filter((x) => x.kind === "swap")) { const r = sub(p); if (r.swaps?.length) shows.push(`${r.msisdn} owned since ${new Date(r.activatedAt!).getFullYear()}, swapped at ${r.swaps.at(-1)!.shop}.`); }
  for (const p of inPins.filter((x) => x.kind === "forwarding")) { const r = sub(p); if (r.forwarding) shows.push(`${r.msisdn} forwards its calls to ${r.forwarding}.`); }

  for (const p of sorted.neg) shows.push(`${PIN_TITLE[p.kind]} on ${p.ref}: none on record.`);
  const need = needs(s, inPins);
  const actions = s.a.options.map((o) => {
    const left = need[o].filter(([ok]) => !ok);
    return { action: o, label: ACTION_LABEL[o], ready: left.length === 0, missing: left.map(([, t]) => t), steps: left.map(([, text, tool, q]) => ({ text, tool, q })) };
  });
  // Signs, each worked out from what he pinned. "Not pinned yet" names the lookup that would show it, never the answer.
  const hsF = hs.filter((h) => h.found);
  const shopsF = inPins.filter((p) => p.kind === "shop").map((p) => shopLookup(p.ref)).filter((r) => r.found);
  const docsF = inPins.filter((p) => p.kind === "doc").map((p) => kycDoc(p.ref)).filter((r) => r.found);
  const sig = (key: string, label: string, seen: boolean, yes: string, no: string, can: boolean): TraceSignal =>
    ({ key, label, seen, why: seen ? yes : can ? no : `Not pinned yet: ${no}` });
  const maxSims = Math.max(0, ...hsF.map((h) => h.sims.length));
  const minIn = st.length ? Math.min(...st.map((r) => r.stats.inRatio)) : 1;
  const oneTower = st.some((r) => r.stats.total >= 20 && r.stats.towers.length === 1);
  const reused = shopsF.some((r) => r.docsReused.length > 0) || docsF.some((r) => r.sims.length > 1) || groupsF.some((r) => r.docCount > 1);
  const maxDoc = Math.max(0, ...docsF.map((r) => r.sims.length), ...groupsF.map((r) => (r.overLimit || r.docCount <= DOT_SIM_LIMIT ? r.docCount : 0)));
  const swapNo = inPins.find((p) => p.kind === "swap"), spoofNo = inPins.find((p) => p.kind === "spoof"), dltNo = inPins.find((p) => p.kind === "dlt");
  const signals: TraceSignal[] = [
    sig("many", "Many SIMs used in one device", maxSims > 5, `${maxSims} SIMs have sat in the pinned handset.`, hsF.length ? `The pinned handset holds ${maxSims} SIM${maxSims === 1 ? "" : "s"} (a phone holds 1 or 2).` : "look up the handset and pin it.", hsF.length > 0),
    sig("gateway", "The device is a multi-SIM gateway, not a phone", hsF.some((h) => h.kind === "gateway"), `The handset's first 8 digits say: ${hsF.find((h) => h.kind === "gateway")?.model ?? ""}.`, hsF.length ? `The handset is a ${hsF[0]!.model?.toLowerCase()}.` : "the handset (its first 8 digits tell the device type).", hsF.length > 0),
    sig("noin", "Almost no incoming calls", st.length > 0 && minIn < 0.05, minIn === 0 ? "None of the calls in your statistics came in; they all went out." : `Only ${minIn < 0.01 ? "under 1%" : `${Math.round(minIn * 100)}%`} of the calls in your statistics came in.`, st.length ? `${Math.round(minIn * 100)}% of calls came in, a normal share.` : "call statistics (look up call records and pin the statistics).", st.length > 0),
    sig("tower", "Never moves from one tower", oneTower, "All calls in your statistics used one tower.", st.length ? "Calls used more than one tower." : "call statistics.", st.length > 0),
    sig("batch", "SIMs bought in a batch at one shop, on reused IDs", reused, "A pinned shop or ID document shows one ID used for several SIMs.", shopsF.length + docsF.length ? "The pinned shop or document shows no reused ID." : "the shop that sold the SIMs, or the ID document on a SIM.", shopsF.length + docsF.length > 0),
    sig("limit", `One person's ID holds more than ${DOT_SIM_LIMIT} SIMs (DoT's limit)`, maxDoc > DOT_SIM_LIMIT, `A pinned ID document or linked-SIM group shows ${maxDoc} SIMs on one person's ID.`, docsF.length + groupsF.length ? `The most SIMs on one pinned ID is ${maxDoc}.` : "the ID document on a SIM, or its linked SIMs.", docsF.length + groupsF.length > 0),
    sig("spoof", "Calls carried someone else's caller ID", Boolean(spoofNo), `The switch log for ${spoofNo?.ref ?? ""} shows calls that carried another number.`, "the switch log for the number victims saw.", false),
    sig("business", "Registered business traffic", Boolean(dltNo), `${dltNo?.ref ?? ""} is a registered business sender.`, "the number's business sender registration (on the subscriber record).", false),
    sig("owner", "Long-time owner lost the SIM (swap)", Boolean(swapNo), `${swapNo?.ref ?? ""} was swapped; the owner had it for years.`, "the SIM swap history (on the subscriber record).", false),
  ];
  return { shows, offAlert, empty, signals, actions, pins: sorted.meanings };
}

/** His call, checked against his own pins: the pins he cites must give the action what it needs and must not argue
 *  against it, and every pin of his that argues against it needs an answer: another of his pins that supports it. */
export interface CallCheck {
  ready: boolean; missing: string[]; badCites: string[]; cited: string[];
  against: { key: string; label: string; says: string; answer: string | null; options: { key: string; label: string; says: string }[] }[];
  problems: string[];
}
export function checkCall(alertId: string, pins: PinRef[], action: TAction, cited: string[], answers: Record<string, string>): CallCheck {
  const s = scope(alertId);
  if (!s) return { ready: false, missing: [], badCites: [], cited: [], against: [], problems: ["Unknown alert."] };
  const sorted = sortPins(s, pins);
  const byKey = new Map(sorted.meanings.map((m) => [m.key, m]));
  const citedSet = new Set(cited.filter((k) => byKey.has(k)));
  // What the thing is (the handset, the number, its SIMs, tower, route) counts as it is; the evidence must be cited.
  const IDENTITY: readonly PinKind[] = ["handset", "number", "sim", "sims", "tower", "route", "call"];
  const citedPins = sorted.pos.filter((p) => citedSet.has(pinKey(p)) || IDENTITY.includes(p.kind));
  const missing = needs(s, citedPins)[action].filter(([ok]) => !ok).map(([, t]) => t);
  const badCites = [...citedSet].map((k) => byKey.get(k)!).filter((m) => m.against.includes(action)).map((m) => m.label);
  const supporters = sorted.meanings.filter((m) => m.for.includes(action));
  const against = sorted.meanings.filter((m) => m.against.includes(action)).map((m) => {
    const a = answers[m.key];
    return { key: m.key, label: m.label, says: m.says, answer: a && supporters.some((x) => x.key === a) ? a : null, options: supporters.map((x) => ({ key: x.key, label: x.label, says: x.says })) };
  });
  const verb = ACTION_LABEL[action].toLowerCase();
  const problems = [
    ...(citedSet.size === 0 ? ["Tick the pins your call rests on."] : missing.length ? [`The pins you ticked don't yet give it: ${missing.join("; ")}.`] : []),
    ...badCites.map((l) => `${l} argues against "${verb}", so it can't support it. Untick it.`),
    ...against.filter((x) => !x.answer).map((x) => x.options.length ? `${x.label} says ${x.says}. Answer it with one of your pins that supports this call.` : `${x.label} says ${x.says}, and none of your pins answers it. Find evidence that does, or choose another action.`),
  ];
  return { ready: problems.length === 0, missing, badCites, cited: [...citedSet], against, problems };
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
