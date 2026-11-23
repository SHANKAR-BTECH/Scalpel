# Scalpel — Phase 1 Plan (Engine revision, 25–27 Nov)

> Status: **approved by Shankar on 23 Nov 2026** (including TypeScript). Tasks 0–4 and 6 done the same day; Task 5 waits for research.
> Build stack: **TypeScript / Next.js**, confirmed by Shankar. The Python design in `docs/superpowers/specs` is superseded.

---

## The short version (read this first)

1. **Goal:** make the "brain" (the engine) solid before any screens are built. All its tests must pass, and it gets two new parts: **restoration** (giving money back to each victim in the right share) and **fairness** (Freeze Ratio and innocent money held).
2. **Research does not block us.** The law lives in YAML files, so research results are a quick file edit, not a rebuild. Paste prompts R1, R2 and R3 (below) into deep research **tonight or tomorrow**, and we fold the answers in on 27 Nov. If they aren't back by then, those rules simply stay labelled "unverified". R4 (1 Dec) and R5 (after 7 Dec) are later.
3. **Three days, six tasks:**
   - **25 Nov:** check the existing tests pass on your laptop and set up automatic testing on GitHub. Build restoration.
   - **26 Nov:** build fairness. Add "golden" tests shaped like real court cases.
   - **27 Nov:** make "unverified" visible in every decision, fold in research, tidy notes, push.
4. **Done when:** every engine test is green, the type checker is clean, GitHub shows a green ✓, and you OK a 1–2 line summary.
5. **Not in phase 1:** screens, database, AI model, rule-change diff, Court Replay. Those are phases 2–6.

---

## Research prompts to paste now (R1, R2, R3)

Paste each one into a **deep research** chat. Save each answer as a file and drop it in this project. You don't need to understand every word of the answer; we go through it together.

**R1 — Citation audit**
```
I am building a student simulation about bank account freezes in Indian cyber-fraud cases. Check each item below. For each, give: the exact correct name, court or issuer, date, case or circular number, a working official link (Indian Kanoon, court website, RBI, MHA, NPCI, TRAI or DoT), and one line on what it actually says about freezing or holding money. Mark each as CONFIRMED, PARTLY WRONG (say what is wrong) or NOT FOUND. Do not guess; say NOT FOUND if you cannot find a primary source.
1. BNSS 2023 sections 106 and 107 (police seizure vs Magistrate attachment of bank accounts)
2. Bharatiya Sakshya Adhiniyam 2023 section 63(4)(c) certificate for electronic records
3. RBI draft directions (around Sept 2026) on holds in suspected mule accounts: 60-day cap, 20-day explanation window, exempt nodal/pool/escrow accounts
4. MHA / I4C SOP (around Jan 2026) on freezing and de-freezing accounts: 7-day grievance upload, 15-day IO decision, release of holds under Rs 50,000 after 90 days
5. NPCI OC 235 on UPI fraud chargeback timelines
6. TRAI TCCCPR Third Amendment (spam and fraud calls, 15-day outgoing bar)
7. DoT Financial Fraud Risk Indicator (FRI) and MNRL
8. Allahabad High Court 5-point protocol for police freeze requisitions
9. Navneet Traders case on freeze requisitions
10. Kartik Yogeshwar Chatur v State of Maharashtra (Bombay HC): police cannot debit-freeze under s.106
11. Headstar case (Kerala HC) on s.106 debit freeze
12. Malabar Gold case (Delhi HC) on s.106 debit freeze
13. JAR Gold case (Karnataka HC): police can freeze under s.106
14. Himanshu Gupta (Madras HC, around July 2026): lien reduced to the traced amount
15. The "15.12x" figure: whole-account freezes hold about 15 times the stolen amount. Who published it, when, and how was it measured?
Finish with a table: item, status, correct citation, link.
```

**R2 — Form fields**
```
For a student simulation of Indian bank fraud holds (fictional data only), list the real fields on these documents. For each field give the field name, what goes in it, and whether it is required. Cite an official source or a published sample for each document. Say clearly if you could not find an official version.
1. A police notice or requisition to a bank to freeze or hold an account (BNSS s.106 / old CrPC s.102), including what courts said it must contain
2. A Magistrate's order attaching a bank account (BNSS s.107)
3. A complaint on the National Cyber Crime Reporting Portal (NCRP) / 1930 helpline, and the data sent to banks through I4C's CFCFRMS
4. The notice a bank must send an account holder when it places a hold (RBI draft directions 2026, if available)
5. A telecom (DoT / TRAI) request to block a mobile number or handset (IMEI)
Finish with one table per document: field, meaning, required (yes/no), source.
```

