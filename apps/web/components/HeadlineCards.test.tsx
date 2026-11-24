import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { HeadlineCards } from "./HeadlineCards";
import { demo } from "@/lib/data";
import { formatRupees } from "@/lib/money";
import { POLICY_KEYS } from "@/lib/demo-schema";

describe("HeadlineCards", () => {
  it("never shows a Freeze Ratio without victim money missed beside it", () => {
    const { getByTestId } = render(<HeadlineCards headline={demo.headline} />);
    for (const k of POLICY_KEYS) {
      const card = within(getByTestId(`card-${k}`));
      expect(card.getByTestId("ratio").textContent).toMatch(/×|no trace/);
      expect(card.getByTestId("missed").textContent).toBe(formatRupees(demo.headline[k].victimMoneyMissedPaise));
      expect(card.getByText("How is this worked out?")).toBeTruthy();
    }
  });
  it("do nothing holds nothing and misses everything", () => {
    const { getByTestId } = render(<HeadlineCards headline={demo.headline} />);
    const card = within(getByTestId("card-none"));
    expect(card.getByTestId("ratio").textContent).toBe("0.00×");
    expect(card.getByTestId("missed").textContent).toBe(formatRupees(demo.headline.none.victimMoneyPaise));
  });
});
