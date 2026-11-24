import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { formatRupees as rupees } from "../lib/money";

const demo = JSON.parse(readFileSync(new URL("../data/demo.json", import.meta.url), "utf8"));
const cRows: Array<{ account: string; balance: number; traced: number; held: number }> = JSON.parse(
  readFileSync(new URL("../../../pipeline/demo/decisions/C.json", import.meta.url), "utf8"),
).rows;
const unverified = new Set<string>(demo.memo.sources.filter((s: { verified?: boolean }) => s.verified !== true).map((s: { id: string }) => s.id));

for (const account of ["D09001", "D00191"]) {
  test(`${account}: hold line matches the engine's decision file`, async ({ page }) => {
    const row = cRows.find((r) => r.account === account)!;
    await page.goto(`/memo?a=${account}`);
    await expect(page.getByTestId("hold-line")).toHaveText(
      `Hold ${rupees(row.held)} of ${rupees(row.balance)}. The other ${rupees(row.balance - row.held)} stays usable.`,
    );
    expect(row.held).toBe(row.traced);
  });

  test(`${account}: shows the pro-rata rule and the accused (Re Hallett) figure from the engine`, async ({ page }) => {
    const m = demo.memo.cases.find((c: { account: string }) => c.account === account);
    await page.goto(`/memo?a=${account}`);
    const line = page.getByTestId("trace-rule");
    await expect(line).toContainText("pro-rata");
    await expect(line).toContainText("Re Hallett");
    if (m.tracedIfAccusedPaise > m.tracedPaise) await expect(line).toContainText(rupees(m.tracedIfAccusedPaise));
    expect(m.tracedIfAccusedPaise).toBeGreaterThanOrEqual(m.tracedPaise);
  });

  test(`${account}: no unverified source is cited inside a badge`, async ({ page }) => {
    await page.goto(`/memo?a=${account}`);
    const badges = (await page.getByTestId("cited").allInnerTexts()).join("\n");
    for (const s of demo.memo.sources) {
      if (unverified.has(s.id)) expect(badges).not.toContain(s.title);
    }
  });
}

test("'50,000' only appears under 'Still being checked' while the MHA SOP is unverified", async ({ page }) => {
  test.skip(!unverified.has("mha-sop-2026-01"), "MHA SOP now verified");
  for (const account of ["D09001", "D00191"]) {
    await page.goto(`/memo?a=${account}`);
    const all = await page.getByTestId("memo").innerText();
    const pending = await page.getByTestId("pending").innerText();
    const outside = all.split(pending).join("");
    expect(outside).not.toContain("50,000");
  }
});

test("whole freeze needs two people: Officer proposes, Supervisor approves", async ({ page }) => {
  await page.goto("/memo?a=D09001");
  await expect(page.getByTestId("approve")).toBeDisabled();
  await page.getByTestId("propose").click();
  await expect(page.getByTestId("approve")).toBeDisabled();
  await page.getByTestId("role-supervisor").click();
  await expect(page.getByTestId("propose")).toBeDisabled();
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("wf-status")).toHaveText("Whole freeze proposed by Officer and approved by Supervisor.");
});

test("the shop gets no whole-freeze buttons", async ({ page }) => {
  await page.goto("/memo?a=D00191");
  await expect(page.getByTestId("propose")).toHaveCount(0);
});

test("prints on one A4 page with the simulation watermark", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "PDF needs Chromium");
  await page.goto("/memo?a=D00191");
  await expect(page.getByTestId("hold-line")).toContainText("₹6,950");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".watermark")).toBeVisible();
  const pdf = await page.pdf({ format: "A4" });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBe(1);
});

test("phone width: the memo does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/memo?a=D09001");
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw).toBeLessThanOrEqual(cw);
});

test("badges show amber when deadlines rest on unchecked sources", async ({ page }) => {
  await page.goto("/memo?a=D09001");
  await expect(page.getByTestId("badge-timed")).toHaveAttribute("data-state", "caution");
  await expect(page.getByTestId("badge-timed")).toContainText("Yes, with caution");
});

test("the memo says what the model may do: it can only help an officer PROPOSE a whole freeze", async ({ page }) => {
  await page.goto("/memo?a=D09001");
  await expect(page.getByTestId("memo")).toContainText("one of the conditions (R2) before an officer may propose a whole-account freeze");
  await expect(page.getByTestId("memo")).not.toContainText("cannot place or approve a hold");
});

test("the shop memo hides sub-rupee hops and sums them", async ({ page }) => {
  await page.goto("/memo?a=D00191");
  for (const cell of await page.getByTestId("hops").locator("tbody tr td:last-child").allInnerTexts()) {
    expect(cell).not.toMatch(/^₹0\.\d\d$/);
  }
  await expect(page.getByTestId("tiny-hops")).toContainText("under ₹1");
});

test("the proof footer's fingerprint equals sha256 of data/demo.json", async ({ page }) => {
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(readFileSync(new URL("../data/demo.json", import.meta.url))).digest("hex");
  await page.goto("/memo");
  await expect(page.getByTestId("sha")).toHaveText(sha);
});
