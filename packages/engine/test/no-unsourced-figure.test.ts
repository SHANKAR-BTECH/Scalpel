/**
 * The "industry 15.12x" freeze figure has no public source (R1 audit), so it was dropped.
 * This test keeps it from creeping back into code, docs or results. Old plan files are history and are skipped.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "__pycache__", ".next", "out", ".pytest_cache"]);
const SKIP_PREFIX = ["docs/superpowers/plans/", "packages/engine/test/no-unsourced-figure.test.ts"];
const TEXT = /\.(md|ts|tsx|js|py|ya?ml|json)$/;
const BANNED = [/industry 15\.12/i, /15\.12x industry/i, /15\.12× industry/i];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEXT.test(name)) yield p;
  }
}

describe("no unsourced industry figure", () => {
  it("no file outside old plans mentions the industry 15.12x figure", () => {
    const hits: string[] = [];
    for (const p of walk(ROOT)) {
      const rel = relative(ROOT, p).split("\\").join("/");
      if (SKIP_PREFIX.some((s) => rel.startsWith(s))) continue;
      const text = readFileSync(p, "utf8");
      if (BANNED.some((b) => b.test(text))) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });
});
