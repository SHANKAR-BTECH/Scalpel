import { test, expect, type Browser, type Page } from "@playwright/test";

async function as(browser: Browser, who: string): Promise<Page> {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByTestId(`login-${who}`).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  return p;
}

/** Priya builds her money trail on CASE-001 the way she would by hand: pin each victim's payment, open the account
 *  that received it, select the payments out after the victim's credit, pin them, and save. */
async function buildTrail(p: Page, upto = 6) {
  await p.goto("/case/CASE-001/work");
  const utrs = await p.getByTestId("utr").allInnerTexts();
  for (const utr of utrs.slice(0, upto)) {
    await p.getByTestId("utr").filter({ hasText: utr }).click();
    await expect(p.getByTestId("result-pay")).toContainText(utr);
    const pin = p.getByTestId("pin-payment");
    if (await pin.isEnabled()) await pin.click();
    await p.getByTestId("open-statement").click();
    await p.getByTestId("tool-run").click();
    const row = p.locator(`[data-testid=st-row][data-id=${utr}]`);
    await expect(row).toBeVisible();
    await row.getByTestId("tick-after").click();
    const n = Number((await p.getByTestId("pin-selected").innerText()).match(/\((\d+)\)/)![1]);
    if (n > 0) await p.getByTestId("pin-selected").click();
  }
  await p.getByTestId("save-trail").click();
  await expect(p.getByTestId("save-result")).toContainText("Trail saved");
  await p.goto("/case/CASE-001");
}