**R3 — Transaction-level cases**
```
Find 8 to 12 Indian court judgments (2020–2026) about bank account freezes or liens in cyber-fraud cases where the judgment gives transaction details: how much the victim lost, how much reached the frozen account, the account balance, and how much was frozen. Prefer cases where the court compared the frozen amount with the amount actually traced, or ordered the freeze cut to the traced amount. For each case give: case name, court, date, link (Indian Kanoon or court website), the money facts as numbers, what the police or bank froze, what the court decided, and one line on why. Do not include cases where you cannot find the judgment text. Finish with a table: case, court, date, amount lost, amount traced to the account, amount frozen, court outcome.
```

---

## Phase 1 in detail (for the builder)

**Goal:** a tested, research-ready engine with restoration and fairness, ready for phase 2.
**Approach:** test first. For each new piece, write the test with the right answer, see it fail, write the code, see it pass, commit. Small commits.
**Tools:** TypeScript, Vitest (tests), fast-check ("random world" tests), pnpm.
**Where:** `C:\Scalpel`, on a new branch `phase-1-engine`. Nothing is pushed until you say yes; the branch is merged only after your OK.

### Task 0 — Check the starting point and turn on automatic tests (25 Nov, ~1 hour)

What exists: 11 engine modules and 9 test files, pushed on 23 Nov, but never run in this repo (no `node_modules` yet). CLAUDE.md says 50 tests; the files hold about 48, so we count again.

Files: create `.github/workflows/ci.yml`.

1. On the laptop: `pnpm install`, then `pnpm test` and `pnpm typecheck`.
2. Write down the real test count. If anything fails, fix it first and note why in the summary.
3. Add a GitHub Actions workflow that runs `pnpm install --frozen-lockfile`, `pnpm typecheck` and `pnpm test` on every push.
4. Commit: `ci: run engine tests and type check on every push`.

Done when: tests and type check pass locally.

### Task 1 — Restoration: give money back in the right shares (25 Nov, ~3 hours)

**Plain idea:** when a held amount is released to victims, each victim gets back the share of their own money that was traced into that account, never more than they lost.

Files: create `packages/engine/src/restoration.ts`, `packages/engine/test/restoration.test.ts`; export from `src/index.ts`.

Function (shape):
```ts
restore(input: {
  recovered: Paise;                          // money released from the hold
  taint: Record<VictimId, Paise>;            // from trace(): each victim's money in this account
  alreadyRepaid?: Record<VictimId, Paise>;   // from earlier restorations
  lost: Record<VictimId, Paise>;             // victimPaid from trace()
}): { perVictim: Record<VictimId, Paise>; leftover: Paise }
```

Tests to write first (exact answers):
- Taint A ₹18,000, B ₹12,000; recovered ₹30,000 → A ₹18,000, B ₹12,000, leftover 0.
- Same taint, recovered ₹10,000 → A ₹6,000, B ₹4,000.
- Odd paise: recovered ₹100.01 split 1:2 → parts add up to exactly ₹100.01.
- A already repaid in full from another account → A gets 0, B is capped at their loss, the rest is `leftover`.
- Random worlds (1,000 runs): the parts always add up to `recovered`; no victim ever gets more than they lost; nobody gets a negative amount.

Steps: write tests → run, see them fail → write `restore` using `splitProportional` from `money.ts` → run, see them pass → commit `feat(engine): restoration splits recovered money back to victims`.

### Task 2 — Fairness: Freeze Ratio and innocent money held (26 Nov, ~3 hours)

**Plain idea:** one function that takes a list of holds and reports how much was held compared with what was really traced, how much innocent money was caught, and the same numbers broken down by group (for example account type, or shield vs mule estimate).

Files: create `packages/engine/src/fairness.ts`, `packages/engine/test/fairness.test.ts`; export from `src/index.ts`. Reuse `freezeRatio` from `score.ts`.

Function (shape):
```ts
fairnessReport(rows: { account: string; held: Paise; traced: Paise; group: string }[]): {
  overall: { held: Paise; traced: Paise; freezeRatio: number; innocentHeld: Paise; accounts: number };
  byGroup: Record<string, same shape>;
}
```
`innocentHeld` = held − traced for each account, never below 0.

Tests to write first:
- One whole freeze: held ₹4,53,600, traced ₹30,000 → ratio 15.12, innocent ₹4,23,600.
- One exact hold: held = traced ₹30,000 → ratio 1.00, innocent 0.
- Mixed list grouped by `SAVINGS` / `CURRENT` → each group's numbers are right, and the overall equals the sum of the groups.
- Nothing traced and nothing held → ratio 0, not an error.

The engine function never reads `truth.json`. Labels come from whoever calls it (pipeline grading or the app).

Commit: `feat(engine): fairness report with Freeze Ratio by group`.

### Task 3 — Golden tests and random-world checks (26 Nov, ~2 hours)

**Plain idea:** a few complete cases with answers agreed in advance, so any later change that alters an answer gets noticed.

