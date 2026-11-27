/**
 * Police requests for call records, as they reach Telco-A's desk. Imran vets each one before anything leaves:
 * who sent it (the officer directory, not the letter), whether the station really sent it (a call back on the
 * directory number, never the number in the email), whether each number belongs to the case, and whether the
 * dates fit the purpose. Then he releases what was asked, releases less, or refuses. Records go to police only.
 *
 * The requests are built from the same fictional world. Three carry traps that real desks meet: a request from a
 * hacked official mailbox (the address and case number are real; only the call back shows it), a one-digit slip
 * that would hand over a stranger's calls, and an Inspector asking for a hospital line's whole year with no case.
 *
 * The rank rule (Superintendent of Police or above) is as reported in news of a 2019 MHA/DoT tightening; the order
 * itself is not checked. The 90-day line is Telco-A's own policy in this demo, not a law.
 */
import { W } from "./world";
import { T, norm } from "./telcodata";

const DAY = 86_400_000;
export const LEA_MAX_DAYS = 90;
export const RANK_OK = /Superintendent|Commissioner|Inspector General|Director General/;

export interface Officer { name: string; rank: string; station: string; email: string; phone: string }
/** The state police officer directory Telco-A's nodal desk keeps (fictional). */
export const OFFICERS: Officer[] = [
  { name: "Ajay Kumar Singh", rank: "Superintendent of Police (Cyber)", station: "Cyber Crime PS, Gaya", email: "sp-cyber.gaya@bihar.police.demo", phone: "+91 631 222 0451" },
  { name: "Meenakshi Iyer", rank: "Superintendent of Police (Cyber)", station: "Cyber Crime PS, Patna", email: "sp-cyber.patna@bihar.police.demo", phone: "+91 612 221 7730" },
  { name: "Rakesh Tiwari", rank: "Inspector", station: "Kothrud PS, Pune", email: "pi.kothrud@mh.police.demo", phone: "+91 20 2538 1100" },
  { name: "Dinesh Yadav", rank: "Sub-Inspector", station: "Cyber Crime PS, Bengaluru", email: "si.cyber.blr@ka.police.demo", phone: "+91 80 2294 3301" },
];

export type LeaOutcome = "RELEASE" | "NARROW" | "REFUSE";
export interface LeaRequest {
  id: string; receivedAt: number; fromEmail: string; officer: string; rankWritten: string; station: string; caseRef: string; purpose: string;
  numbers: string[]; from: number; to: number; urgent: boolean; signed: string;
  /** What the station says when called back on its directory number. */
  callback: { sent: boolean; text: string };
}

const fmt = (t: number) => new Date(t + 19_800_000).toISOString().slice(0, 10);
const dayStart = (t: number) => Math.floor((t + 19_800_000) / DAY) * DAY - 19_800_000;

