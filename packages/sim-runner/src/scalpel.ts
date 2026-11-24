/**
 * Policy C (Scalpel): the phase 1 engine's Gate and planner choose each hold.
 * The AI only supplies a role guess, a mule score and 3 reasons. A whole-account freeze is
 * NEVER applied here: when the planner would choose one with an officer's confirmation,
 * it is recorded as "suggested to officer" and the account gets the exact hold instead.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRequisition, planAccount, type Action, type GateContext, type PolicySet, type Overlay, type Signal, type Requisition } from "@scalpel/engine";
import { loadPolicies } from "@scalpel/engine/src/node";
import { formatINR } from "@scalpel/engine";
import { parseAssessments, parseSignals, type Decisions, type DecisionRow, type World } from "./schema";
import { readOptional, traceWorld } from "./run";

const POLICY_DIR = fileURLToPath(new URL("../../../policies", import.meta.url));
let cached: { P: PolicySet; overlays: Overlay[] } | undefined;
export function policy() {
  if (!cached) {
    const { policies, overlays } = loadPolicies(POLICY_DIR);
    cached = { P: policies.find((p) => p.id === "scalpel-2026-12")!, overlays };
  }
  return cached;
}

/** A valid police request (Karnataka: police may freeze), made from the complaints. */
export function requisition(world: World, account: string, amount: number): Requisition {
  const linked = world.complaints.map((c) => c.txnId);
  return {
    id: `REQ-${account}`, receivedAt: world.cutoff, basis: "BNSS_106",
    issuer: { name: "IO", rank: "Inspector", station: "Cyber PS", state: "KA" },
    signed: true, signedAt: world.cutoff - 3_600_000, ncrpAck: "31612260012345", amountRequested: amount, asksWholeAccount: false,
    account: { id: account, branchState: "KA" }, linkedTxnIds: linked.slice(0, 5), natureDeclared: "criminal", magistrateIntimatedAt: world.cutoff,
  };
}

const describe = (a: Action | null) => (!a ? "No hold" : a.kind === "EXACT_HOLD" ? `Exact hold ${formatINR(a.amount)}` : a.kind === "WHOLE_FREEZE" ? "Whole freeze" : a.kind === "NOTICE_ONLY" ? "Notice only" : a.kind);

export function runScalpel(world: World, dir: string, assessmentsFile: string): Decisions {
  const { P, overlays } = policy();
  const assess = parseAssessments(readOptional(dir, assessmentsFile) ?? { model: "none", accounts: {} });
  const signals = parseSignals(readOptional(dir, "signals.json") ?? { asOf: world.cutoff, signals: {} });
  const types = Object.fromEntries(world.accounts.map((a) => [a.id, a.type]));
  const rows: DecisionRow[] = [];
  for (const [account, t] of Object.entries(traceWorld(world)).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (t.traced <= 0) continue;
    const a = assess.accounts[account] ?? { role: "normal" as const, muleScore: 0, reasons: ["No model score", "-", "-"] };
    const exact = Math.min(t.traced, t.balance);
    const ctx = (confirmed: boolean): GateContext => ({
      at: world.cutoff, requester: "POLICE", requisition: checkRequisition(requisition(world, account, exact), P, overlays),
      account: { id: account, type: (types[account] ?? "SAVINGS") as never, balance: t.balance, traced: t.traced },
      assessment: { role: a.role, muleScore: a.muleScore, signals: (signals.signals[account] ?? []) as Signal[] },
      officerConfirmed: confirmed, evidenceRecordId: `EV-${account}`,
    });
    const candidates: Action[] = [{ kind: "EXACT_HOLD", account, amount: exact }, { kind: "WHOLE_FREEZE", account }];
    const plain = planAccount(candidates, ctx(false), P).best;
    const withOfficer = planAccount(candidates, ctx(true), P).best;
    const suggested = withOfficer?.gate.action?.kind === "WHOLE_FREEZE";
    let action = plain?.gate.action ?? null;
    if (action?.kind === "WHOLE_FREEZE") action = { kind: "EXACT_HOLD", account, amount: exact }; // never applied automatically
    const held = action?.kind === "EXACT_HOLD" ? action.amount : 0;
    const rules = (plain?.gate.checks ?? []).filter((c) => c.ok).map((c) => c.rule);
    const ruleNote = rules.includes("R1") ? "R1, right size" : rules.join(", ");
    rows.push({
      account, type: types[account] ?? "SAVINGS", balance: t.balance, traced: t.traced,
      action: action ? (action.kind as DecisionRow["action"]) : "NONE", held, suggestedWholeFreeze: suggested,
      line: `${describe(action)} (${ruleNote}). Reasons: ${a.reasons.join("; ")}.${suggested ? " Whole freeze suggested: officer must decide." : ""}`,
    });
  }
  return { world: world.name, policy: "C", rows };
}
