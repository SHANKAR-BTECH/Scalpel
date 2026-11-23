/** Node-only helpers (file loading). Keep the rest of the engine browser-safe. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parsePolicy, parseOverlay, type PolicySet, type Overlay } from "./policy";

export function loadPolicies(dir: string): { policies: PolicySet[]; overlays: Overlay[] } {
  const policies = readdirSync(dir).filter((f) => f.endsWith(".yaml") && f !== "sources.yaml").map((f) => parsePolicy(readFileSync(join(dir, f), "utf8")));
  const odir = join(dir, "overlays");
  const overlays = readdirSync(odir).filter((f) => f.endsWith(".yaml")).map((f) => parseOverlay(readFileSync(join(odir, f), "utf8")));
  return { policies, overlays };
}
