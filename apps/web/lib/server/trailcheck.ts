/** The AI check on an officer's money trail. Reads only her pins and holds; every pin is looked up again against
 *  the bank's records and the rules engine's trace (pro-rata). It says what her pins show, which don't belong to
 *  this case, how much money her trail still misses and from which account it left, and how her holds compare
 *  with the victims' money. It never says hold or don't hold. */
import { createHash } from "node:crypto";
import { W, model, holderName, caseById } from "./world";
import { TRAIL_KINDS, TRAIL_TITLE, type TrailPin, type TrailHolds } from "@/lib/trail";
import { inr, when } from "@/lib/format";

export interface TrailCheck {
  shows: string[]; offCase: string[];
  missing: { account: string; name: string; amount: number }[];
  unpaid: { count: number; amount: number };
  holds: { account: string; name: string; mine: number | null; verdict: "none" | "above" | "below" | "matches" }[];
  /** Reported = in accounts + gone + small pieces + not yet found (to the rupee, rounding aside). */
  balance: { reported: number; inAccounts: number; gone: number; small: number; notFound: number };
  /** Cash-outs she pinned from an account her trail does not reach yet (not counted as gone). */
  loose: string[];
  reached: string[];
}

const txById = new Map(W.txns.map((t) => [t.id, t as typeof t & { where?: string }]));
const isOurs = (id: string) => model().accounts.has(id);

export function reachedOf(pins: TrailPin[]): string[] {
  const out = new Set<string>();
  for (const p of pins) {
    if (p.kind !== "payment" && p.kind !== "move") continue;
    const t = txById.get(p.ref);
    if (t && isOurs(t.to)) out.add(t.to);
  }
  return [...out];
}

