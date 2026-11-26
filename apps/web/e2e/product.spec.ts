import { test, expect, type Browser, type Page } from "@playwright/test";

async function as(browser: Browser, who: string): Promise<Page> {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByTestId(`login-${who}`).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  return p;
}

test.beforeEach(async ({ browser }) => {
  const admin = await as(browser, "asha");
  await admin.getByTestId("reset").click();
  await expect(admin.getByTestId("reset-result")).toContainText("reset");
  await admin.context().close();
});

test("officer proposes, supervisor is notified live and approves, holder explains, release", async ({ browser }) => {
  const priya = await as(browser, "priya");
  const vikram = await as(browser, "vikram");
  await expect(vikram.getByRole("heading", { name: "Nothing waiting" })).toBeVisible();

  await priya.getByTestId("case-row").first().click();
  await expect(priya.getByTestId("trail-graph").first()).toBeVisible();
  // Priya works the decision cards with the AI until one suggests a hold, and agrees with it.
  await priya.getByTestId("start-work").click();
  let acct: string | null = null;
  for (let i = 0; i < 10 && !acct; i++) {
    const card = priya.getByTestId("decision-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    const id = (await card.getAttribute("data-account"))!;
    const hold = (await card.getByText("Hold the victims' money").count()) > 0;
    await card.getByTestId(`decide-${id}`).click();
    await expect(priya.getByTestId("flash")).toBeVisible();
    await expect(priya.locator(`[data-testid=decision-card][data-account=${id}]`)).toHaveCount(0, { timeout: 10_000 });
    if (hold) acct = id;
  }
  expect(acct).not.toBeNull();
  await expect(priya.locator(`[data-account=${acct}]`).getByTestId("pending-chip")).toBeVisible();

  // Vikram's page updates by itself: bell count and the waiting item.
  await expect(vikram.getByTestId("bell-count")).toHaveText("1", { timeout: 12_000 });
  await expect(vikram.getByTestId("pending-item")).toHaveCount(1, { timeout: 12_000 });
  await vikram.getByTestId("approve").click();
  await expect(vikram.getByTestId("flash")).toContainText("Hold H-");

  await expect(priya.locator(`[data-account=${acct}]`).getByTestId("held-chip")).toBeVisible({ timeout: 12_000 });
  await expect(priya.getByTestId("bell-count")).toHaveText("1", { timeout: 12_000 });

  // The account holder looks up the hold with the reference and phone digits from the demo helper.
  const holder = await (await browser.newContext()).newPage();
  await holder.goto("/portal");
  const helper = await holder.getByTestId("demo-helper").locator("li").first().innerText();
  const [, ref, last4] = helper.match(/(H-\d{5}) · phone ending (\d{4})/)!;
  await holder.locator("#ref").fill(ref!);
  await holder.locator("#last4").fill(last4 === "0000" ? "1111" : "0000");
  await holder.getByTestId("lookup").click();
  await expect(holder.getByTestId("lookup-result")).toHaveText("We couldn't find a hold with those details.");
  await holder.locator("#last4").fill(last4!);
  await holder.getByTestId("lookup").click();
  await expect(holder).toHaveURL(/portal\/status/, { timeout: 10_000 });
  await expect(holder.getByTestId("holder-messages")).toContainText(ref!);
  await holder.locator("textarea[name=text]").fill("This was a customer's payment for a blouse order.");
  await holder.getByTestId("reply").click();
  await expect(holder.getByTestId("flash")).toContainText("reached the bank");

  await priya.goto("/holds");
  await priya.getByTestId("grm").click();
  await expect(priya.getByTestId("flash")).toContainText("15-day");
  await priya.getByTestId("propose-release").click();
  await expect(priya.getByTestId("flash")).toContainText("supervisor");
  await vikram.goto("/approvals");
  await vikram.getByTestId("approve").click();
  await expect(vikram.getByTestId("flash")).toContainText("released");
});

test("each person only reaches their own pages", async ({ browser }) => {
  const priya = await as(browser, "priya");
  await priya.goto("/approvals");
  await expect(priya).toHaveURL(/login\?denied/);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/inbox");
  await expect(anon).toHaveURL(/\/login/);
});

test("Telco-A engineer builds the trace, the decision opens only when the evidence fits, DoT gets the report; spoofed numbers are refused", async ({ browser }) => {
  const imran = await as(browser, "imran");
  await expect(imran.getByTestId("alert-card")).toHaveCount(8);
  await imran.goto("/telco/RIG-1");
  // Reset leaves a half-built trace: handset and tower only. Barring the handset is not open yet.
  await expect(imran.getByTestId("trace-saved")).toContainText("2 pins");
  await expect(imran.getByTestId("opt-BAR_IMEI")).toHaveAttribute("data-ready", "no");
  await expect(imran.getByTestId("opt-BAR_IMEI")).toContainText("SIMs");
  await expect(imran.getByTestId("telco-clash")).toHaveCount(0);
  await imran.getByTestId("open-workbench").click();
  await imran.waitForURL("**/telco/work?alert=RIG-1");
  await expect(imran.getByTestId("trace-step")).toHaveCount(2);
  // Handset: look it up and pin all its SIMs.
  await imran.getByTestId("tool-run").click();
  await imran.getByTestId("pin-all-sims").click();
  // Call records on the handset, then pin the statistics.
  const imei = await imran.getByTestId("tool-input").inputValue();
  await imran.getByTestId("tool-cdr").click();
  await imran.getByTestId("tool-input").fill(imei);
  await imran.getByTestId("tool-run").click();
  await expect(imran.getByTestId("cdr-stats")).toBeVisible();
  await imran.getByTestId("pin-stats").click();
  await imran.getByTestId("tick-many").check();
  await imran.getByTestId("ai-check").click();
  await expect(imran.getByTestId("ready-BAR_IMEI")).toHaveAttribute("data-ready", "true");
  await imran.getByTestId("save-trace").click();
  await expect(imran.getByTestId("save-result")).toContainText("version 2");
  await imran.goto("/telco/RIG-1");
  await expect(imran.getByTestId("opt-BAR_IMEI")).toHaveAttribute("data-ready", "yes");
  await imran.getByTestId("t-option-BAR_IMEI").check();
  await imran.getByTestId("t-reason").selectOption("Would cut off genuine customers");
  await imran.getByTestId("t-ceir").check();
  await imran.getByTestId("telco-decide").click();
  await expect(imran.getByTestId("telco-decided")).toContainText("Overruled the AI", { timeout: 10_000 });
  await expect(imran.getByTestId("telco-decided")).toContainText("Reported to DoT");
  await expect(imran.getByTestId("telco-clash")).toContainText("genuine business lines");
  await imran.getByTestId("replay-trace").click();
  await expect(imran.getByTestId("trace-done")).toBeVisible({ timeout: 15_000 });
  await imran.getByTestId("police-packet").click();
  await expect(imran.getByTestId("packet-done")).toBeVisible({ timeout: 10_000 });
  await imran.goto("/telco/work?alert=RIG-1");
  await expect(imran.getByTestId("save-locked")).toBeVisible();
  await imran.goto("/telco");
  const spoof = imran.getByTestId("spoofed").locator("li").first();
  await spoof.getByTestId("try-spoof").click();
  await expect(spoof).toContainText(/refused/i, { timeout: 10_000 });
  await imran.getByTestId("sim-check").click();
  await expect(imran.getByTestId("sim-check-result")).toContainText("swapped");
  const meera = await as(browser, "meera");
  await expect(meera.getByTestId("telco-ledger-row")).toHaveCount(1);
  await expect(meera.getByTestId("telco-evidence")).toContainText("Trace v2");
  await expect(meera.getByTestId("telco-evidence")).toContainText("CEIR");
});

test("evidence file downloads and verifies; a changed file is caught", async ({ browser }) => {
  const priya = await as(browser, "priya");
  await priya.getByTestId("case-row").first().click();
  await priya.getByTestId("start-work").click();
  const card = priya.getByTestId("decision-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId(`decide-${await card.getAttribute("data-account")}`).click();
  await expect(priya.getByTestId("decided-chip").first()).toBeVisible({ timeout: 10_000 });
  const meera = await as(browser, "meera");
  const dl = meera.waitForEvent("download");
  await meera.locator("[data-testid^=evidence-CASE]").first().click();
  const chunks: Buffer[] = [];
  for await (const c of await (await dl).createReadStream()) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString();
  const pub = await (await browser.newContext()).newPage();
  await pub.goto("/verify");
  await pub.getByText("or paste the file's text").click();
  await pub.getByTestId("verify-text").fill(text);
  await expect(pub.getByTestId("verify-result")).toContainText("Intact");
  await pub.getByTestId("verify-text").fill(text.replace(/"actor": "priya"/, '"actor": "mallory"'));
  await expect(pub.getByTestId("verify-result")).toContainText("Not intact");
});

test("pages fit a phone screen", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const fits = async () => expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const path of ["/", "/portal", "/verify", "/login"]) { await p.goto(path); await fits(); }
  await p.getByTestId("login-priya").click();
  await p.waitForURL("**/inbox");
  await fits();
  await p.getByTestId("case-row").first().click();
  await p.waitForURL("**/case/**");
  await fits();
  await p.goto("/mules");
  await fits();
  await p.context().clearCookies();
  await p.goto("/login");
  await p.getByTestId("login-imran").click();
  await p.waitForURL("**/telco");
  await fits();
  await p.goto("/telco/RIG-1");
  await fits();
  await p.goto("/telco/work");
  await fits();
  await p.goto("/telco/work?alert=RIG-1");
  await fits();
});

