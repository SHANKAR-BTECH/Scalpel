/**
 * Hold memo cases: for a few named accounts, record exactly what the engine decided and why,
 * so the web memo shows the engine's own Gate checks, badges and clocks (nothing recomputed in the page).
 * Like the rest of the runner, this only reads the world folder: never the hidden answers.
 */
import {
  checkRequisition, clockViews, createHold, planAccount, quashRisks, trace, tracedByRole, unverifiedSources,
  type Action, type BadgeKey, type BadgeState, type GateContext, type GateResult, type Instant, type Signal,
} from "@scalpel/engine";
import { parseAssessments, parseSignals, type World } from "./schema";
import { readOptional, traceWorld } from "./run";
import { policy, requisition } from "./scalpel";

export interface MemoHop { utr: string; at: number; from: string; to: string; amountPaise: number; taintPaise: number; layer: number | null }
export interface MemoCheck { rule: string; ok: boolean; note: string; sources: string[]; unverified: string[] }
export interface MemoClock { id: string; label: string; days: number; startsOn: string; dueAt: number | null; onExpiry: string; status: string | null; state: string; sources: string[]; unverified: string[] }
/** What the memo would say if the whole account were frozen instead (the comparison a court makes). */
export interface MemoWholeFreeze { heldPaise: number; overTracedPaise: number; sized: BadgeState; risks: { id: string; ground: string }[] }
export interface MemoCase {
  account: string; type: string; balancePaise: number; tracedPaise: number;
  /** Traced if the holder were found to be a wrongdoer (own money presumed spent first, Re Hallett). Shown, never held. */
  tracedIfAccusedPaise: number;
  action: string; heldPaise: number; suggestedWholeFreeze: boolean;
  regime: string | null; regimeLabel: string | null; ncrpAck: string; requisitionBasis: string; layer: number | null;
  hops: MemoHop[]; muleScore: number; reasons: string[]; signals: string[];
  requisitionStatus: string; requisitionChecks: MemoCheck[]; jurisdiction: string;
  checks: MemoCheck[]; badges: { allowed: boolean; sized: boolean; timed: boolean };
  badgeStates: Record<BadgeKey, BadgeState>; badgeReasons: Record<BadgeKey, string[]>; asOf: number; wholeFreeze: MemoWholeFreeze;
  wholeFreezeChecks: MemoCheck[] | null;
  clocks: MemoClock[]; quashRisksAfter: { id: string; ground: string }[]; flags: string[];
}

const checksOf = (g: GateResult | undefined): MemoCheck[] =>
  (g?.checks ?? []).map((c) => ({ rule: c.rule, ok: c.ok, note: c.note, sources: c.sources, unverified: c.unverified }));

