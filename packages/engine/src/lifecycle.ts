/**
 * Multi-clock hold lifecycle. Each hold is tagged with a regime; clocks come from policy YAML.
 * Holds are immutable values: applyEvent returns a new hold. Rules are taken from the policy
 * version in force when the hold was placed (rules with dates).
 */
import type { Paise } from "./money";
import { deadline, istStart, istDate, addDays, type Instant } from "./time";
import type { PolicySet, Regime, HoldEvent, Clock } from "./policy";

export interface HoldEventRec { type: HoldEvent; at: Instant; by: string; note?: string; clockId?: string; toRegime?: Regime }
export interface Hold {
  id: string; account: string; amount: Paise; policyId: string;
  initialRegime: Regime; regime: Regime; state: "ACTIVE" | "RELEASED";
  events: HoldEventRec[];
}

export type ClockState = "NOT_STARTED" | "RUNNING" | "ALERT" | "SATISFIED" | "EXPIRED" | "NOT_APPLICABLE";
export interface ClockView { clock: Clock; regime: Regime; state: ClockState; startedAt: Instant | null; dueAt: Instant | null; alertAt: Instant | null; extensionsUsed: number }
export interface DueAction { holdId: string; clockId: string; kind: Clock["on_expiry"] | "ALERT"; dueAt: Instant; startedAt: Instant; convertTo?: Regime; label: string }

export function createHold(p: { id: string; account: string; amount: Paise; regime: Regime; at: Instant; by: string; policy: PolicySet }): Hold {
  if (!p.policy.regimes[p.regime]) throw new Error(`policy ${p.policy.id} has no regime ${p.regime}`);
  return { id: p.id, account: p.account, amount: p.amount, policyId: p.policy.id, initialRegime: p.regime, regime: p.regime, state: "ACTIVE", events: [{ type: "HOLD_PLACED", at: p.at, by: p.by }] };
}

/** Events since the hold entered its current regime (conversion acts as a fresh HOLD_PLACED). */
function segment(h: Hold, now: Instant): HoldEventRec[] {
  const evs = h.events.filter((e) => e.at <= now);
  let start = 0;
  evs.forEach((e, i) => { if (e.type === "CONVERTED") start = i; });
  return evs.slice(start).map((e, i) => (i === 0 && e.type === "CONVERTED" ? { ...e, type: "HOLD_PLACED" as const } : e));
}

function regimeAt(h: Hold, now: Instant): Regime {
  let cur = h.initialRegime;
  for (const e of h.events) if (e.at <= now && e.type === "CONVERTED" && e.toRegime) cur = e.toRegime;
  return cur;
}

export function clockViews(h: Hold, policy: PolicySet, now: Instant): ClockView[] {
  if (policy.id !== h.policyId) throw new Error(`hold ${h.id} uses policy ${h.policyId}, got ${policy.id}`);
  const regime = regimeAt(h, now);
  const spec = policy.regimes[regime];
  if (!spec) return [];
  const seg = segment(h, now);
  const released = seg.some((e) => e.type === "RELEASED");
  return spec.clocks.map((c): ClockView => {
    const base = { clock: c, regime, extensionsUsed: 0 };
    if ((c.amount_below !== undefined && h.amount >= c.amount_below) || (c.amount_at_least !== undefined && h.amount < c.amount_at_least))
      return { ...base, state: "NOT_APPLICABLE", startedAt: null, dueAt: null, alertAt: null };
    const start = seg.find((e) => e.type === c.starts_on);
    if (!start) return { ...base, state: released ? "NOT_APPLICABLE" : "NOT_STARTED", startedAt: null, dueAt: null, alertAt: null };
    const ext = seg.filter((e) => e.type === "EXTENDED" && e.clockId === c.id).length;
    const days = c.days + ext * (c.extendable?.days ?? 0);
    const dueAt = deadline(start.at, days, c.unit);
    const alertAt = c.alert_before_days > 0 ? istStart(addDays(istDate(dueAt), -c.alert_before_days)) : null;
    const sat = seg.some((e) => e.at >= start.at && c.satisfied_by.includes(e.type) && e !== start);
    const state: ClockState = sat ? "SATISFIED" : now > dueAt ? "EXPIRED" : alertAt !== null && now >= alertAt ? "ALERT" : "RUNNING";
    return { ...base, state, startedAt: start.at, dueAt, alertAt, extensionsUsed: ext };
  });
}