export function checkTrail(caseId: string, pins: TrailPin[], holds: TrailHolds): TrailCheck {
  const c = caseById(caseId);
  const empty: TrailCheck = { shows: [], offCase: [], missing: [], unpaid: { count: 0, amount: 0 }, holds: [], balance: { reported: 0, inAccounts: 0, gone: 0, small: 0, notFound: 0 }, reached: [], loose: [] };
  if (!c) return empty;
  const m = model();
  const vset = new Set(c.complaints.map((x) => x.victim));
  const share = (taint: Record<string, number>) => Object.entries(taint).reduce((s, [v, p]) => s + (vset.has(v) ? p : 0), 0);
  const flowBy = new Map(m.trace.flows.map((f) => [f.txnId, f]));
  const exitBy = new Map(m.trace.exits.map((x) => [x.txnId, x]));
  const payTx = new Set(c.complaints.map((x) => x.txnId));
  const name = (id: string) => { const v = m.accounts.get(id); return v ? holderName(v.a) : id; };

  const shows: string[] = [], offCase: string[] = [];
  const good = new Set<string>();
  for (const p of pins) {
    const tag = `${TRAIL_TITLE[p.kind]}: ${p.label}`;
    if (p.kind === "kyc") {
      const v = m.accounts.get(p.ref);
      if (!v || !c.accounts.includes(p.ref)) { offCase.push(tag); continue; }
      const age = Math.round((W.now - v.a.openedAt) / 86_400_000);
      const before = (v.a as typeof v.a & { before?: { text: string } }).before;
      shows.push(`${name(p.ref)}: opened ${age >= 365 ? `${Math.floor(age / 365)} years` : `${age} days`} ago${v.a.kycChangedAt ? ", phone on the account changed recently" : ""}${before ? `. ${before.text}` : ""}`);
      continue;
    }
    const t = txById.get(p.ref);
    if (!t) { offCase.push(tag); continue; }
    if (p.kind === "payment") {
      if (!payTx.has(t.id)) { offCase.push(tag); continue; }
      good.add(t.id);
      shows.push(`${inr(t.amount)} paid by a victim to ${name(t.to)} (${when(t.at)}).`);
    } else if (p.kind === "move") {
      // The engine stops following pieces too small to matter, so a small move can sit in its exits instead.
      const f = flowBy.get(t.id) ?? exitBy.get(t.id);
      if (!f || share(f.taint) <= 0 || !isOurs(t.to)) { offCase.push(tag); continue; }
      good.add(t.id);
      shows.push(`${inr(t.amount)} moved from ${name(t.from)} to ${name(t.to)} (${when(t.at)}).`);
    } else if (p.kind === "gone") {
      const x = exitBy.get(t.id) ?? flowBy.get(t.id);
      if (!x || share(x.taint) <= 0) { offCase.push(tag); continue; }
      good.add(t.id);
      shows.push(`${inr(t.amount)} left ${name(t.from)}: ${t.where ?? t.channel}.`);
    }
  }
  const reached = reachedOf(pins.filter((p) => good.has(p.ref)));

  // Money that left an account on her trail and isn't on it. Pieces under the Rs 1,000 minimum hold are counted
  // as "small pieces" (not worth tracing); bigger ones are what her trail still misses, by account, amount only.
  const rset = new Set(reached);
  const missing: TrailCheck["missing"] = [];
  let small = 0;
  for (const a of reached) {
    let amt = 0;
    for (const f of [...m.trace.flows, ...m.trace.exits]) {
      if (f.from !== a || good.has(f.txnId) || rset.has(f.to)) continue;
      const x = share(f.taint);
      if (x < 1000_00) small += x; else amt += x;
    }
    if (amt >= 1000_00) missing.push({ account: a, name: name(a), amount: Math.round(amt) });
    else small += amt;
  }
  missing.sort((x, y) => y.amount - x.amount);
  const unpaidC = c.complaints.filter((x) => !good.has(x.txnId));
  const unpaid = { count: unpaidC.length, amount: unpaidC.reduce((s, x) => s + (txById.get(x.txnId)?.amount ?? 0), 0) };

  const holdRows: TrailCheck["holds"] = [];
  for (const a of reached) {
    const v = m.accounts.get(a)!;
    const mine = holds[a] ?? null;
    if (mine === null && v.traced < 1000_00) continue;
    const verdict = mine === null ? "none" : mine > v.traced + 100 ? "above" : mine < v.traced * 0.9 ? "below" : "matches";
    holdRows.push({ account: a, name: name(a), mine, verdict });
  }

  const reported = c.complaints.reduce((s, x) => s + (txById.get(x.txnId)?.amount ?? 0), 0);
  const inAccounts = reached.reduce((s, a) => s + share(m.accounts.get(a)!.victimShares), 0);
  let gone = 0;
  const loose: string[] = [];
  for (const p of pins) {
    if (p.kind !== "gone" || !good.has(p.ref)) continue;
    const x = exitBy.get(p.ref) ?? flowBy.get(p.ref)!;
    if (rset.has(x.from)) gone += share(x.taint); else loose.push(`${TRAIL_TITLE.gone}: ${p.label} (from ${name(x.from)})`);
  }
  const notFound = unpaid.amount + missing.reduce((s, x) => s + x.amount, 0);
  return {
    shows, offCase, missing, unpaid, holds: holdRows, loose, reached,
    // Small pieces can loop back into an account already on the trail, so they are what is left once the rest is
    // counted (never more than the pieces actually seen).
    balance: { reported, inAccounts: Math.round(inAccounts), gone: Math.round(gone), notFound,
      small: Math.max(0, Math.min(Math.round(small), reported - Math.round(inAccounts) - Math.round(gone) - notFound)) },
  };
}

export const trailHash = (pins: TrailPin[], holds: TrailHolds) =>
  createHash("sha256").update(JSON.stringify([pins.map((p) => [p.kind, p.ref]), Object.entries(holds).sort()])).digest("hex").slice(0, 16);

export function cleanTrail(rawPins: unknown, rawHolds: unknown): { pins: TrailPin[]; holds: TrailHolds } {
  const pins: TrailPin[] = [];
  for (const p of (Array.isArray(rawPins) ? rawPins : []).slice(0, 600)) {
    if (!p || typeof p !== "object") continue;
    const { kind, ref, label } = p as Record<string, unknown>;
    if (typeof kind !== "string" || !(TRAIL_KINDS as readonly string[]).includes(kind) || typeof ref !== "string" || ref.length > 40) continue;
    if (pins.some((x) => x.kind === kind && x.ref === ref)) continue;
    pins.push({ kind: kind as TrailPin["kind"], ref, label: typeof label === "string" ? label.slice(0, 160) : ref });
  }
  const holds: TrailHolds = {};
  if (rawHolds && typeof rawHolds === "object") {
    for (const [k, v] of Object.entries(rawHolds as Record<string, unknown>).slice(0, 200)) {
      if (/^P\d{5}$/.test(k) && typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1e12) holds[k] = v;
    }
  }
  return { pins, holds };
}
