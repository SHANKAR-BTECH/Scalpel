/**
 * Telco-A's work beyond one alert: the "sister" SIMs bought on the same ID document or in the same batch at the
 * same shop, and the shop itself. Everything is read from Telco-A's own records. The rules here say who must NOT
 * be swept up (long-time owners and registered enterprises) — the analyst has to spot them; the server refuses
 * a group action that still includes one, and says who and why.
 */
import { T, I, norm } from "./telcodata";
import type { Alert, TAction } from "./telco";
import { W } from "./world";

const DAY = 86_400_000;
export const DOT_SIM_LIMIT = 9; // connections one person may hold across all operators (DoT)

export interface SisterRow {
  msisdn: string; kycName: string; kycDoc: string; pos: string; activatedAt: number; status: string;
  callsOut: number; callsIn: number; handsets: string[]; why: ("same ID" | "same batch")[]; ownerYears: number;
}
export interface SisterResult { found: boolean; note: string; anchor?: string; doc?: string; pos?: string; docCount: number; overLimit: boolean; rows: SisterRow[] }

/** Who else was bought with this SIM: same ID document (anywhere), or the same shop within two days. */
export function sisters(q: string): SisterResult {
  const a = I().sub.get(norm(q));
  if (!a) return { found: false, note: "No Telco-A subscriber with this number.", docCount: 0, overLimit: false, rows: [] };
  const rows: SisterRow[] = [];
  for (const s of T.subscribers) {
    const why: SisterRow["why"] = [];
    if (s.kycDoc === a.kycDoc) why.push("same ID");
    if (s.pos === a.pos && Math.abs(s.activatedAt - a.activatedAt) <= 2 * DAY) why.push("same batch");
    if (!why.length) continue;
    const out = I().byNumber.get(norm(s.msisdn)) ?? [];
    rows.push({
      msisdn: s.msisdn, kycName: s.kycName, kycDoc: s.kycDoc, pos: s.pos, activatedAt: s.activatedAt, status: s.status,
      callsOut: out.filter((c) => norm(c.from) === norm(s.msisdn)).length, callsIn: out.filter((c) => norm(c.to) === norm(s.msisdn)).length,
      handsets: [...new Set(T.attach.filter((x) => norm(x.msisdn) === norm(s.msisdn)).map((x) => x.imei))],
      why, ownerYears: Math.max(0, Math.floor((W.now - s.activatedAt) / (365 * DAY))),
    });
  }
  rows.sort((x, y) => y.activatedAt - x.activatedAt); // newest first: the SIMs bought in the burst lead
  const docCount = T.subscribers.filter((s) => s.kycDoc === a.kycDoc).length;
  const enterprise = a.kycDoc.startsWith("Company PAN");
  return {
    found: true, anchor: a.msisdn, doc: a.kycDoc, pos: a.pos, docCount, overLimit: !enterprise && docCount > DOT_SIM_LIMIT, rows,
    note: `${rows.length} SIM${rows.length === 1 ? "" : "s"} share the ID document or the batch with ${a.msisdn}. ${enterprise ? "The ID is a company PAN: bulk connections for a registered business are allowed." : `${docCount} SIM${docCount === 1 ? "" : "s"} on this one person's ID${docCount > DOT_SIM_LIMIT ? `: over DoT's limit of ${DOT_SIM_LIMIT} per person` : docCount === DOT_SIM_LIMIT ? `: at DoT's limit of ${DOT_SIM_LIMIT}` : ""}.`}`,
  };
}

/** Why a SIM must not be swept up in a group action, or null. */
export function protectedReason(msisdn: string): string | null {
  const s = I().sub.get(norm(msisdn));
  if (!s) return "not a Telco-A subscriber";
  if (s.kycDoc.startsWith("Company PAN") || s.dlt || s.endUser) return `${s.msisdn} belongs to a registered business (${s.dlt?.entity ?? s.endUser ?? s.kycName})`;
  const years = (W.now - s.activatedAt) / (365 * DAY);
  const scam = W.calls.filter((c) => norm(c.realSim) === norm(s.msisdn)).map((c) => c.at);
  if (scam.length) {
    // Its own calls reached scam victims. Innocent only if a long-time owner lost the SIM in a swap.
    return years >= 1 && s.swaps.length > 0 ? `${s.msisdn} has had one owner (${s.kycName}) since ${new Date(s.activatedAt).getFullYear()}; the scam calls came from a swapped SIM card` : null;
  }
  const calls = I().byNumber.get(norm(s.msisdn)) ?? [];
  const inn = calls.filter((c) => norm(c.to) === norm(s.msisdn)).length;
  if (years >= 1 && inn > 0) return `${s.msisdn} is a long-time customer (${s.kycName}, since ${new Date(s.activatedAt).getFullYear()}) with normal two-way calls`;
  return null;
}