export function applyEvent(h: Hold, e: HoldEventRec, policy: PolicySet): Hold {
  if (h.state === "RELEASED") throw new Error(`hold ${h.id} is already released`);
  const last = h.events.at(-1);
  if (last && e.at < last.at) throw new Error("events must be in time order");
  if (e.type === "HOLD_PLACED") throw new Error("hold already placed");
  if (e.type === "EXTENDED") {
    const v = clockViews(h, policy, e.at).find((x) => x.clock.id === e.clockId);
    if (!v?.clock.extendable) throw new Error(`clock ${e.clockId} cannot be extended`);
    if (v.extensionsUsed >= v.clock.extendable.times) throw new Error(`clock ${e.clockId}: only ${v.clock.extendable.times} extension(s) allowed`);
    if (v.state === "EXPIRED") throw new Error(`clock ${e.clockId} already expired; extension must come before the deadline`);
  }
  if (e.type === "CONVERTED") {
    if (!e.toRegime || !policy.regimes[e.toRegime]) throw new Error("conversion needs a target regime in this policy");
  }
  const next: Hold = { ...h, events: [...h.events, e] };
  if (e.type === "CONVERTED") next.regime = e.toRegime!;
  if (e.type === "RELEASED") next.state = "RELEASED";
  return next;
}

/** What the daily job must do now. Expired AUTO_RELEASE / CONVERT clocks are acted on automatically by the app. */
export function dueActions(h: Hold, policy: PolicySet, now: Instant): DueAction[] {
  if (h.state === "RELEASED") return [];
  const out: DueAction[] = [];
  for (const v of clockViews(h, policy, now)) {
    const base = { holdId: h.id, clockId: v.clock.id, dueAt: v.dueAt!, startedAt: v.startedAt!, label: v.clock.label };
    // a zero-day conversion is a hand-over, due the moment its trigger happens
    const instantConvert = v.clock.on_expiry === "CONVERT" && v.clock.days === 0 && (v.state === "RUNNING" || v.state === "ALERT" || v.state === "EXPIRED");
    if (instantConvert) { out.push({ ...base, kind: "CONVERT", dueAt: v.startedAt!, convertTo: v.clock.convert_to }); continue; }
    if (v.state === "ALERT") out.push({ ...base, kind: "ALERT" });
    if (v.state === "EXPIRED") out.push({ ...base, kind: v.clock.on_expiry, convertTo: v.clock.convert_to });
  }
  const rank = { AUTO_RELEASE: 0, CONVERT: 1, ESCALATE: 2, OVERDUE: 3, DECIDE: 4, ALERT: 5 } as const;
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.dueAt - b.dueAt);
}

/** Advance a hold to `now`, auto-applying releases and conversions in deadline order. */
export function settle(h: Hold, policy: PolicySet, now: Instant): { hold: Hold; applied: DueAction[] } {
  const applied: DueAction[] = [];
  let cur = h;
  for (let guard = 0; guard < 20; guard++) {
    // earliest automatic action whose deadline has passed
    const pending = dueActions(cur, policy, now).filter((d) => d.kind === "AUTO_RELEASE" || d.kind === "CONVERT").sort((a, b) => a.dueAt - b.dueAt)[0];
    if (!pending) break;
    const at = Math.max(pending.kind === "CONVERT" && pending.dueAt === pending.startedAt ? pending.startedAt : pending.dueAt + 1, cur.events.at(-1)!.at);
    cur = pending.kind === "AUTO_RELEASE"
      ? applyEvent(cur, { type: "RELEASED", at, by: "system", note: `Auto-release: ${pending.label}`, clockId: pending.clockId }, policy)
      : applyEvent(cur, { type: "CONVERTED", at, by: "system", toRegime: pending.convertTo, clockId: pending.clockId }, policy);
    applied.push(pending);
  }
  return { hold: cur, applied };
}

/** Several holds on one account usually cover the same victim money, so the restriction is the largest active one. */
export function accountRestriction(holds: Hold[]): Paise {
  return holds.filter((h) => h.state === "ACTIVE").reduce((m, h) => Math.max(m, h.amount), 0);
}
