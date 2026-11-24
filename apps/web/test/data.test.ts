// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoData } from "../lib/demo-schema";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const raw = JSON.parse(readFileSync(join(WEB, "data", "demo.json"), "utf8"));

describe("demo.json", () => {
  it("the committed file parses", () => {
    expect(() => DemoData.parse(raw)).not.toThrow();
  });
  it("a stale file with a short series is refused", () => {
    const bad = structuredClone(raw);
    bad.replay.lanes.scalpel.securedPaise = bad.replay.lanes.scalpel.securedPaise.slice(0, 10);
    expect(() => DemoData.parse(bad)).toThrow();
  });
  it("carries no per-account answers", () => {
    const { memo, worst, ...rest } = raw;
    const text = JSON.stringify(rest);
    expect(text).not.toMatch(/"role"/);
    expect(text).not.toMatch(/"D0\d{4}"/);
  });
});

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "out", "data", "test-results"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !p.endsWith("data.test.ts")) yield p;
  }
}

describe("no peeking", () => {
  it("no website source file mentions the hidden answers", () => {
    const hits = [...files(WEB)].filter((p) => /truth/i.test(readFileSync(p, "utf8")));
    expect(hits).toEqual([]);
  });
});
