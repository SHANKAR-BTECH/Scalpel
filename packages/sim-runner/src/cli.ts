/**
 * Usage: tsx src/cli.ts <worldDir> --policy 0|A|B|C --out <decisions.json> [--assessments <file in worldDir>]
 * The world folder holds world.json (and optionally signals.json and assessments*.json). Nothing else.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { HoldPolicy } from "./schema";
import { loadWorldDir, runHolds } from "./run";
import { runScalpel } from "./scalpel";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const dir = process.argv[2];
if (!dir || dir.startsWith("--")) throw new Error("usage: cli.ts <worldDir> --policy 0|A|B|C --out <file>");
const policy = HoldPolicy.parse(arg("policy"));
const out = arg("out") ?? resolve(dir, `../decisions/${policy}.json`);
const world = loadWorldDir(dir);
const decisions = policy === "C" ? runScalpel(world, dir, arg("assessments") ?? "assessments.json") : runHolds(world, policy);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(decisions) + "\n");
console.log(`${world.name} policy ${policy}: ${decisions.rows.length} accounts -> ${out}`);
