import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { formatRupees as rupees } from "../lib/money";

const demo = JSON.parse(readFileSync(new URL("../data/demo.json", import.meta.url), "utf8"));
const shop = demo.memo.cases.find((c: { account: string }) => c.account === "D00191");

test("inbox opens the shop's request with the engine's hold amount", async ({ page }) => {
  await page.goto("/?m=D00191");
  await expect(page.getByTestId("case-view")).toContainText(rupees(shop.tracedPaise));
  await expect(page.getByTestId("hold-bars")).toContainText(rupees(shop.heldPaise));
  await expect(page.getByTestId("hold-bars")).toContainText(rupees(shop.balancePaise));
});

test("two-person rule: officer proposes, supervisor approves, then the holder can be notified", async ({ page }) => {
  await page.goto("/?m=D00191");
  await expect(page.getByTestId("kpi-held")).toContainText("₹0");
  await page.getByTestId("act-propose-exact").click();
  await expect(page.getByTestId("act-approve-exact")).toHaveCount(0);
  await page.getByTestId("role-supervisor").click();
  await page.getByTestId("act-approve-exact").click();
  await expect(page.getByTestId("kpi-held")).toContainText(rupees(shop.heldPaise));
  await expect(page.getByTestId("kpi-innocent")).toContainText("₹0");
  await page.getByTestId("role-officer").click();
  await page.getByTestId("act-notice").click();
  await expect(page.getByTestId("msg-holder-D00191")).toBeVisible();
});

test("who-first sorts the inbox", async ({ page }) => {
  await page.goto("/order");
  await page.getByTestId("rule-model").click();
  await expect(page.getByTestId("use-recommended")).toBeVisible();
  const first = await page.getByTestId("queue-preview").locator("li").first().innerText();
  expect(first).toContain("Savings account");
});

test("phone width: inbox does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});
