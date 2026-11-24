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
  it("a deadline met late stays on the record as SATISFIED_LATE, not SATISFIED", () => {
    const h = createHold({ id: "HL", account: "A", amount: rupees(30000), regime: "RBI_BANK", at: t0, by: "officer", policy: P });
    const late = applyEvent(h, { type: "NOTICE_SENT", at: day(4), by: "system" }, P);
    expect(view(late, day(5), "notice").state).toBe("SATISFIED_LATE");
    expect(dueActions(late, P, day(5)).map((d) => d.clockId)).not.toContain("notice");
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
    // MHA SOP: the 7-day grievance upload starts when the holder raises a grievance, and the IO's 15 days start at upload.
    expect(view(hold, day(27), "grm_upload").state).toBe("NOT_STARTED");
    const g = applyEvent(hold, { type: "REPLY_RECEIVED", at: day(28), by: "holder" }, P);
    expect(view(g, day(30), "grm_upload").state).toBe("RUNNING");
    expect(formatIST(view(g, day(30), "grm_upload").dueAt!)).toBe("2027-01-24 23:59 IST"); // grievance on 17 Jan + 7 days
    expect(view(g, day(30), "io_decision").state).toBe("NOT_STARTED");
    const u = applyEvent(g, { type: "GRM_UPLOADED", at: day(31), by: "bank" }, P);
    expect(view(u, day(32), "io_decision").state).toBe("RUNNING");
    expect(view(hold, day(27), "release_90").state).toBe("RUNNING");
  });
  it("police hold: bank must decide at 90 days unless extended, one +90 extension only (MHA SOP)", () => {
    let h = createHold({ id: "P", account: "A", amount: rupees(49999), regime: "MHA_POLICE", at: t0, by: "o", policy: P });
    expect(view(h, day(76), "release_90").state).toBe("ALERT");
    h = applyEvent(h, { type: "EXTENDED", at: day(80), by: "io", clockId: "release_90" }, P);
    expect(view(h, day(100), "release_90").state).toBe("RUNNING");
    expect(() => applyEvent(h, { type: "EXTENDED", at: day(101), by: "io", clockId: "release_90" }, P)).toThrow(/only 1/);
    expect(settle(h, P, day(181)).hold.state).toBe("ACTIVE"); // not automatic: the SOP says the bank "may" remove it
    expect(dueActions(h, P, day(181)).map((d) => [d.clockId, d.kind])).toContainEqual(["release_90", "DECIDE"]);
  });
  it("the 90-day review applies to any amount (no Rs 50,000 limit in the SOP)", () => {
    const h = createHold({ id: "P", account: "A", amount: rupees(5_00_000), regime: "MHA_POLICE", at: t0, by: "o", policy: P });
    expect(view(h, day(76), "release_90").state).toBe("ALERT");
    expect(settle(h, P, day(91)).hold.state).toBe("ACTIVE");
    expect(dueActions(h, P, day(91)).map((d) => [d.clockId, d.kind])).toContainEqual(["release_90", "DECIDE"]);
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
