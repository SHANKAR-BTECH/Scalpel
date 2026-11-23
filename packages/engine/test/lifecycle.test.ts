import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { join } from "node:path";
import { loadPolicies } from "../src/node";
import { createHold, applyEvent, clockViews, dueActions, settle, accountRestriction } from "../src/lifecycle";
import { parseIST, formatIST, istStart } from "../src/time";
import { rupees } from "../src/money";

const { policies } = loadPolicies(join(__dirname, "../../../policies"));
const P = policies.find((p) => p.id === "scalpel-2026-12")!;
const t0 = parseIST("2026-12-20T15:00");
const day = (n: number, hh = "12:00") => parseIST(`${new Date(istStart("2026-12-20") + n * 86400e3 + 5.5 * 3600e3).toISOString().slice(0, 10)}T${hh}`);
const view = (h: ReturnType<typeof createHold>, now: number, id: string) => clockViews(h, P, now).find((v) => v.clock.id === id)!;

describe("multi-clock lifecycle", () => {
  it("RBI bank hold: notice by end of next day, else overdue", () => {
    const h = createHold({ id: "H1", account: "A", amount: rupees(30000), regime: "RBI_BANK", at: t0, by: "officer", policy: P });
    expect(formatIST(view(h, t0, "notice").dueAt!)).toBe("2026-12-21 23:59 IST");
    expect(dueActions(h, P, day(2)).map((d) => d.clockId)).toContain("notice");
    const h2 = applyEvent(h, { type: "NOTICE_SENT", at: day(1), by: "system" }, P);
    expect(view(h2, day(2), "notice").state).toBe("SATISFIED");
    expect(formatIST(view(h2, day(2), "explanation").dueAt!)).toBe("2027-01-10 23:59 IST");
  });
  it("RBI hold auto-releases at the 60-day cap with an alert 5 days before", () => {
    const h = applyEvent(createHold({ id: "H", account: "A", amount: rupees(30000), regime: "RBI_BANK", at: t0, by: "o", policy: P }), { type: "NOTICE_SENT", at: t0, by: "s" }, P);
    expect(view(h, day(56), "max_cap").state).toBe("ALERT");
    const { hold, applied } = settle(h, P, day(61));
    expect(hold.state).toBe("RELEASED");
    expect(applied.map((a) => a.clockId)).toEqual(["max_cap"]);
  });
  it("referral to police converts the hold to the MHA regime with fresh clocks", () => {
    let h = createHold({ id: "H", account: "A", amount: rupees(30000), regime: "RBI_BANK", at: t0, by: "o", policy: P });
    h = applyEvent(h, { type: "NOTICE_SENT", at: t0, by: "s" }, P);
    h = applyEvent(h, { type: "REFERRED_TO_LEA", at: day(25), by: "o" }, P);
    const { hold } = settle(h, P, day(27));
    expect(hold.regime).toBe("MHA_POLICE");
    expect(hold.state).toBe("ACTIVE");
    expect(formatIST(view(hold, day(27), "grm_upload").dueAt!)).toBe("2027-01-21 23:59 IST");
    expect(view(hold, day(27), "small_release").state).toBe("RUNNING");
  });
  it("police hold under Rs 50,000: release at 90 days, one +90 extension only", () => {
    let h = createHold({ id: "P", account: "A", amount: rupees(49999), regime: "MHA_POLICE", at: t0, by: "o", policy: P });
    expect(view(h, day(76), "small_release").state).toBe("ALERT");
    h = applyEvent(h, { type: "EXTENDED", at: day(80), by: "io", clockId: "small_release" }, P);
    expect(view(h, day(100), "small_release").state).toBe("RUNNING");
    expect(() => applyEvent(h, { type: "EXTENDED", at: day(101), by: "io", clockId: "small_release" }, P)).toThrow(/only 1/);
    expect(settle(h, P, day(181)).hold.state).toBe("RELEASED");
  });
  it("police hold of Rs 50,000 or more has no small-release clock", () => {
    const h = createHold({ id: "P", account: "A", amount: rupees(50000), regime: "MHA_POLICE", at: t0, by: "o", policy: P });
    expect(view(h, day(200), "small_release").state).toBe("NOT_APPLICABLE");
    expect(settle(h, P, day(400)).hold.state).toBe("ACTIVE");
  });
  it("two holds on one account: releasing one keeps the other", () => {
    const a = createHold({ id: "B", account: "A", amount: rupees(30000), regime: "RBI_BANK", at: t0, by: "o", policy: P });
    const b = createHold({ id: "Q", account: "A", amount: rupees(20000), regime: "MHA_POLICE", at: t0, by: "o", policy: P });
    const a2 = applyEvent(a, { type: "RELEASED", at: day(3), by: "o" }, P);
    expect(accountRestriction([a2, b])).toBe(rupees(20000));
    expect(() => applyEvent(a2, { type: "NOTICE_SENT", at: day(4), by: "o" }, P)).toThrow(/released/);
  });
  it("property: whatever happens, a bank hold is never active past day 60", () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.constantFrom("NOTICE_SENT", "REPLY_RECEIVED", "REVIEWED", "GRM_UPLOADED"), fc.integer({ min: 1, max: 59 })), { maxLength: 6 }), (evs) => {
      let h = createHold({ id: "X", account: "A", amount: rupees(5000), regime: "RBI_BANK", at: t0, by: "o", policy: P });
      for (const [type, d] of [...evs].sort((x, y) => x[1] - y[1])) h = applyEvent(h, { type: type as any, at: day(d), by: "o" }, P);
      expect(settle(h, P, day(61, "00:30")).hold.state).toBe("RELEASED");
    }), { numRuns: 200 });
  });
});
