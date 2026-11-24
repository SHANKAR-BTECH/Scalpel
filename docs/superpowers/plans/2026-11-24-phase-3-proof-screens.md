# Scalpel Phase 3 — Proof Screens Implementation Plan (final, v3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Next.js site that proves Scalpel's claim, *"hold the right amount, legally, and show the proof"*, using numbers the phase 2 grader already produces. Plus one locked, harder test world.

**Architecture:** The Python grader is the only code that reads hidden answers. It writes one `apps/web/data/demo.json` file holding totals, series and the memo cases. A new sim-runner command writes the engine's own Gate and clock results for the memo cases into `memo.json` (no truth involved). The Next.js app renders these files statically, with no database and no login.

**Tech Stack:** Next.js 16.4.6, React 19, Tailwind 4, Recharts 3, zod 4, Vitest 5, @playwright/test 1.63.0 (matches the preinstalled browser), TypeScript (repo version), Python 3.12 with existing pins.

**Spec:** `/mnt/project-files/scalpel-plan/PHASE-3-PLAN.md` (the short version for Shankar; the decisions below come from it, two roasts, a grill and the P1–P3 research in `scalpel-research/reports/Scalpel legal sources P1 to P3.md`).

## Global Constraints

- Banner on every page: `Simulation with fictional data. Not legal advice.` The memo also prints the watermark `SIMULATION – NOT AN OFFICIAL ORDER`.
- Money is whole paise in data and shown with Indian grouping (₹3,28,679).
- Words: "the mule-score model", "simple rule to beat" / "warning-sign rule". Never "no-AI baseline", never bare "AI".
- Nothing under `apps/` reads `truth.json` (test). Every number derived from hidden answers is tagged `known only afterwards`.
- No industry 15.12× figure anywhere (test, Task 0).
- **Cut rule: remove screens, never rules.** The telecom rules R5–R7, the 6 phone clues, the TRAI clock, `harmMultiplier` and all their tests stay untouched. The engine test count must not go down.
- Phase 3 does not edit `policies/*.yaml`. Memo text, sources and verified flags are read from them at build time, so later policy fixes flow through with one re-export.
- A badge cites only sources with `verified: true`. A rule whose sources are all unverified is listed under "Still being checked" with an *unverified* tag, and its badge shows "source being checked" instead of a citation.
- The RBI 2026 document is cited as a **draft** ("proposed from 1 Apr 2027; final directions expected by 31 Dec 2026"). It never backs an "Allowed?" pass by itself. The power to hold comes from the police request under BNSS s.106 and the CFCFRMS lien.
- Officer capacity is K = 10 accounts per hour for every lane that acts.
- The two-person rule stays: a whole freeze is only ever *proposed* by the Officer role and needs the Supervisor role to approve. The role switcher is labelled "demo roles, not real login".

## Review Focus

1. **Memo numbers drift from engine output.** Every amount on the memo (balance, traced, hold) must equal `decisions/C.json` for that account. A test compares them (Task 4).
2. **The missed-money buckets don't add up.** The four buckets must sum exactly to total victim money for every policy, using a fixed order (Task 1).
3. **Slider at hour 0 or 72, or rupee formatting of 0 or crores:** no NaN, no blank, no `e+` (Tasks 0, 3).
4. **v3 looks rigged.** Its settings, the stronger simple rule and the pass margin are locked before any grading run, and the result is shown whatever it is (Task 5).
5. **Printing:** the memo fits one A4 page with the banner and watermark; at 390 px width no page scrolls sideways (Tasks 3, 4).

---

### Task 0: Drop 15.12×, add the web app shell and its CI job

**Files:**
- Modify: `CLAUDE.md`, `docs/ARCHITECTURE.md` (lines ~48, ~533), `packages/engine/src/score.ts:74`, `pipeline/scalpel_grade/report.py:216`, `pipeline/RESULTS.md`, `packages/engine/test/fairness.test.ts` (two test names only)
- Create: `packages/engine/test/no-unsourced-figure.test.ts`
- Create: `apps/web/` (App Router: `app/layout.tsx`, `app/globals.css`, `next.config.ts` with `output: "export"`), `apps/web/lib/money.ts`, `apps/web/lib/money.test.ts`, `apps/web/vitest.config.ts`
- Modify: `pnpm-workspace.yaml` (`apps/*`), `.github/workflows/ci.yml` (new job `web`: install, `pnpm --filter web build`, Playwright)

