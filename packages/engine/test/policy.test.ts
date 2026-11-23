import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { policyAt, strictestJurisdiction, jurisdictionAt, parseOverlay } from "../src/policy";
import { parseIST } from "../src/time";

const { policies, overlays } = loadPolicies(join(__dirname, "../../../policies"));

describe("policy files", () => {
  it("all load and validate", () => {
    expect(policies.map((p) => p.id).sort()).toEqual(["legacy-practice", "scalpel-2026-12"]);
    expect(overlays.length).toBe(4);
  });
  it("picks the version in force on the event date", () => {
    expect(policyAt(policies, parseIST("2026-12-20T10:00")).id).toBe("scalpel-2026-12");
    expect(policyAt(policies, parseIST("2025-06-01T10:00")).id).toBe("legacy-practice");
  });
  it("same police request: Mumbai vs Bengaluru vs Chennai", () => {
    const at = parseIST("2026-12-20T10:00");
    expect(jurisdictionAt(overlays, "MH", at).power).toBe("not_allowed");
    expect(jurisdictionAt(overlays, "KA", at).power).toBe("allowed");
    expect(jurisdictionAt(overlays, "TN", at).power).toBe("unsettled");
  });
  it("cross-state: strictest wins and the conflict is flagged", () => {
    const r = strictestJurisdiction(overlays, ["KA", "MH"], parseIST("2026-12-20T10:00"));
    expect(r.strictest.state).toBe("MH");
    expect(r.conflict).toBe(true);
  });
  it("rejects an overlay that puts a state under the wrong High Court", () => {
    expect(() => parseOverlay(`id: x\nhigh_court: Bombay\nstates: [KA]\nstatus: final\neffective_from: "2025-01-01"\npolice_debit_freeze_s106: allowed\nsources: []`)).toThrow(/Karnataka/);
  });
});
