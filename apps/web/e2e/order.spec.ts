import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const demo = JSON.parse(readFileSync(new URL("../data/demo.json", import.meta.url), "utf8"));

test("who-first shows the exported caption and the locked v3 result as it came out", async ({ page }) => {
  await page.goto("/order");
  await expect(page.getByTestId("caption")).toHaveText(demo.order.caption[0]);
  await expect(page.getByTestId("v3-verdict")).toHaveText(demo.order.v3.sentence);
  await expect(page.getByTestId("worst").locator("tbody tr")).toHaveCount(5);
});

test("K switch and table view work", async ({ page }) => {
  await page.goto("/order");
  await page.getByTestId("k-5").click();
  await expect(page.getByTestId("k-5")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("table-toggle").click();
  await expect(page.getByTestId("order-table")).toContainText("Biggest amount first");
});

test("phone width: who-first does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/order");
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});