**Interfaces:** Produces `formatRupees(paise: number): string`.

- [ ] Guard test: no file outside `docs/superpowers/plans/` matches `/industry 15\.12/i` or `/15\.12[x×] industry/i`. Fails first, then passes after the wording edits. Fairness numbers are unchanged.
- [ ] `formatRupees(0) === "₹0"`, `formatRupees(1_000_000) === "₹10,000"`, `formatRupees(32_867_900) === "₹3,28,679"`, `formatRupees(36_118_675_300) === "₹36,11,86,753"`, `formatRupees(150) === "₹1.50"` (paise shown only when non-zero).
- [ ] Layout renders the banner text exactly.
- [ ] Run `pnpm -r test`: engine 92 (91 + guard), sim-runner 18, web passes. Run `pytest` in `pipeline`: 76 passes.
- [ ] Commits: `chore: drop the unsourced 15.12x industry figure`; `feat(web): Next.js app shell with banner, rupee format and CI job`.

### Task 1: Memo cases from the engine, and demo data export

**Files:**
- Create: `packages/sim-runner/src/memo.ts`, `packages/sim-runner/test/memo.test.ts`; modify `packages/sim-runner/src/cli.ts` (add `--memo <out> --accounts a,b`)
- Create: `pipeline/scalpel_grade/demo_export.py`, `pipeline/tests/test_demo_export.py`
- Create: `apps/web/lib/demo-schema.ts`, `apps/web/lib/demo-schema.test.ts`; output `apps/web/data/demo.json` (committed)

**Interfaces:**
- TS `buildMemo(world: World, dir: string, accounts: string[], now: Instant): MemoCase[]`. It reuses the runner's requisition and `planAccount`, then runs `evaluateGate` on the chosen action, `createHold` with `regime = gate.regime`, and `clockViews(hold, P, now)`. Each `MemoCase` has: `{ account, type, balancePaise, tracedPaise, action, heldPaise, suggestedWholeFreeze, regime, ncrpAck, hops: {from, to, amountPaise, utr}[], reasons: string[], muleScore, checks: {rule, ok, note, sources, unverified}[], badges: {allowed, sized, timed}, clocks: {id, label, days, dueAt, status?, sources, unverified}[], quashRisksAfter: string[] }`.
- Python:
  - `rescue_curve(order, held, truth, k, drain_ratio=None) -> list[int]`, reusing `_saved`.
  - `replay_series(rows, order, truth, k=10, hours=72) -> dict[str, list[int]]` with `securedPaise`, `innocentLockedPaise`, `peopleRestricted`, `shopsHurt` (length 73). An account is acted on at hour `index // k`.
  - `missed_buckets(rows, order, truth, world, k=10, hours=72) -> dict` with `held`, `neverComplained`, `reportedGoneBeforeHold`, `reportedNotReachedOrNotTraced`. Precedence: held first, then never complained, then gone before hold, then the rest.
  - `math_notes(...) -> dict[str, {formula, inputs}]`.
  - `export_demo(out: Path)`; CLI `python -m scalpel_grade.demo_export`.
- TS zod `DemoData` (schema `scalpel-demo/3`) with blocks `headline`, `replay` (lanes `none | axe | biggest | scalpel`), `order`, `worst`, `memo` (the `MemoCase[]` plus a sources audit `{checked, total, unverifiedIds}`), `math`, and `provenance: { commit, demoSha256, policyId, generatedAt }`.

