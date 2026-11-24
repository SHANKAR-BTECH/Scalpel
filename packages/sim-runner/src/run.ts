/**
 * Runs the phase 1 engine over a simulated world.
 * It only ever sees the world folder (what the bank could see at the decision moment).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { trace } from "@scalpel/engine";
import { parseWorld, type Decisions, type DecisionRow, type HoldPolicy, type World } from "./schema";

/** The only files a world folder may hold. Anything else (such as the hidden answers) is refused. */
export const WORLD_FILES = new Set(["world.json", "signals.json", "assessments.json", "assessments-logistic.json", "assessments-lightgbm.json"]);

/** Load world.json from a folder. Refuses any folder that also holds other files, such as the hidden answers. */
export function loadWorldDir(dir: string): World {
  const extra = readdirSync(dir).filter((f) => !WORLD_FILES.has(f));
  if (extra.length) throw new Error(`Refusing ${dir}: unexpected files ${extra.join(", ")} (the runner must never see the hidden answers). Give it the world folder only.`);
  return parseWorld(JSON.parse(readFileSync(join(dir, "world.json"), "utf8")));
}

export const readOptional = (dir: string, file: string): unknown => (existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), "utf8")) : undefined);

/** Trace using only REPORTED complaints, as of the decision moment. */
export function traceWorld(world: World): Record<string, { balance: number; traced: number }> {
  const victimTxns = Object.fromEntries(world.complaints.map((c) => [c.txnId, c.victim]));
  const r = trace({
    opening: Object.fromEntries(world.accounts.map((a) => [a.id, a.opening])),
    txns: world.txns.map((t) => ({ id: t.id, at: t.at, from: t.from, to: t.to, amount: t.amount })),
    victimTxns,
    asOf: world.cutoff,
  });
  return Object.fromEntries(Object.entries(r.accounts).map(([id, a]) => [id, { balance: a.balance, traced: a.tainted }]));
}

/** When stolen money was first found arriving in each account (from REPORTED complaints). */
export function firstSeen(world: World): Record<string, number> {
  const victimTxns = Object.fromEntries(world.complaints.map((c) => [c.txnId, c.victim]));
  const r = trace({
    opening: Object.fromEntries(world.accounts.map((a) => [a.id, a.opening])),
    txns: world.txns.map((t) => ({ id: t.id, at: t.at, from: t.from, to: t.to, amount: t.amount })),
    victimTxns, asOf: world.cutoff,
  });
  const out: Record<string, number> = {};
  for (const f of r.flows) if (Object.keys(f.taint).length && out[f.to] === undefined) out[f.to] = f.at;
  return out;
}

/** Policies 0 (do nothing), A (Axe: whole freeze), B (Ruler: exact hold of traced). Policy C lives in scalpel.ts. */
export function runHolds(world: World, policy: Exclude<HoldPolicy, "C">): Decisions {
  const traced = traceWorld(world);
  const types = Object.fromEntries(world.accounts.map((a) => [a.id, a.type]));
  const rows: DecisionRow[] = Object.entries(traced)
    .filter(([, t]) => t.traced > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([account, t]) => {
      const base = { account, type: types[account] ?? "SAVINGS", balance: t.balance, traced: t.traced };
      if (policy === "A") return { ...base, action: "WHOLE_FREEZE", held: t.balance };
      if (policy === "B") return { ...base, action: "EXACT_HOLD", held: Math.min(t.traced, t.balance) };
      return { ...base, action: "NONE", held: 0 };
    });
  return { world: world.name, policy, rows };
}
