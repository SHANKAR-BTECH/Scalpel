/** What the AI side says about one account: the suggestion, how sure it is, the clues behind it, and whether
 *  the evidence clashes so a person should look. Built from the mule-score model (scored offline) and the
 *  rules engine (run live on the police request). Nothing here is random. */
import { W, type AccountView } from "./world";
import { inr } from "@/lib/format";

export type Choice = "HOLD" | "NO_HOLD" | "SEND_BACK";
export interface AiView {
  suggest: Choice; amount: number; confidence: number; headline: string;
  why: { clue: string; push: number }[]; rules: string[]; clash: string | null; point: boolean;
  /** Set when a telecom report changed what the AI sees since the case opened. */
  update?: string | null;
}

export const REASONS = [
  "Evidence matches the suggestion",
  "Long-standing account with normal history",
  "Looks like account takeover (SIM swap), not a mule",
  "Police request can't be used as it is",
  "Score unclear: hold now, check more",
  "Phone risk rating disagrees",
  "Other",
] as const;

export const CHOICE_LABEL: Record<Choice, string> = { HOLD: "Hold the victims' money", NO_HOLD: "Don't hold, keep watching", SEND_BACK: "Send the request back to police" };
export const SIGNOFF_AT = 0.8;
const YEAR = 365 * 86_400_000;

const firstIn = new Map<string, number>();
for (const t of W.txns) if (!firstIn.has(t.to) || firstIn.get(t.to)! > t.at) firstIn.set(t.to, t.at);

/** `fri` is DoT's current rating for the account's phone when it changed after a telecom report. */
export function aiView(v: AccountView, now: number, fri?: string): AiView {
  const score = v.a.score?.muleScore ?? null;
  const why = v.a.score?.why ?? [];
  const failed = v.gate.checks.filter((c) => !c.ok).map((c) => c.note);
  if (v.gate.decision === "ROUTE") {
    return { suggest: "SEND_BACK", amount: 0, confidence: 0.95, headline: "The police request can't be used as it is. Send it back with what is missing.", why, rules: failed, clash: null, point: true };
  }
  if (v.gate.decision === "DENY") {
    return { suggest: "NO_HOLD", amount: 0, confidence: 0.9, headline: "The rules don't allow a hold here.", why, rules: failed, clash: null, point: false };
  }
  const confidence = score === null ? 0.5 : v.role === "mule" ? score : v.role === "shield" ? 1 - score : 0.5;
  const headline = v.role === "mule"
    ? `Likely mule: hold ${inr(v.suggested)}, the victims' money still here.`
    : v.role === "shield"
      ? `Likely an innocent receiver: hold only the ${inr(v.suggested)} of victims' money, tell the holder.`
      : `Unclear account: hold ${inr(v.suggested)} while it is checked.`;
  const clashes: string[] = [];
  const age = now - v.a.openedAt;
  if (score !== null && score >= 0.5 && age > YEAR) clashes.push(`High mule score, but the account is ${Math.floor(age / YEAR)} year${age >= 2 * YEAR ? "s" : ""} old. Mule accounts are usually new.`);
  const friNow = fri ?? v.phone?.fri;
  const raised = fri !== undefined && fri !== v.phone?.fri;
  if (score !== null && score < 0.5 && friNow === "VERY_HIGH") clashes.push("Low mule score, but the phone's fraud-risk rating is Very High.");
  if (score !== null && score >= 0.5 && friNow === "LOW") clashes.push("High mule score, but the phone's fraud-risk rating is Low.");
  if (score !== null && score >= 0.2 && score < 0.8) clashes.push(`The mule-score model is unsure (${Math.round(score * 100)}/100).`);
  const swap = v.phone?.swappedAt, first = firstIn.get(v.a.id);
  if (swap && first && swap <= first && first - swap < 30 * 86_400_000) clashes.push("The SIM was swapped just before the money arrived: the real owner may have lost control of the account.");
  const clash = clashes.length ? clashes.join(" ") : null;
  // A rating raised by DoT after a telecom report agrees with a high mule score: the AI is surer.
  const sure = raised && score !== null && score >= 0.5 ? Math.min(0.99, confidence + 0.05) : confidence;
  const update = raised ? `DoT raised this phone's fraud-risk rating to ${friNow === "HIGH" ? "High" : friNow} after Telco-A's report.` : null;
  return { suggest: v.suggested > 0 ? "HOLD" : "NO_HOLD", amount: v.suggested, confidence: sure, headline, why, rules: failed, clash, point: clash !== null, update };
}