export function buildMemo(world: World, dir: string, accounts: string[], now: Instant = world.cutoff): MemoCase[] {
  const { P, overlays } = policy();
  const assess = parseAssessments(readOptional(dir, "assessments.json") ?? { model: "none", accounts: {} });
  const signals = parseSignals(readOptional(dir, "signals.json") ?? { asOf: world.cutoff, signals: {} });
  const types = Object.fromEntries(world.accounts.map((a) => [a.id, a.type]));
  const traced = traceWorld(world);
  const victimTxns = Object.fromEntries(world.complaints.filter((c) => c.reportedAt <= world.cutoff).map((c) => [c.txnId, c.victim]));
  const full = trace({
    opening: Object.fromEntries(world.accounts.map((a) => [a.id, a.opening])),
    txns: world.txns.map((t) => ({ id: t.id, at: t.at, from: t.from, to: t.to, amount: t.amount })),
    victimTxns, asOf: world.cutoff,
  });

  const allVictims = Object.fromEntries(world.complaints.map((c) => [c.txnId, c.victim])); // same inputs as traceWorld
  const byRoleInput = {
    opening: Object.fromEntries(world.accounts.map((a) => [a.id, a.opening])),
    txns: world.txns.map((t) => ({ id: t.id, at: t.at, from: t.from, to: t.to, amount: t.amount })),
    victimTxns: allVictims, asOf: world.cutoff,
  };

  return accounts.map((account) => {
    const t = traced[account];
    if (!t || t.traced <= 0) throw new Error(`memo: ${account} holds no traced money in ${world.name}`);
    const a = assess.accounts[account] ?? { role: "normal" as const, muleScore: 0, reasons: ["No model score", "-", "-"] };
    const sig = (signals.signals[account] ?? []) as Signal[];
    const exact = Math.min(t.traced, t.balance);
    const req = requisition(world, account, exact);
    const reqResult = checkRequisition(req, P, overlays);
    const ctx = (confirmed: boolean): GateContext => ({
      at: world.cutoff, requester: "POLICE", requisition: reqResult,
      account: { id: account, type: (types[account] ?? "SAVINGS") as never, balance: t.balance, traced: t.traced },
      assessment: { role: a.role, muleScore: a.muleScore, signals: sig },
      officerConfirmed: confirmed, evidenceRecordId: `EV-${account}`,
      victimLosses: Object.fromEntries(Object.keys(full.accounts[account]?.taint ?? {}).map((v) => [v, full.victimPaid[v] ?? 0])),
    });
    const candidates: Action[] = [{ kind: "EXACT_HOLD", account, amount: exact }, { kind: "WHOLE_FREEZE", account }];
    const plain = planAccount(candidates, ctx(false), P).best;
    const withOfficer = planAccount(candidates, ctx(true), P).best;
    const suggested = withOfficer?.gate.action?.kind === "WHOLE_FREEZE";
    // Same rule as the runner: a whole freeze is never applied without the officer, so the memo shows the exact hold.
    const exactPlan = planAccount([{ kind: "EXACT_HOLD", account, amount: exact }], ctx(false), P).best;
    const gate = plain?.gate.action?.kind === "WHOLE_FREEZE" ? exactPlan?.gate : plain?.gate;
    const held = gate?.action?.kind === "EXACT_HOLD" ? gate.action.amount : 0;
    const regime = gate?.regime ?? null;
    const clocks: MemoClock[] = regime
      ? clockViews(createHold({ id: `H-${account}`, account, amount: held, regime, at: world.cutoff, by: "officer", policy: P }), P, now).map((v) => ({
          id: v.clock.id, label: v.clock.label, days: v.clock.days, startsOn: v.clock.starts_on, dueAt: v.dueAt, onExpiry: v.clock.on_expiry,
          status: v.clock.status ?? null, state: v.state, sources: v.clock.sources, unverified: unverifiedSources(P, v.clock.sources),
        }))
      : [];
    const hops: MemoHop[] = full.flows
      .filter((f) => f.to === account)
      .map((f) => ({ utr: f.txnId, at: f.at, from: f.from, to: f.to, amountPaise: world.txns.find((x) => x.id === f.txnId)?.amount ?? 0,
        taintPaise: Object.values(f.taint).reduce((s, v) => s + v, 0), layer: full.accounts[f.from]?.hop != null ? full.accounts[f.from]!.hop! + 1 : 1 }))
      .filter((h) => h.taintPaise > 0)
      .sort((x, y) => x.at - y.at);
    // On time? also reads the clocks on the memo date: a missed or late deadline turns it red.
    const states = { ...(gate?.badgeStates ?? { allowed: "fail", sized: "fail", timed: "fail" }) } as Record<BadgeKey, BadgeState>;
    const reasons = { allowed: [...(gate?.badgeReasons.allowed ?? [])], sized: [...(gate?.badgeReasons.sized ?? [])], timed: [...(gate?.badgeReasons.timed ?? [])] };
    const missed = clocks.filter((c) => c.state === "EXPIRED" || c.state === "SATISFIED_LATE");
    if (missed.length) { states.timed = "fail"; reasons.timed.unshift(`Missed: ${missed.map((c) => c.label).join(", ")}`); }
    const wf: Action = { kind: "WHOLE_FREEZE", account };
    const wholeFreeze: MemoWholeFreeze = {
      heldPaise: t.balance, overTracedPaise: Math.max(0, t.balance - t.traced), sized: t.balance > t.traced ? "fail" : "pass",
      risks: quashRisks(wf, ctx(true), regime, P),
    };
    return {
      account, type: types[account] ?? "SAVINGS", balancePaise: t.balance, tracedPaise: t.traced,
      tracedIfAccusedPaise: tracedByRole(byRoleInput, account).ownMoneyFirst,
      action: gate?.action?.kind ?? "NONE", heldPaise: held, suggestedWholeFreeze: suggested,
      regime, regimeLabel: regime ? P.regimes[regime]?.label ?? null : null, ncrpAck: req.ncrpAck ?? "", requisitionBasis: req.basis,
      layer: full.accounts[account]?.hop ?? null, hops, muleScore: a.muleScore, reasons: a.reasons, signals: sig,
      requisitionStatus: reqResult.status,
      requisitionChecks: reqResult.findings.map((f) => ({ rule: f.checkId, ok: f.ok, note: f.message, sources: f.sources, unverified: f.unverified })),
      jurisdiction: `${req.issuer.state}: ${reqResult.authority}`,
      checks: checksOf(gate), badges: gate?.badges ?? { allowed: false, sized: false, timed: false },
      badgeStates: states, badgeReasons: reasons, asOf: now, wholeFreeze,
      wholeFreezeChecks: suggested ? checksOf(withOfficer?.gate) : null,
      clocks, quashRisksAfter: gate?.quashRisksAfter ?? [], flags: gate?.flags ?? [],
    };
  });
}