let cache: LeaRequest[] | null = null;
export function leaRequests(): LeaRequest[] {
  if (cache) return cache;
  const now = W.now;
  const out: LeaRequest[] = [];
  const rig = (id: string) => W.rigs.find((r) => r.id === id);
  const callsOf = (imei: string) => W.calls.filter((c) => c.imei === imei).map((c) => c.at);
  const r1 = rig("RIG-1"), r2 = rig("RIG-2");
  if (r1) {
    const ts = callsOf(r1.imei);
    const sims = [...new Set(W.calls.filter((c) => c.imei === r1.imei).map((c) => c.realSim))].slice(0, 2);
    out.push({
      id: "LEA-1", receivedAt: now - 2 * DAY + 3_600_000, fromEmail: OFFICERS[0]!.email, officer: OFFICERS[0]!.name, rankWritten: OFFICERS[0]!.rank, station: OFFICERS[0]!.station,
      caseRef: "FIR 311/2026, Cyber Crime PS, Gaya", purpose: "SIM-box calls to bank customers who then lost money. We need these SIMs' call records to find who bought and ran them.",
      numbers: sims, from: dayStart(Math.min(...ts)), to: dayStart(Math.max(...ts)) + DAY - 1, urgent: false, signed: "Digitally signed, Ajay Kumar Singh, SP (Cyber), Gaya",
      callback: { sent: true, text: "The SP's office confirms: Ajay Kumar Singh sent this request on FIR 311/2026." },
    });
    // The same mailbox, the same FIR, a stranger's number: the mailbox was hacked. Only the call back shows it.
    const stranger = T.subscribers.find((s) => s.kycName && !s.kycDoc.startsWith("Company") && s.pos.startsWith("POS-") && !s.swaps.length && s.chakshu === 0 && Number(norm(s.msisdn).slice(-1)) === 4) ?? T.subscribers[0]!;
    out.push({
      id: "LEA-2", receivedAt: now - 5 * 3_600_000, fromEmail: OFFICERS[0]!.email, officer: OFFICERS[0]!.name, rankWritten: OFFICERS[0]!.rank, station: OFFICERS[0]!.station,
      caseRef: "FIR 311/2026, Cyber Crime PS, Gaya", purpose: "EMERGENCY: a suspect in FIR 311/2026 is threatening a witness. Send this number's call records and last locations within one hour.",
      numbers: [stranger.msisdn], from: now - 60 * DAY, to: now, urgent: true, signed: "Digitally signed, Ajay Kumar Singh, SP (Cyber), Gaya",
      callback: { sent: false, text: "The SP's office says they sent no such request today. FIR 311/2026 is the SIM-box case, and this number is not in it. They are reporting the mailbox as compromised." },
    });
  }
  if (r2) {
    const ts = callsOf(r2.imei);
    const sims = [...new Set(W.calls.filter((c) => c.imei === r2.imei).map((c) => c.realSim))];
    const first = r2.sims[0]!.msisdn, d = norm(first);
    const slip = `+91 ${d.slice(0, 5)} ${d.slice(5, 8)}${d[9]}${d[8]}`;
    const real = T.subscribers.find((s) => norm(s.msisdn) === norm(slip));
    const others = sims.filter((x) => norm(x) !== d).slice(0, 2);
    out.push({
      id: "LEA-3", receivedAt: now - DAY - 7_200_000, fromEmail: OFFICERS[1]!.email, officer: OFFICERS[1]!.name, rankWritten: OFFICERS[1]!.rank, station: OFFICERS[1]!.station,
      caseRef: "FIR 528/2026, Cyber Crime PS, Patna", purpose: "Calls from a handset holding several SIMs to victims of investment fraud. Records of its SIMs for the weeks of the calls.",
      numbers: [...others, real ? real.msisdn : slip], from: dayStart(Math.min(...ts)), to: dayStart(Math.max(...ts)) + DAY - 1, urgent: false, signed: "Digitally signed, Meenakshi Iyer, SP (Cyber), Patna",
      callback: { sent: true, text: "The SP's office confirms Meenakshi Iyer sent this request on FIR 528/2026." },
    });
  }
  out.push({
    id: "LEA-4", receivedAt: now - 3 * DAY, fromEmail: OFFICERS[2]!.email, officer: OFFICERS[2]!.name, rankWritten: OFFICERS[2]!.rank, station: OFFICERS[2]!.station,
    caseRef: "Complaint 77/2026 (no FIR)", purpose: "Residents complain of nuisance calls from this number. Send all its call records for the past year.",
    numbers: ["+91 20 4477 0812"], from: now - 365 * DAY, to: now, urgent: false, signed: "Signed, Rakesh Tiwari, Inspector, Kothrud PS",
    callback: { sent: true, text: "Kothrud PS confirms Inspector Tiwari sent it. There is no FIR yet; it is a complaint from residents." },
  });
  const fwd = T.subscribers.find((s) => s.police);
  if (fwd) {
    out.push({
      id: "LEA-5", receivedAt: now - 20 * 3_600_000, fromEmail: OFFICERS[1]!.email, officer: OFFICERS[1]!.name, rankWritten: OFFICERS[1]!.rank, station: OFFICERS[1]!.station,
      caseRef: `${fwd.police!.ref} (letter on file), Cyber Crime PS, Patna`, purpose: "This phone sits on a bank account rented to a fraud gang and forwards its calls and OTPs. The account was opened 12 days ago. Send all records since the SIM was activated.",
      numbers: [fwd.msisdn], from: fwd.activatedAt, to: now, urgent: false, signed: "Digitally signed, Meenakshi Iyer, SP (Cyber), Patna",
      callback: { sent: true, text: "The SP's office confirms the request, and that the case is about the last two weeks, since the bank account was opened." },
    });
  }
  cache = out;
  return out;
}
export const leaById = (id: string) => leaRequests().find((x) => x.id === id);

/** The right outcome on each request, for the audit sample only (never shown to the analyst before he decides). */
export const LEA_EXPECTED: Record<string, LeaOutcome> = { "LEA-1": "RELEASE", "LEA-2": "REFUSE", "LEA-3": "NARROW", "LEA-4": "REFUSE", "LEA-5": "NARROW" };

/** The directory entry for a name, if any (he types the name; the letter's own contact details are never used). */
export function officerLookup(q: string): { found: boolean; note: string; officer?: Officer } {
  const n = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.length < 3) return { found: false, note: "Type the officer's name as it appears on the request." };
  const o = OFFICERS.find((x) => x.name.toLowerCase() === n || x.name.toLowerCase().includes(n));
  return o ? { found: true, note: `${o.name}: ${o.rank}, ${o.station}.`, officer: o } : { found: false, note: "No officer by that name in the directory." };
}

/** The rule-based assistant's reading of a letter: what it says, set against the checklist. It reads only the
 *  letter, so it can't tell a hacked mailbox from a real one; it says so. */
export function leaPreRead(r: LeaRequest): string[] {
  const days = Math.round((r.to - r.from) / DAY);
  const o = OFFICERS.find((x) => x.name === r.officer);
  return [
    `Rank as written: ${r.rankWritten}. ${RANK_OK.test(r.rankWritten) ? "That is Superintendent rank or above, if the directory agrees." : "That is below Superintendent rank."}`,
    `Sent from ${r.fromEmail}. ${o && o.email === r.fromEmail ? "The address matches the directory. A hacked mailbox would match too: only a call back tells them apart." : "The address is not the one in the directory."}`,
    `Case: ${r.caseRef}. ${/FIR/.test(r.caseRef) ? "An FIR is named." : "No FIR is named."}`,
    `${r.numbers.length} number${r.numbers.length === 1 ? "" : "s"} asked for, over ${days} day${days === 1 ? "" : "s"} (${fmt(r.from)} to ${fmt(r.to)}).${days > LEA_MAX_DAYS ? ` That is over Telco-A's ${LEA_MAX_DAYS}-day line.` : ""}`,
    r.urgent ? "Marked as an emergency with a short deadline. Pressure to skip the checks is common in fake requests." : "No emergency claimed.",
    "I have not looked up any number or called anyone. Those checks are yours.",
  ];
}
export { fmt as leaDay };
