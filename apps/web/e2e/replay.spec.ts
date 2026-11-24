import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { formatRupees as rupees } from "../lib/money";

const demo = JSON.parse(readFileSync(new URL("../data/demo.json", import.meta.url), "utf8"));

test("replay plays to hour 72 and shows the exported numbers", async ({ page }) => {
  await page.goto("/replay");
  await expect(page.getByRole("note")).toHaveText("Simulation with fictional data. Not legal advice.");
  await page.getByLabel("Hours after the bank decides").fill("72");
  await expect(page.getByTestId("hour")).toHaveText("72");
  await expect(page.getByTestId("lane-scalpel").getByTestId("innocent")).toHaveText(rupees(demo.replay.lanes.scalpel.innocentLockedPaise[72]));
  await expect(page.getByTestId("lane-axe").getByTestId("innocent")).toHaveText(rupees(demo.replay.lanes.axe.innocentLockedPaise[72]));
  await expect(page.getByTestId("lane-none").getByTestId("secured")).toHaveText("₹0");
});

test("hour 0 shows real values, not blanks", async ({ page }) => {
  await page.goto("/replay");
  for (const id of ["none", "axe", "biggest", "scalpel"]) {
    await expect(page.getByTestId(`lane-${id}`).getByTestId("secured")).toHaveText(/^₹[\d,.]+$/);
  }
});

test("phone width: lanes stack and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/replay"]) {
    await page.goto(path);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, path).toBeLessThanOrEqual(cw);
  }
});

test("the replay links to the shop's hold memo", async ({ page }) => {
  await page.goto("/replay");
  await expect(page.getByTestId("to-memo")).toHaveAttribute("href", /\/memo\?a=D00191/);
});

test("the replay shows the honest whole-freeze trade-off from the 5 test worlds", async ({ page }) => {
  await page.goto("/replay");
  await expect(page.getByTestId("v2-tradeoff")).toContainText("people wrongly restricted");
});

