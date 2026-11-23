import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatINR, splitProportional, rupees } from "../src/money";
import { deadline, parseIST, formatIST, isBankHoliday, daysBetween } from "../src/time";

describe("money", () => {
  it("formats Indian grouping", () => {
    expect(formatINR(rupees(1859000))).toBe("₹18,59,000");
    expect(formatINR(rupees(82800))).toBe("₹82,800");
    expect(formatINR(12345)).toBe("₹123.45");
  });
  it("splits exactly and never exceeds a weight", () => {
    fc.assert(fc.property(
      fc.dictionary(fc.constantFrom("a", "b", "c", "d"), fc.integer({ min: 0, max: 1e9 })),
      fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 0, max: 1e9 }),
      (w, extra, rawTotal) => {
        const base = Object.values(w).reduce((s, x) => s + x, 0) + extra;
        const total = base === 0 ? 0 : rawTotal % (base + 1);
        const out = splitProportional(total, w, base);
        const s = Object.values(out).reduce((a, b) => a + b, 0);
        const ideal = base === 0 ? 0 : (total * (base - extra)) / base;
        expect(Math.abs(s - ideal)).toBeLessThanOrEqual(0.5 + 1e-6);
        for (const k of Object.keys(out)) expect(out[k as "a"]).toBeLessThanOrEqual(w[k as "a"]!);
      }));
  });
});

describe("time (IST)", () => {
  it("deadline ends 23:59:59 IST on day N", () => {
    const t = parseIST("2026-12-20T22:30");
    expect(formatIST(deadline(t, 0))).toBe("2026-12-20 23:59 IST");
    expect(formatIST(deadline(t, 20))).toBe("2027-01-09 23:59 IST");
  });
  it("late-night UTC is next IST day", () => {
    expect(formatIST(parseIST("2026-12-20T20:00:00Z"))).toBe("2026-12-21 01:30 IST");
  });
  it("bank working days skip Sundays and 2nd/4th Saturdays", () => {
    expect(isBankHoliday("2026-12-12")).toBe(true); // 2nd Sat
    expect(isBankHoliday("2026-12-05")).toBe(false); // 1st Sat
    const fri = parseIST("2026-12-11T10:00");
    expect(formatIST(deadline(fri, 1, "bank_working"))).toBe("2026-12-14 23:59 IST");
  });
  it("daysBetween counts IST days", () => {
    expect(daysBetween(parseIST("2026-12-01T23:50"), parseIST("2026-12-02T00:10"))).toBe(1);
  });
});