test("officer and AI decide together; an overrule goes to the supervisor, who sends it back; compliance sees it", async ({ browser }) => {
  test.setTimeout(90_000);
  const priya = await as(browser, "priya");
  await priya.getByTestId("case-row").first().click();
  await priya.getByTestId("start-work").click();
  await expect(priya.getByTestId("trace-log")).toContainText("ms", { timeout: 10_000 });
  const card = priya.getByTestId("decision-card").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const acct = await card.getAttribute("data-account");
  await card.getByTestId("why-toggle").click();
  await expect(card.getByTestId("why").locator("li")).toHaveCount(6);
  await card.getByText("Don't hold, keep watching").click();
  await expect(card.getByTestId("needs-signoff")).toBeVisible();
  await card.locator("select[name=reason]").selectOption("Other");
  await card.locator("input[name=note]").fill("Checked the branch: long-time customer");
  await card.getByTestId(`decide-${acct}`).click();
  await expect(priya.getByTestId("flash")).toContainText("supervisor will check");

  const vikram = await as(browser, "vikram");
  await vikram.getByTestId("overrule-item").first().click();
  const detail = vikram.getByTestId("detail");
  await expect(detail).toContainText("Don't hold");
  await detail.getByPlaceholder("Why (the officer sees this)").fill("Money left within minutes; hold it");
  await detail.getByTestId("signoff-back").click();
  await expect(vikram.getByTestId("flash")).toContainText("Sent back");

  await priya.reload();
  await expect(priya.getByTestId("returned-note")).toContainText("Money left within minutes", { timeout: 10_000 });

  const meera = await as(browser, "meera");
  await expect(meera.getByTestId("ledger-row").first()).toContainText("sent back");
  await meera.getByTestId("tamper-test").click();
  await expect(meera.getByTestId("flash")).toContainText("caught it");
});

