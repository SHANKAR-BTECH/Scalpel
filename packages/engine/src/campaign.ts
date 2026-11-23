/**
 * Inbox: group complaints that share a receiving account into one campaign, and rank by golden-hour urgency.
 * priority = catchable money x victims / max(minutes to likely cash-out, 5)
 */
import type { Paise } from "./money";
import type { Instant } from "./time";

export interface Complaint { id: string; at: Instant; amount: Paise; firstReceiver: string }
export interface Campaign { id: string; complaintIds: string[]; receivers: string[]; victims: number; reported: Paise; firstAt: Instant }

/** Union-find over complaints that share a first receiver (simple, explainable linking). */
export function linkCampaigns(complaints: Complaint[], extraLinks: [string, string][] = []): Campaign[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  for (const c of complaints) union(`c:${c.id}`, `a:${c.firstReceiver}`);
  for (const [a, b] of extraLinks) union(`a:${a}`, `a:${b}`);
  const groups = new Map<string, Complaint[]>();
  for (const c of complaints) { const r = find(`c:${c.id}`); groups.set(r, [...(groups.get(r) ?? []), c]); }
  return [...groups.values()].map((cs) => {
    const sorted = [...cs].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    return {
      id: `CMP-${sorted[0]!.id}`, complaintIds: sorted.map((c) => c.id), receivers: [...new Set(sorted.map((c) => c.firstReceiver))].sort(),
      victims: sorted.length, reported: sorted.reduce((s, c) => s + c.amount, 0), firstAt: sorted[0]!.at,
    };
  }).sort((a, b) => a.firstAt - b.firstAt);
}

export function priority(catchable: Paise, victims: number, minutesToCashOut: number): number {
  return (catchable / 100) * victims / Math.max(minutesToCashOut, 5);
}