/** How many SIMs this shop sold on one ID document. */
export const shopDocCount = (pos: string, doc: string) => T.subscribers.filter((x) => x.pos === pos && x.kycDoc === doc).length;

/** A shop can be suspended only when its own records show the abuse: one ID reused for several SIMs. */
export function shopAbuse(pos: string): { ok: boolean; why: string } {
  const s = T.shops.find((x) => x.pos === pos);
  if (!s) return { ok: false, why: "Unknown point of sale." };
  if (pos.startsWith("ENT-")) return { ok: false, why: "This is Telco-A's enterprise desk, not a retail shop." };
  const docs = new Map<string, number>();
  for (const x of T.subscribers) if (x.pos === pos) docs.set(x.kycDoc, (docs.get(x.kycDoc) ?? 0) + 1);
  const reused = [...docs.values()].filter((n) => n >= 3).length;
  return reused ? { ok: true, why: `${reused} ID document${reused === 1 ? "" : "s"} used for 3 or more SIMs here.` } : { ok: false, why: "No ID document is reused for several SIMs at this shop." };
}

/** Who else gets cut off by one action on an alert: facts from Telco-A's records, shown before the decision. */
export interface Blast { lines: string[]; genuine: number; second: boolean }
export function blast(a: Alert, act: TAction): Blast {
  const lines: string[] = [];
  let genuine = 0;
  const contacts = (n: string) => {
    const m = new Map<string, number>();
    for (const c of I().byNumber.get(norm(n)) ?? []) { const o = norm(c.from) === norm(n) ? c.to : c.from; if (norm(c.to) === norm(n)) m.set(o, (m.get(o) ?? 0) + 1); }
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  };
  if (act === "BAR_IMEI") {
    const sims = [...new Set(T.attach.filter((x) => x.imei === a.value).map((x) => x.msisdn))];
    const prot = sims.map((n) => protectedReason(n)).filter((x): x is string => Boolean(x));
    genuine = prot.length;
    lines.push(`${sims.length} SIM${sims.length === 1 ? "" : "s"} inside this handset stop working on Telco-A's network.`);
    if (prot.length) lines.push(`${prot.length} of them ${prot.length === 1 ? "looks" : "look"} genuine: ${prot.slice(0, 2).join("; ")}${prot.length > 2 ? `; and ${prot.length - 2} more` : ""}.`);
    else lines.push("None of those SIMs is a registered business or a long-time customer.");
  } else if (act === "BLOCK_ROUTE") {
    const r = T.routes.find((x) => x.devices.includes(a.value));
    genuine = r?.lines.length ?? 0;
    lines.push(`Every call through ${r?.id ?? "the route"} stops, from ${r?.devices.length ?? 0} flagged device${r?.devices.length === 1 ? "" : "s"}.`);
    if (genuine) lines.push(`${genuine} genuine line${genuine === 1 ? "" : "s"} on the same route go dark too: ${r!.lines.map((l) => l.owner).join(", ")}.`);
    else lines.push("No genuine lines use this route.");
  } else if (act === "DISCONNECT" || act === "REVERIFY") {
    const s = I().sub.get(norm(a.value));
    const why = protectedReason(a.value);
    const c = contacts(a.value);
    if (s) lines.push(`${act === "DISCONNECT" ? "The number is cut off and goes on the revoked list" : "Outgoing calls stop until the owner re-verifies; incoming calls still work"}. On record: ${s.kycName}, since ${new Date(s.activatedAt).getFullYear()}.`);
    if (why) { genuine = 1; lines.push(`This looks like a genuine customer: ${why}.`); }
    if (c.length) lines.push(`${c.length} number${c.length === 1 ? "" : "s"} called it in the records (family, friends or work), e.g. ${c.slice(0, 2).map(([n]) => n).join(", ")}.`);
  } else if (act === "LABEL_SPAM") {
    const s = I().sub.get(norm(a.value));
    lines.push(`Everyone it calls sees a spam warning.${s?.dlt ? ` It is ${s.dlt.entity}'s registered ${s.dlt.type.toLowerCase()} line.` : ""}`);
    if (s?.dlt) genuine = 1;
  } else if (act === "KEEP_LIVE") lines.push("No one is cut off. The line stays on and is watched for the police.");
  else lines.push("No one is cut off.");
  return { lines, genuine, second: act === "BLOCK_ROUTE" && genuine > 0 };
}
