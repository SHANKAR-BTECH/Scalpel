import type { MemoCase, Source } from "./demo-schema";

type Check = MemoCase["checks"][number];

/** Plain words for each rule. Requisition checks already carry their own plain label in `note`. */
export const RULE_PLAIN: Record<string, string> = {
  R0: "The request comes from an authority allowed to ask for this hold, in this state",
  R1: "Hold no more than the money traced to the complaints",
  R2: "Whole-account freeze only as a last resort: mule score 0.85 or more, 2 or more warning signs, and an officer confirms",
  R3: "Every hold has its deadlines tracked",
  R4: "A victim can get back amounts under ₹50,000 with just a complaint (victim refund route, not a release for the account holder)",
  R5: "Never block emergency or protected numbers",
  R6: "Never block a spoofed caller number",
  R7: "A SIM or handset block needs 2 or more signals, at least 1 from the telecom side",
  R8: "A likely innocent shop gets an exact hold plus notice only",
  R9: "An evidence record is attached",
};

const ALLOWED_REQ = new Set(["signed_dated", "case_reference", "criminal_nature", "magistrate_intimation", "magistrate_order", "account_nexus"]);
const SIZED_REQ = new Set(["exact_amount"]);

export interface BadgeItem { id: string; plain: string; ok: boolean; sources: string[] }
export interface Badge { key: "allowed" | "sized" | "timed"; title: string; pass: boolean; items: BadgeItem[] }

const item = (c: Check, req = false): BadgeItem => ({ id: c.rule, plain: req ? c.note : (RULE_PLAIN[c.rule] ?? c.note), ok: c.ok, sources: c.sources });

/** Group the engine's checks into the three badges. Pass/fail comes from the engine; this only arranges them. */
export function badgesFor(m: MemoCase): Badge[] {
  const gate = (ids: string[]) => m.checks.filter((c) => ids.includes(c.rule)).map((c) => item(c));
  const req = (ids: Set<string>) => m.requisitionChecks.filter((c) => ids.has(c.rule)).map((c) => item(c, true));
  return [
    { key: "allowed", title: "Allowed?", pass: m.badges.allowed, items: [...gate(["R0", "R9"]), ...req(ALLOWED_REQ)] },
    { key: "sized", title: "Right size?", pass: m.badges.sized, items: [...gate(["R1", "R8"]), ...req(SIZED_REQ)] },
    { key: "timed", title: "On time?", pass: m.badges.timed, items: [...gate(["R3"]), ...m.clocks.map((c) => ({ id: c.id, plain: `${c.label} (${c.days} days)`, ok: true, sources: c.sources }))] },
  ];
}

/** Only checked sources may be cited. Anything else goes to "still being checked". */
export function citeable(ids: string[], sources: Source[]): { cited: Source[]; uncited: string[] } {
  const uniq = [...new Set(ids)];
  const cited: Source[] = [];
  const uncited: string[] = [];
  for (const id of uniq) {
    const s = sources.find((x) => x.id === id);
    if (s?.verified === true) cited.push(s);
    else uncited.push(id);
  }
  return { cited, uncited };
}

export function sourceLabel(s: Source): string {
  return [s.title, s.issuer, s.date, s.ref].filter(Boolean).join(" · ");
}

/** Rules whose sources are all unverified (e.g. R4 while the MHA SOP is unchecked) are listed separately, never on a badge. */
export function stillBeingChecked(m: MemoCase, sources: Source[]): BadgeItem[] {
  return m.checks
    .filter((c) => c.sources.length > 0 && citeable(c.sources, sources).cited.length === 0)
    .map((c) => item(c));
}

export function istDate(ms: number | null): string {
  if (ms === null) return "-";
  return new Date(ms).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}

export function maskAccount(id: string): string {
  return id.length > 3 ? `${"•".repeat(id.length - 3)}${id.slice(-3)}` : id;
}