test("an alert with no trace keeps the decision locked; the free workbench only looks things up", async ({ browser }) => {
  const imran = await as(browser, "imran");
  await imran.goto("/telco/SIM-2");
  await expect(imran.getByTestId("trace-empty")).toBeVisible();
  await expect(imran.getByTestId("decide-locked")).toBeVisible();
  await expect(imran.getByTestId("ai-locked")).toBeVisible();
  await expect(imran.getByTestId("telco-decide")).toHaveCount(0);
  await expect(imran.getByTestId("police-packet")).toHaveCount(0);
  // Free workbench: leads, lookups and pins, but no check or save outside an alert.
  await imran.goto("/telco/work");
  await expect(imran.getByTestId("pins-empty")).toBeVisible();
  await imran.getByTestId("lead").filter({ hasText: "RIG-2" }).click();
  await imran.getByTestId("tool-run").click();
  await expect(imran.getByTestId("imei-sim").first()).toBeVisible();
  await imran.getByTestId("pin-handset").click();
  await expect(imran.getByTestId("trace-step")).toHaveCount(1);
  await expect(imran.getByTestId("ai-check")).toHaveCount(0);
  await expect(imran.getByTestId("save-panel")).toHaveCount(0);
  // On an alert: a subscriber lookup from a SIM, pin the number, and the check says what is still missing.
  await imran.goto("/telco/work?alert=SIM-2");
  await imran.getByTestId("tool-run").click();
  await expect(imran.getByTestId("result-sub")).toContainText("Telco-A subscriber");
  await imran.getByTestId("result-sub").getByTestId("pin").first().click();
  await imran.getByTestId("ai-check").click();
  await expect(imran.getByTestId("ai-result")).toContainText("only your");
  await expect(imran.getByTestId("ready-REVERIFY")).toHaveAttribute("data-ready", "false");
  await expect(imran.getByTestId("ready-REVERIFY")).toContainText("swap");
});
