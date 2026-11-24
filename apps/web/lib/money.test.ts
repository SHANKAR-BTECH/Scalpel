import { describe, it, expect } from "vitest";
import { formatRupees, shortRupees } from "./money";

describe("formatRupees", () => {
  it("formats zero, thousands, lakhs and crores with Indian grouping", () => {
    expect(formatRupees(0)).toBe("₹0");
    expect(formatRupees(1_000_000)).toBe("₹10,000");
    expect(formatRupees(32_867_900)).toBe("₹3,28,679");
    expect(formatRupees(36_118_675_300)).toBe("₹36,11,86,753");
  });
  it("shows paise only under ₹1,000, where they matter", () => {
    expect(formatRupees(150)).toBe("₹1.50");
    expect(formatRupees(56_950)).toBe("₹569.50");
    expect(formatRupees(695_041)).toBe("₹6,950");
    expect(formatRupees(695_061)).toBe("₹6,951");
  });
  it("never prints NaN or exponents", () => {
    expect(() => formatRupees(Number.NaN)).toThrow();
    expect(formatRupees(2_528_161_400)).not.toMatch(/e\+|NaN/);
  });
  it("short form for axes", () => {
    expect(shortRupees(36_118_675_300)).toBe("₹36.1 Cr");
    expect(shortRupees(32_867_900)).toBe("₹3.3 L");
  });
});
