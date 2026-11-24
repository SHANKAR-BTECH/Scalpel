import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Banner } from "./Banner";

describe("Banner", () => {
  it("shows the exact simulation notice", () => {
    const { getByRole } = render(<Banner />);
    expect(getByRole("note").textContent).toBe("Simulation with fictional data. Not legal advice.");
  });
});