Files: create `packages/engine/test/golden.test.ts`; check `test/trace.test.ts` and `test/audit.test.ts` for random-world tests.

Golden cases (from ARCHITECTURE section 5.1 and the rulebook):
1. **The story case:** 3 victims pay one mule; ₹30,000 still in Mule-1 → police "freeze whole account" in Bombay HC's area with strong bank signals → Gate gives **MODIFY to an exact ₹30,000 hold under RBI_BANK**, 3 badges green, memo flag set.
2. **Karnataka:** same request in Karnataka → police authority accepted, exact hold.
3. **Shield:** shopkeeper with mule score 0.2 → whole freeze becomes exact hold (R8).
4. **Over-asking:** request ₹1,00,000, traced ₹40,000 → hold cut to ₹40,000 (R1).
5. **Protected number:** block request on a 1600-series number → DENY (R5).
6. **Restoration end to end:** trace → hold → restore → each victim's share matches by hand.

Random worlds: if missing, add the three from ARCHITECTURE 9.1 (never hold more than the balance; every paisa of victim money is accounted for; any edited or reordered audit entry is caught), at 2,000 runs each.

Commit: `test(engine): golden cases and random-world checks`.

### Task 4 — Make "unverified" visible in every decision (27 Nov, ~2 hours)

**Plain idea:** every rule check in a decision should say whether its legal source has been checked. Today all sources are `verified: false`, but nothing in the Gate's output says so.

Files: modify `packages/engine/src/gate.ts` (add a `sourceStatus` list to each check, or a helper `describeSources(policy, ids)`), `test/gate.test.ts`, `test/policy.test.ts`.

Tests to write first:
- A check that cites `himanshu-gupta` reports it as **unverified**.
- After setting `verified: true` in a test policy, the same check reports **verified**.
- `policies/sources.yaml` and the source list inside `scalpel-2026-12.yaml` contain the same entries (today they are copied by hand and could drift).
- Overlay files still carry the placeholder date `2025-01-01`: a test lists them as "date unverified" so they can't be forgotten.

Commit: `feat(engine): show verified/unverified status for every cited source`.

### Task 5 — Fold in research R1–R3 (27 Nov, ~2 hours, only if answers are back)

You and I go through each answer together first. Then:
- **R1:** for each CONFIRMED item, fix the name, date and link and set `verified: true` in the YAML. PARTLY WRONG items get fixed and stay unverified until you check the original judgment. NOT FOUND items stay unverified, and if a rule depends only on one, its status becomes `assumed`. Fix the overlay effective dates.
- **R2:** compare the real form fields with the `Requisition` type in `requisition.ts`; add any missing required field and its check.
- **R3:** turn 2–3 cases into extra golden tests (Task 3 pattern), with the court's real numbers.

If an answer isn't back, skip that part. Nothing else in phase 1 waits for it.

Commit: `policy: apply citation audit (R1), form fields (R2), case tests (R3)`.

### Task 6 — Wrap up (27 Nov, ~1 hour)

1. Run everything: `pnpm typecheck` and `pnpm test`. All green.
2. Update `CLAUDE.md`: status line, new modules, and fix its timeline (it still says "Engine 3 Dec"; the plan says 27 Nov).
3. Add a one-line note at the top of `docs/superpowers/specs/2026-11-23-scalpel-design.md` saying the TypeScript plan replaces its Python design (only if you confirmed TypeScript).
4. Add `docs/ARCHITECTURE.md` and this plan to the repo (`docs/superpowers/plans/`).
5. Push the branch, open a pull request, and check GitHub shows a green ✓.
6. Send you: a 1–2 line summary, the test count, and a 5-line journal brief. You say OK and we merge, then phase 2 starts on 28 Nov.

---

## Risks

| Risk | What we do |
|---|---|
| Existing tests fail on the laptop (wrong Node or package versions) | Fix in Task 0 before anything else; this is why it comes first. |
| Research comes back late | Phase 1 finishes without it; Task 5 moves to the start of phase 2. |
| Research shows a rule is wrong | Change the YAML value and re-run tests. The engine code does not change. |
| Three days is tight | Cut Task 4's overlay-date test first, then golden cases 5–6. Restoration, fairness and green tests are never cut. |

## Words used here

- **Engine:** the calculation code. No screens, no database.
- **Test first:** write the check with the right answer before writing the code, so you know the code really works.
- **Golden test:** a whole case with an agreed answer, kept forever to catch accidental changes.
- **Random-world test:** the computer makes thousands of random cases and checks rules that must always hold.
- **CI / GitHub Actions:** GitHub runs all tests automatically on every push and shows ✓ or ✗.
- **Branch / pull request:** a separate copy of the code for this phase, and the request to merge it into the main copy after review.
