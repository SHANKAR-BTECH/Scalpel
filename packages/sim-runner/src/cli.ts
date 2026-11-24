/**
 * Usage: tsx src/cli.ts <worldDir> --policy 0|A|B|C --out <decisions.json> [--assessments <file in worldDir>]
 *        tsx src/cli.ts <worldDir> --memo <memo.json> --accounts D09001,D00191
 * The world folder holds world.json (and optionally signals.json and assessments*.json). Nothing else.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { HoldPolicy } from "./schema";
import { firstSeen, loadWorldDir, readOptional, runHolds, taintByAccount, traceWorld, victimCases } from "./run";
import { runScalpel } from "./scalpel";
import { buildQueues, caseTotals } from "./queue";
import { buildMemo } from "./memo";
import { policy as scalpelPolicy } from "./scalpel";
import { parseAssessments, parseSignals } from "./schema";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const dir = process.argv[2];
if (!dir || dir.startsWith("--")) throw new Error("usage: cli.ts <worldDir> --policy 0|A|B|C --out <file>  |  cli.ts <worldDir> --queues <file> [--assessments f]");
const memoOut = arg("memo");
if (memoOut) {
  const accounts = (arg("accounts") ?? "").split(",").filter(Boolean);
  if (!accounts.length) throw new Error("--memo needs --accounts a,b");
  const world = loadWorldDir(dir);
  mkdirSync(dirname(memoOut), { recursive: true });
  const { P } = scalpelPolicy();
  writeFileSync(memoOut, JSON.stringify({ world: world.name, policyId: P.id, policyStatus: P.status, sources: P.sources, cases: buildMemo(world, dir, accounts) }) + "\n");
  console.log(`${world.name}: memo for ${accounts.join(", ")} -> ${memoOut}`);
  process.exit(0);
}
const queuesOut = arg("queues");
if (queuesOut) {
  const world = loadWorldDir(dir);
  const t = traceWorld(world);
  const seen = firstSeen(world);
  const cases = caseTotals(taintByAccount(world), victimCases(world));
  const rows = Object.entries(t).filter(([, v]) => v.traced > 0).map(([account, v]) => ({ account, traced: Math.min(v.traced, v.balance), firstSeen: seen[account] ?? world.cutoff, caseTotal: cases[account] }));
  const assess = parseAssessments(readOptional(dir, arg("assessments") ?? "assessments.json") ?? { model: "none", accounts: {} });
  const signals = parseSignals(readOptional(dir, "signals.json") ?? { asOf: world.cutoff, signals: {} });
  const scores = Object.fromEntries(Object.entries(assess.accounts).map(([a, v]) => [a, v.muleScore]));
  mkdirSync(dirname(queuesOut), { recursive: true });
  writeFileSync(queuesOut, JSON.stringify({ world: world.name, model: assess.model, held: Object.fromEntries(rows.map((r) => [r.account, r.traced])), orders: buildQueues(rows, scores, signals.signals) }) + "\n");
  console.log(`${world.name}: queues for ${rows.length} accounts -> ${queuesOut}`);
  process.exit(0);
}
const policy = HoldPolicy.parse(arg("policy"));
const out = arg("out") ?? resolve(dir, `../decisions/${policy}.json`);
const world = loadWorldDir(dir);
const decisions = policy === "C" ? runScalpel(world, dir, arg("assessments") ?? "assessments.json") : runHolds(world, policy);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(decisions) + "\n");
console.log(`${world.name} policy ${policy}: ${decisions.rows.length} accounts -> ${out}`);