**Decisions fixed here:**
- Memo cases: `D09001` (the story mule: whole freeze suggested, so it needs Supervisor approval) and `D00191` (a business current account: ₹3,28,679 balance, ₹6,950 traced, low score). The second is the "spare the innocent" page.
- Lane order: Axe, biggest and Scalpel lanes act K = 10 per hour. Axe and biggest use the **same** biggest-first order, so lane 2 vs 3 differs only in hold size and lane 3 vs 4 only in order (an ablation).
- The Axe lane also shows that it secures more victim money, because whole freezes catch money from victims who haven't complained. This is shown, not hidden.

- [ ] Tests (Python): `rescue_curve(...)[-1] == rescue(...)` for every order; series have length 73 and never decrease; "none" secures 0; the Scalpel and biggest lanes at hour 72 equal `rescue()` at K = 10; the four buckets sum exactly to total victim money for all 4 policies; `demo.json` has no `role` key, and account ids appear only in `worst` and `memo`.
- [ ] Tests (TS): `buildMemo` for D09001 gives `heldPaise === 3_000_000`, `balancePaise === 3_750_000`, `suggestedWholeFreeze === true`, and the clocks of the gate's regime. Every check's `unverified` matches `sources.yaml`. The committed `demo.json` parses, and a copy with a 10-long series fails. A guard test checks that `apps/` source never contains `truth`.
- [ ] Commits: `feat(sim-runner): memo cases from the engine gate and clocks`; `feat: export demo.json for the proof screens`.

### Task 2: Home with the two-number headline, trade-off chart and "show the math"

**Files:** `apps/web/app/page.tsx`, `components/HeadlineCards.tsx`, `components/TradeOff.tsx`, `components/MathDrawer.tsx`, `components/Provenance.tsx` (+ tests).

- Lead line: "Hold the right amount, legally, and show the proof."
- Four cards: Do nothing, Axe, Ruler, Scalpel. Each shows Freeze Ratio and victim money missed, with the 4-bucket split behind a tap. A `null` ratio shows "no trace".
- Trade-off chart: one dot per policy (x = innocent money locked, y = victim money missed). Caption: "All four saw the same complaints."
- Footer `Provenance`: commit, sha256 of `demo.json`, policy id.
- [ ] Tests: no card shows a ratio without the missed number; every headline number has a math note; the provenance footer shows a 64-hex hash.
- [ ] Commit: `feat(web): home with two-number headline, trade-off, show-the-math`.

### Task 3: "Same 30 days, four ways" replay

**Files:** `apps/web/app/replay/page.tsx`, `components/Timeline30d.tsx`, `components/ReplayLane.tsx`, `lib/replay.ts` (+ test), `e2e/replay.spec.ts`.

**Interfaces:** `valuesAt(series: LaneSeries, hour: number)` clamps to the range 0..72 and floors the hour.

- 30-day strip: victim money paid per day, complaint dots, decision line. Below it, a 0–72 h slider and a Play button (about 6 s).
- Four lanes: Do nothing · Whole freeze · Exact hold, biggest first · Scalpel. The note under them explains the ablation in one line.
- Counters are tagged `known only afterwards` and open a math drawer.
- [ ] `valuesAt(-5)` gives hour 0, `valuesAt(999)` gives hour 72, `valuesAt(36.7)` gives index 36.
- [ ] Playwright: play to 72; the Scalpel lane's innocent-locked value equals the export and the Axe value equals the export; at 390 px the lanes stack and `scrollWidth <= clientWidth`; clicking D00191 opens `/memo?a=D00191`.
- [ ] Commit: `feat(web): same 30 days, four ways replay`.

### Task 4: The hold memo (legal depth)

**Files:** `apps/web/app/memo/page.tsx`, `components/MemoCase.tsx`, `components/Badges.tsx`, `components/ClockTable.tsx`, `components/RoleSwitch.tsx`, `lib/rules.ts` (+ tests), `e2e/memo.spec.ts`.

**Interfaces:** `citeable(check, sources): { cited: Source[]; uncited: string[] }`, which keeps only `verified: true` sources.