/** The supervisor's checks: open each piece of evidence, tick it, work out the spot-check share, then approve. */
async function reviewAndApprove(p: Page) {
  for (const k of ["path", "amount", "police", "impact"]) {
    await p.getByTestId(`open-${k}`).click();
    if (k === "amount" && (await p.getByTestId("spot").count())) {
      const s = p.getByTestId("spot");
      const [a, b, v] = await Promise.all(["data-amount", "data-before", "data-victim"].map((x) => s.getAttribute(x)));
      await p.getByTestId("spot-in").fill(String((Number(a) * Number(v)) / Number(b) / 100));
    }
    await p.getByTestId(`checked-${k}`).check();
  }
  await expect(p.getByTestId("approve")).toBeEnabled();
  await p.getByTestId("approve").click();
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

  await buildTrail(priya);
  await expect(priya.getByTestId("trail-graph").first()).toBeVisible();
  // Priya works the decision cards with the AI until one suggests a hold, and agrees with it.
  let acct: string | null = null;
  for (let i = 0; i < 10 && !acct; i++) {
    const card = priya.getByTestId("decision-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    const id = (await card.getAttribute("data-account"))!;
    const hold = (await card.getByTestId("hold-amount").count()) > 0;
    if (hold && !(await card.getByTestId("hold-amount").inputValue())) await card.getByTestId("use-ai-amount").click();
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
  // Vikram can't approve from the summary: he opens each check, ticks it, and redoes the spot-check share.
  await expect(vikram.getByTestId("approve")).toBeDisabled();
  await reviewAndApprove(vikram);
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
  await expect(imran.getByTestId("alert-card")).toHaveCount(10);
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
  await imran.getByTestId("ai-check").click();
  // The signs come from his clues, with the data behind each one.
  await expect(imran.getByTestId("sign-many")).toHaveAttribute("data-seen", "true");
  await expect(imran.getByTestId("sign-gateway")).toContainText("gateway");
  await expect(imran.getByTestId("ready-BAR_IMEI")).toHaveAttribute("data-ready", "true");
  await imran.getByTestId("save-trace").click();
  await expect(imran.getByTestId("save-result")).toContainText("version 2");
  await imran.goto("/telco/RIG-1");
  await expect(imran.getByTestId("opt-BAR_IMEI")).toHaveAttribute("data-ready", "yes");
  const csv = imran.waitForEvent("download");
  await imran.getByTestId("download-calls").click();
  const chunks: Buffer[] = [];
  for await (const c of await (await csv).createReadStream()) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString();
  expect(text).toContain("Telco-A evidence file");
  expect(text).toContain("Start (IST)");
  expect(text.split("\r\n").length).toBeGreaterThan(14);
  await imran.getByTestId("t-option-BAR_IMEI").check();
  // Commit first: nothing is pre-ticked, so the button waits until he cites the pins his call rests on.
  await expect(imran.getByTestId("call-builder")).toBeVisible();
  await expect(imran.getByTestId("telco-decide")).toBeDisabled();
  await expect(imran.getByTestId("call-problems")).toContainText("Tick the pins");
  await imran.locator("[data-testid=cite][data-key^='stats::']").check();
  await expect(imran.getByTestId("call-ok")).toBeVisible();
  await imran.getByTestId("t-reason").selectOption("Would cut off genuine customers");
  await imran.getByTestId("t-ceir").check();
  if (await imran.getByTestId("t-second").count()) await imran.getByTestId("t-second").selectOption({ index: 1 });
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
  await priya.goto("/case/CASE-001");
  const card = priya.getByTestId("decision-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  if (await card.getByTestId("use-ai-amount").count()) await card.getByTestId("use-ai-amount").click();
  await card.getByTestId(`decide-${await card.getAttribute("data-account")}`).click();
  await expect(priya.locator("[data-testid=decided-chip],[data-testid=pending-chip]").first()).toBeVisible({ timeout: 10_000 });
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
  await p.goto("/case/CASE-001/work");
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
  await buildTrail(priya);
  const card = priya.getByTestId("decision-card").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId("why-toggle").click();
  await expect(card.getByTestId("why").locator("li")).toHaveCount(6);
  // Unsure cards (grey-zone score) come first and need no sign-off; overruling a confident AI does.
  let acct = "";
  for (let i = 0; i < 6; i++) {
    acct = (await card.getAttribute("data-account"))!;
    await card.getByText("Don't hold, keep watching").click();
    if (await card.getByTestId("needs-signoff").count()) break;
    await card.locator("select[name=reason]").selectOption({ index: 2 });
    await card.getByTestId(`decide-${acct}`).click();
    await expect(card).not.toHaveAttribute("data-account", acct, { timeout: 10_000 });
  }
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
  await expect(imran.getByTestId("ai-result")).toContainText("The decision is yours");
  await expect(imran.getByTestId("ready-REVERIFY")).toHaveAttribute("data-ready", "false");
  await expect(imran.getByTestId("ready-REVERIFY")).toContainText("swap");
});

test("Priya follows the money herself; decisions open only for accounts her saved trail reaches", async ({ browser }) => {
  test.setTimeout(90_000);
  const priya = await as(browser, "priya");
  // Reset seeded a half-built trail: two payments pinned, so a few cards are open and the rest are not.
  await priya.goto("/case/CASE-002");
  await expect(priya.getByTestId("trail-card")).toContainText("Follow the money first");
  await expect(priya.getByTestId("board-locked")).toBeVisible();
  await expect(priya.getByTestId("decision-card")).toHaveCount(0);
  await priya.goto("/case/CASE-001");
  await expect(priya.getByTestId("trail-card")).toContainText("version 1");

  await priya.getByTestId("open-trail").click();
  await priya.waitForURL("**/case/CASE-001/work");
  const utr = (await priya.getByTestId("utr").nth(2).innerText()).trim();
  await priya.getByTestId("utr").nth(2).click();
  await priya.getByTestId("pin-payment").click();
  await priya.getByTestId("open-statement").click();
  await priya.getByTestId("tool-run").click();
  const rows = priya.getByTestId("st-row");
  await expect(rows.first()).toBeVisible();
  // The statement never marks victims' money.
  await expect(priya.getByTestId("statement")).not.toContainText(/victim/i);
  // Share calculator: she picks a payment out and types her own working.
  await priya.locator("[data-testid=st-row][data-dir=out]").first().getByTestId("calc-row").click();
  await priya.getByTestId("calc-in").fill("100000");
  await expect(priya.getByTestId("calc-out")).toContainText("of victims' money left with this payment");
  // Pin the payments out after the victim's credit, and check.
  await priya.locator(`[data-testid=st-row][data-id=${utr}]`).getByTestId("tick-after").click();
  await priya.getByTestId("pin-selected").click();
  await priya.getByTestId("ai-check").click();
  await expect(priya.getByTestId("money-balance")).toContainText("Reported lost");
  // KYC card
  await priya.getByTestId("open-kyc").click();
  await priya.getByTestId("tool-run").click();
  await expect(priya.getByTestId("kyc-card")).toContainText("Police request");
  await priya.getByTestId("pin-kyc").click();
  await priya.getByTestId("save-trail").click();
  await expect(priya.getByTestId("save-result")).toContainText("version 2");

  await priya.goto("/case/CASE-001");
  await expect(priya.getByTestId("trail-card")).toContainText("version 2");
  const card = priya.getByTestId("decision-card").first();
  await expect(card).toBeVisible();
  await expect(priya.getByTestId("case-log")).toContainText("saved the money trail, version 2");
});

test("Imran hunts the linked SIMs, spares the real owner of a stolen ID, and suspends the shop", async ({ browser }) => {
  const imran = await as(browser, "imran");
  await imran.goto("/telco/work?alert=RIG-3");
  await imran.getByTestId("tool-run").click(); // the handset
  await imran.getByTestId("pin-handset").click();
  await imran.getByTestId("tool-group").click();
  await imran.getByTestId("tool-input").fill("+91 88375 00012");
  await imran.getByTestId("tool-run").click();
  await expect(imran.getByTestId("over-limit")).toBeVisible();
  await expect(imran.getByTestId("result-group")).toContainText("Lakshmi Kumari");
  await imran.getByTestId("pin-group").click();
  // The shop that sold it, and the reused ID.
  await imran.getByTestId("tool-sub").click();
  await imran.getByTestId("tool-input").fill("+91 88375 00012");
  await imran.getByTestId("tool-run").click();
  await imran.getByTestId("result-sub").getByRole("button", { name: /^XXXX/ }).click();
  await imran.getByTestId("tool-run").click();
  await imran.getByTestId("pin-doc").click();
  await imran.getByTestId("result-doc").getByRole("button", { name: /^POS-/ }).first().click();
  await imran.getByTestId("tool-run").click();
  await imran.getByTestId("pin-shop").click();
  await imran.getByTestId("save-trace").click();
  await expect(imran.getByTestId("save-result")).toContainText("version");
  await imran.goto("/telco/RIG-3");
  // Block everyone: refused as a near miss, with a count but no name. He finds her in the list himself.
  await imran.getByTestId("group-all").click();
  await imran.getByTestId("group-BLOCK").check();
  await imran.getByTestId("group-act").click();
  await expect(imran.getByTestId("group-act-result")).toContainText("1 of the ticked SIMs");
  await expect(imran.getByTestId("group-act-result")).not.toContainText("Lakshmi");
  await expect(imran.getByTestId("group-log-row").first()).toContainText("Near miss");
  // Untick her and block the rest.
  await imran.getByRole("checkbox", { name: "Tick +91 94311 27608" }).uncheck();
  await imran.getByTestId("group-act").click();
  await expect(imran.getByTestId("group-log-row").first()).toHaveAttribute("data-outcome", "REFUSED");
  await expect(imran.locator('[data-testid="group-log-row"][data-outcome="DONE"]')).toHaveCount(1);
  await imran.getByTestId("shop-suspend").click();
  await expect(imran.getByTestId("shop-done")).toBeVisible();
  // Who else gets cut off, under each option.
  await expect(imran.getByTestId("blast-BAR_IMEI")).toContainText("SIMs inside this handset");
  const meera = await as(browser, "meera");
  await meera.goto("/assure");
  await expect(meera.getByTestId("group-ledger-row")).toHaveCount(2);
  await expect(meera.getByTestId("shop-ledger-row")).toHaveCount(1);
});

test("Meera's proof: freeze-as-asked against the team, a sampled line re-checked, then signed", async ({ browser }) => {
  const priya = await as(browser, "priya");
  await buildTrail(priya);
  let acct: string | null = null;
  for (let i = 0; i < 10 && !acct; i++) {
    const card = priya.getByTestId("decision-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    const id = (await card.getAttribute("data-account"))!;
    const hold = (await card.getByTestId("hold-amount").count()) > 0;
    if (hold && !(await card.getByTestId("hold-amount").inputValue())) await card.getByTestId("use-ai-amount").click();
    await card.getByTestId(`decide-${id}`).click();
    await expect(priya.locator(`[data-testid=decision-card][data-account=${id}]`)).toHaveCount(0, { timeout: 10_000 });
    if (hold) acct = id;
  }
  const vikram = await as(browser, "vikram");
  await vikram.goto("/approvals");
  await reviewAndApprove(vikram);
  await expect(vikram.getByTestId("approve")).toHaveCount(0, { timeout: 10_000 });

  const meera = await as(browser, "meera");
  await meera.goto("/assure");
  await meera.getByTestId("proof-link").first().click();
  await meera.waitForURL("**/assure/proof/CASE-001");
  await expect(meera.getByTestId("proof-kpis")).toBeVisible();
  await expect(meera.getByTestId("kpi-over")).toHaveText("₹0");
  await expect(meera.getByTestId("kpi-over-fast")).not.toHaveText("₹0");
  await expect(meera.getByTestId("proof-undecided")).toContainText("not decided yet");
  await expect(meera.getByTestId("proof-rules")).toContainText("Proposed, not yet in force");
  const picks = meera.getByTestId("pick");
  const n = await picks.count();
  for (let i = 0; i < n; i++) {
    const pk = picks.nth(i);
    const [a, b, v] = await Promise.all(["data-amount", "data-before", "data-victim"].map((x) => pk.getAttribute(x)));
    await pk.getByTestId("pick-in").fill("1");
    await pk.getByTestId("pick-check").click();
    await expect(pk.getByTestId("pick-check-result")).toContainText("doesn't match");
    await pk.getByTestId("pick-in").fill(String(Math.round((Number(a) * Number(v)) / Number(b)) / 100));
    await pk.getByTestId("pick-check").click();
    await expect(pk.getByTestId("pick-result")).toBeVisible({ timeout: 10_000 });
  }
  await meera.getByTestId("proof-sign-btn").click();
  await expect(meera.getByTestId("proof-signed")).toBeVisible({ timeout: 10_000 });
  await meera.goto("/assure");
  await expect(meera.getByTestId("proof-link").first()).toContainText("Signed");
});

test("a saved trace that is still short keeps the decision button on screen, with a Find it link for each missing clue", async ({ browser }) => {
  const imran = await as(browser, "imran");
  await imran.goto("/telco/work?alert=RIG-2");
  await imran.getByTestId("tool-run").click();
  await imran.getByTestId("pin-handset").click();
  await imran.getByTestId("save-trace").click();
  await expect(imran.getByTestId("save-result")).toBeVisible();
  await imran.goto("/telco/RIG-2");
  await expect(imran.getByTestId("none-ready")).toBeVisible();
  await expect(imran.getByTestId("telco-decide")).toBeDisabled();
  const find = imran.locator("[data-testid^=find-]").first();
  await expect(find).toHaveAttribute("href", /\/telco\/work\?alert=RIG-2&tool=\w+&q=/);
  await find.click();
  await expect(imran).toHaveURL(/tool=/);
  await expect(imran.getByTestId("tool-run")).toBeVisible();
});

test("ABUSE-1: real papers tempt a clear; Imran cites the reports, answers his own pins against him, and a colleague checks it", async ({ browser }) => {
  const imran = await as(browser, "imran");
  await imran.goto("/telco/work?alert=ABUSE-1");
  await imran.getByTestId("tool-run").click();
  const sub = imran.getByTestId("result-sub");
  await expect(sub).toContainText("QuickRupee");
  await expect(sub).toContainText("bank's KYC desk");
  await sub.getByTestId("pin").filter({ hasText: "Pin the number" }).click();
  const checks = imran.getByTestId("sub-checks");
  // Every check can be pinned, found or not: the buttons don't give the answer away.
  await expect(checks.getByTestId("pin")).toHaveCount(6);
  await checks.getByTestId("pin").filter({ hasText: "sender registration" }).click();
  await checks.getByTestId("pin").filter({ hasText: "citizen reports" }).click();
  await checks.getByTestId("pin").filter({ hasText: "police letter" }).click();
  const num = await imran.getByTestId("tool-input").inputValue();
  await imran.getByTestId("tool-cdr").click();
  await imran.getByTestId("tool-input").fill(num);
  await imran.getByTestId("tool-run").click();
  await imran.getByTestId("pin-stats").click();
  await imran.getByTestId("save-trace").click();
  await expect(imran.getByTestId("save-result")).toBeVisible();
  await imran.goto("/telco/ABUSE-1");
  await expect(imran.getByTestId("trace-shows")).toContainText("none on record");
  await imran.getByTestId("t-option-DISCONNECT").check();
  await imran.locator("[data-testid=cite][data-key^='chakshu::']").check();
  await imran.locator("[data-testid=cite][data-key^='stats::']").check();
  // His own sender-registration pin argues against cutting the line: he must answer it.
  const row = imran.getByTestId("against-row").first();
  await expect(row).toContainText("registered business sender");
  await expect(imran.getByTestId("telco-decide")).toBeDisabled();
  await row.getByTestId("answer").selectOption({ index: 1 });
  await expect(imran.getByTestId("call-ok")).toBeVisible();
  await expect(imran.getByTestId("t-second")).toBeVisible();
  await imran.getByTestId("telco-decide").click();
  await expect(imran.getByTestId("telco-decide-result")).toContainText(/second person/);
  await imran.getByTestId("t-second").selectOption("Arjun Nair, senior analyst");
  await imran.getByTestId("telco-decide").click();
  await expect(imran.getByTestId("telco-decided")).toContainText("Agreed with the AI", { timeout: 10_000 });
  await expect(imran.getByTestId("telco-clash")).toContainText("registration says who owns the line");
  const meera = await as(browser, "meera");
  await expect(meera.getByTestId("telco-cited")).toContainText("answered 1 pin against it");
});

test("police requests: the hacked mailbox is caught by the call back, the typo number is left out, and Meera sees both", async ({ browser }) => {
  const imran = await as(browser, "imran");
  await imran.goto("/telco/police");
  await expect(imran.getByTestId("lea-row")).toHaveCount(5);
  // LEA-2: address and case look right; the assistant says it can't tell; the call back can.
  await imran.goto("/telco/police/LEA-2");
  await expect(imran.getByTestId("lea-preread")).toContainText("only a call back tells them apart");
  await imran.getByTestId("lea-callback").click();
  await expect(imran.getByTestId("lea-callback-result")).toContainText("directory first");
  await imran.getByTestId("lea-officer-name").fill("Ajay Kumar Singh");
  await imran.getByTestId("lea-officer").click();
  await expect(imran.getByTestId("lea-officer-done")).toContainText("Superintendent");
  await imran.getByTestId("lea-callback").click();
  await expect(imran.getByTestId("lea-callback-done")).toContainText("sent no such request");
  await imran.getByTestId("lea-REFUSE").check();
  await imran.getByTestId("lea-reason").selectOption("The station did not send it");
  await imran.getByTestId("lea-note").fill("Your office says it sent no such request. Nothing released; please check the mailbox.");
  await imran.getByTestId("lea-decide").click();
  await expect(imran.getByTestId("lea-done")).toContainText("Refused", { timeout: 10_000 });
  // LEA-3: one number is a stranger's. He looks each up and releases the other two.
  await imran.goto("/telco/police/LEA-3");
  await imran.getByTestId("lea-officer-name").fill("Meenakshi Iyer");
  await imran.getByTestId("lea-officer").click();
  await expect(imran.getByTestId("lea-officer-done")).toBeVisible();
  await imran.getByTestId("lea-callback").click();
  await expect(imran.getByTestId("lea-callback-done")).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await imran.getByTestId("lea-number-check").first().click();
    await expect(imran.getByTestId("lea-number-done")).toHaveCount(i + 1);
  }
  await expect(imran.getByTestId("lea-number-done").nth(2)).toContainText("Postpaid");
  await imran.getByTestId("lea-NARROW").check();
  await imran.getByTestId("lea-pick").nth(0).check();
  await imran.getByTestId("lea-pick").nth(1).check();
  await imran.getByTestId("lea-reason").selectOption("Some numbers are not in the case");
  await imran.getByTestId("lea-note").fill("The third number is an unrelated customer; please recheck it in your file.");
  await imran.getByTestId("lea-decide").click();
  await expect(imran.getByTestId("lea-done")).toContainText("Released less", { timeout: 10_000 });
  const file = imran.waitForEvent("download");
  await imran.getByTestId("lea-download").click();
  const chunks: Buffer[] = [];
  for await (const c of await (await file).createReadStream()) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString();
  expect(text).toContain("2 of 3 number(s)");
  expect(text).toContain("Section 63(4)");
  const meera = await as(browser, "meera");
  await meera.goto("/assure");
  await expect(meera.getByTestId("lea-ledger-row")).toHaveCount(2);
});
