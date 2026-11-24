import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWorldDir } from "../src/run";

const src = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(dir, f), "utf8"));

describe("no peeking at the answers", () => {
  it("no engine or runner source file mentions 'truth' outside comments", () => {
    for (const dir of [join(__dirname, "../src"), join(__dirname, "../../engine/src")]) {
      for (const text of src(dir)) {
        const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(code.toLowerCase()).not.toContain("truth");
      }
    }
  });
  it("the runner refuses a world folder that contains a truth file", () => {
    const d = mkdtempSync(join(tmpdir(), "w-"));
    copyFileSync(join(__dirname, "../../../pipeline/tests/fixtures/tiny/world/world.json"), join(d, "world.json"));
    expect(() => loadWorldDir(d)).not.toThrow();
    writeFileSync(join(d, "truth.json"), "{}");
    expect(() => loadWorldDir(d)).toThrow(/answers/);
  });
});