Layout (A4), in the shape of a real CFCFRMS lien record:
1. **Header:** NCRP ack no. (fake), account (masked), regime, policy id.
2. **Money trail:** hops with layer number and UTR, then "Hold ₹6,950 of ₹3,28,679. The rest stays usable."
3. **Three badges:** Allowed? · Right size? · On time? Each shows its rules in plain words and the verified sources. The "Still being checked" list sits below.
4. **Clock table:** the regime's clocks from the engine, each with days, due date and status. A note says the RBI draft's 60-day cap for bank-initiated holds is proposed, not in force.
5. **Why this account:** the mule-score model's 3 reasons. Phone signs are marked "simulated stand-in for DoT FRI/MNRL feeds".
6. **What the account holder is told, and how to contest:** notice and contest route with the SOP grievance steps (replaces the old portal journey).
7. **Approvals:** "Proposed by Officer" and "Approved by Supervisor". For D09001's suggested whole freeze, the Supervisor must click Approve in Supervisor role. Until then it stays an exact hold.
8. **"How I checked my sources"** panel and the provenance footer.

- [ ] Tests: the memo's balance, traced and hold equal `C.json` for both cases; no unverified source appears inside a badge; "50,000" appears only inside "Still being checked" while `mha-sop-2026-01` is unverified; in Officer role the whole-freeze Approve button is disabled and in Supervisor role it is enabled.
- [ ] Playwright: `page.pdf({format: "A4"})` has 1 page and contains the watermark.
- [ ] Commit: `feat(web): printable hold memo with engine badges, clocks and two-person approval`.

### Task 5: Who first? and the locked harder world (cut first if late)

**Files:** `pipeline/scalpel_sim/configs/v3_split.py`, `pipeline/configs/v3_split.lock` (committed **before** any v3 grading code runs), `pipeline/tests/test_v3.py`; modify `packages/sim-runner/src/queue.ts` (add the `biggestcase` order); `apps/web/app/order/page.tsx`, `components/OrderChart.tsx`, `components/WorstTable.tsx` (+ tests).

Pre-registered (in the lock file, before results):
- **World:** seeds 301–303. Each mule payment is split across 3–5 next-layer accounts in pieces under ₹10,000 (an assumption, not an Indian figure). There is a cash-out leak at layer 1 and depth 4–5. Some credits are mixed, with the disputed part inside a bigger credit. Everything else as v2. The model is **not** retrained.
- **Noise:** both low and high. The headline is **high** noise.
- **Stronger simple rule:** `biggestcase`, which acts first on accounts whose whole complaint chain has the most traced money (ties broken by the account's own amount).
- **Pass mark:** the model "earns its place" only if its order beats both `biggest` and `biggestcase` by at least 2 points of the best possible, at K = 10, high noise, pooled over 3 seeds. Otherwise the page says "not earned in this world".
- **Order chart:** mean line with a min–max band over worlds; K switch 5/10/20; the caption is generated from `results.json`. The v3 verdict is one sentence. The 5-row worst-mistakes table sits below.
- [ ] Tests: the v3 config matches its lock hash; all mule pieces are under ₹10,000; `biggestcase` orders a case with a bigger chain sum first; the verdict function returns "not earned" at a margin of 1.9 and "earned" at 2.1.
- [ ] Commit: `feat: locked split-payment world, biggest-case rule and who-first page`.

### Task 6: Docs and wrap-up

- [ ] `docs/ARCHITECTURE.md`: web areas updated (telco console and Hindi cut; login replaced by demo roles that keep two-person approval; journey 3 becomes the memo's contest section plus the existing engine lifecycle tests); milestone table and cut order updated; RBI final directions watch date of 31 Dec 2026. `CLAUDE.md` status updated.
- [ ] README: `python -m scalpel_grade.demo_export` then `pnpm --filter web dev`.
- [ ] Vercel deploy (Shankar signs in once).
- [ ] Anti-drift check; 5-line brief.
- [ ] Commit: `docs: phase 3 status, cuts and run steps`.

**Cut order if late:** Task 5 → worst-mistakes table → Vercel → trade-off chart. **Never cut:** the replay with 4 lanes, the memo with two-person approval, show-the-math, the headline, banner, truth guard and 15.12× guard.
