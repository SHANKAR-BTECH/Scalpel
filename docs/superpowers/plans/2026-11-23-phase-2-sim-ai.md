# Scalpel — Phase 2 Plan (Simulation + AI), revised after two reviews

> Status: **waiting for Shankar's yes or no.** No code is written until you say yes.
> Builds on phase 1 (merged to `main`: restoration, fairness, golden tests, CI, 79 tests green).
> Revised after the roast (five separate reviewers), grill and refine in [PHASE-2-REVIEW.md](PHASE-2-REVIEW.md). Three small questions for you are in section 5 there.

---

## The short version (read this first)

1. **Goal:** a **fake world** (people, bank accounts, scams, phone signals) and a small **AI** with two jobs: give each account a **mule score with 3 plain reasons**, and use it to put the officer's to-do list in order (**who first**). The rules from phase 1 decide what is legal and how much to hold. A person decides any whole freeze. This is how real banks use AI (see [the research report](../scalpel-research/reports/AI%20role%20in%20bank%20mule%20operations.md)).
   - **"Simple rule to beat"** means a plain rule with no AI in it (for example "2 or more warning signs = suspicious"). The AI is measured against it. It is a yardstick, not a plan to drop the AI.
2. **What we can honestly claim:** results describe our fake world, not real fraud. So the headline is a conditional sentence, for example *"If mule money leaves 5× faster than a shop's, Scalpel's order saves 80% of the best possible; the simple warning-sign rule (the rule to beat) saves 60%."* We show where that stops being true.
3. **Fair testing:** the AI trains on world **v1** and is marked on **five v2 worlds**, built differently and **locked before training**. The real answers sit in `truth.json`, which only the marking step can open.
4. **Every result shows two numbers together:** Freeze Ratio (held ÷ traced) and **victim money missed**, so holding nothing can't look perfect.
5. **Early checks stop wasted work:** a tiny end-to-end test comes first, then a check that money is still there to save when the bank decides.
6. **Size:** about a week of work. If it runs over, we follow the cut list, because the screens matter more than extra charts.
7. **Done when:** all tests are green, GitHub shows ✓, a one-page results report exists (including **where the AI loses**), and the anti-drift check passes.

---

## How it fits together

```
 Python (pipeline/)                      TypeScript                         Python (pipeline/)
 ┌─────────────────────┐   world.json    ┌──────────────────────┐ decisions ┌──────────────────┐
 │ make world v1/v2    │ ─────────────▶  │ sim-runner: trace,   │ ────────▶ │ grader opens     │
 │ derive signals      │ assessments.json│ Gate, planner, queue │  .json    │ truth.json       │
 │ train AI + reasons  │ ─────────────▶  │ (never given truth)  │           │ → RESULTS.md     │
 └─────────┬───────────┘                 └──────────────────────┘           └────────┬─────────┘
           └────────────── truth.json (hidden answers) ─────────────────────────────▶┘
```

**What gets compared** (same world, same day):

| Holds | What it does |
|---|---|
| **0. Do nothing** | No holds. Sanity check: it must be worst on "money missed". |
| **A. Axe** | Whole-freeze every account a complaint points to, and onward accounts (the police-letter habit) |
| **B. Ruler** | Exact hold of the traced amount (what a careful bank does today; **not** our invention) |
| **C. Scalpel** | Ruler's sizes plus the Gate's legal checks; likely shops get notice only. Whole freezes are only **suggested** to the officer and counted separately. |

| Queue order (who first, when the officer can do only K per hour) | What it is |
|---|---|
| First come, first served | Simple rule |
| Biggest amount first | Simple rule |
| **Warning-sign rule:** amount × (2 or more signs) | **The simple rule to beat** (a smart rule with no AI in it) |
| **Scalpel:** amount × chance it's a mule | **The AI** (LightGBM, and logistic regression as the simple version) |
| **Best possible ("oracle"):** uses the hidden answers, grader only | Ceiling, for comparison |

---

## Phase 2 in detail (for the builder)

**Approach:** test first, small commits, a thin end-to-end slice before anything rich. Every random choice uses a fixed **seed**.
**Tools:** Python 3.12, numpy, pandas, scikit-learn, LightGBM, SHAP, pytest (pinned). TypeScript: the engine, zod, Vitest.
**Where:** `C:\Scalpel`, branch `phase-2-sim-ai`. Nothing is pushed until you say yes. It merges only after your OK.
**Data rules:** money in whole paise; IST days; fake phones `+91 0XXXX XXXXX`; IMEIs start `00`; only the grader can read `truth.json`.

### Task 0 — Set up Python and its CI job

Files: `pipeline/requirements.txt`, `pipeline/pyproject.toml`, `pipeline/scalpel_sim/__init__.py`, `pipeline/tests/test_smoke.py`; modify `.github/workflows/ci.yml`, `.gitignore`.

1. Laptop: check `python --version`. If it's below 3.11, install 3.12 (I'll give you a one-line `winget` command).
2. Create a virtual environment in `pipeline/.venv`, install the packages, run `pytest`.
3. Add a new CI job, **pipeline** (Python 3.12, `pytest`), next to the engine job.
4. Ignore `pipeline/.venv/` and `pipeline/out/`.

Commit: `ci: add Python pipeline job with pytest`. Done when both CI jobs are green.

### Task 1 — Engine fixes from the phase 1 review

Files: modify `packages/engine/src/score.ts`, `fairness.ts`, and their tests.

- `freezeRatio`: return a clear **"no trace"** result instead of `Infinity`. JSON can't store `Infinity`; it silently becomes `null`.
- `fairnessReport`: add **`victimMoneyNotHeld`** (traced − held per account, never below 0) and **`recoveryRate`**, both overall and per group.

Tests first:
- Held ₹10,000 with nothing traced gives "no trace", and the value survives a trip through JSON.
- Held 0 with ₹30,000 traced gives a ratio of 0, **₹30,000 not held**, and 0% recovery.
- The phase 1 story still gives 15.12, with nothing missed and 100% recovery.
- All 79 old tests still pass.

Commit: `fix(engine): no-trace ratio and victim money not held in fairness report`.

### Task 2 — Walking skeleton

**Plain idea:** a **tiny** world (about 50 accounts), pushed all the way through: make world → engine → marks. It proves the pipes connect before anything gets rich.

Files: `pipeline/scalpel_sim/tiny.py`; `packages/sim-runner/` (`src/schema.ts`, `src/run.ts`, tests); `pipeline/scalpel_grade/grade.py`; `pipeline/tests/test_skeleton.py`.

1. `schema.ts`: zod schemas for `world.json`, `assessments.json`, `decisions.json`, so a bad file fails loudly.
2. `run.ts`: holds 0, A, B → `decisions.json`. It takes **only** the world folder. It is never given the path to `truth.json`, and the world folder doesn't contain it (truth is written to a separate `truth/` folder).
3. `grade.py`: Freeze Ratio, money not held, innocent money held.

Tests first:
- The phase 1 story gives an exact ₹30,000 hold under B and whole freezes under A.
- Hold 0 is worst on "money not held". B never holds more than the traced amount.
- **No peeking, built in:** the runner's command takes one folder, and a test checks that folder has no `truth.json`. The test also checks that no engine or runner source mentions `truth`.

Commit: `feat: walking skeleton from tiny world to marks`.

### Task 3 — World v1, in full

**Plain idea:** the fictional "Bharat Demo Bank" over 30 days. Victims pay mules, the money hops 3–5 times, then leaves as cash, crypto or gold. Some lands with innocent shopkeepers and gig workers (shields), while normal customers carry on around them. Pattern names follow IBM's synthetic AML data and AMLSim (fan-out, scatter-gather), which we cite. What's new in ours is **shields, late complaints and hold sizing**, which those simulators don't model.

Files: `pipeline/scalpel_sim/config.py` (`WorldConfig`, every setting in one place), `people.py`, `scams.py`, `world.py`, `export.py`, `pipeline/tests/test_world.py`.

- **Victims report late or never:** 40–70% report, 0–72 hours after paying.
- **One decision moment per scam campaign:** the moment its first complaint lands. Only what's visible by then goes in `world.json`.
- **After the decision moment** the world keeps running for 72 hours. How fast mule money drains compared with shield money is **one named setting** (the "drain ratio"), because the results depend on it. The hour-by-hour victim money left in each account goes **only** to `truth/`.
- Money arriving after the decision moment uses the world's own spread of values, never the Scorer's guess.
- About 5,000 accounts. Four scam types. The phone signals follow real Indian systems that evaluators will recognise: DoT's Financial Fraud Risk Indicator (FRI), the MNRL list, and mule flags like RBI MuleHunter.AI's.

Tests first:
- The same seed gives identical files.
- Money is conserved, and no balance goes below 0.
- `world.json` contains no role or truth field.
- Only fake identifiers are used.
- The report rate and the role mix fall within the set ranges.

**Check: is there money left to rescue?** Measure what share of victim money is still in accounts at the decision moment. If it's under about 20%, every queue looks the same. In that case we say so, and the headline leans on "future victim money stopped" instead.

Commit: `feat(pipeline): seeded world v1 with late complaints and hidden after-decision money`.

### Task 4 — Phone and bank warning signs

Files: `pipeline/scalpel_sim/telecom.py`, `signals.py`, `pipeline/tests/test_signals.py`.

The 10 sign names must match `BANK_SIGNALS` and `TELECOM_SIGNALS` in `gate.ts` exactly. A test reads them from that file.

**Noise is a setting with two levels (low, high),** not one hand-picked number. Results are reported at both levels, so no single choice of ours decides the outcome.

Tests first:
- Age, dwell time and reported-victim thresholds work exactly at the edge, both ways. For example, 3 victims of whom only 2 reported means no `GE3_CASE_LINKED_SENDERS`.
- Signs are computed **as of the decision moment**, not over all 30 days: a SIM swap after the decision doesn't count.
- `signals.py` never reads truth.

Commit: `feat(pipeline): bank and telecom signals as of the decision moment`.

### Task 5 — World v2, locked before training, five seeds

Files: `pipeline/scalpel_sim/configs/v2.py`, `pipeline/configs/v2.lock`, `pipeline/tests/test_v2.py`.

v2 changes: many mules are old rented accounts; mule money waits 20–90 minutes before moving on; about twice as many shields; more "digital arrest" scams; 4–6 hops; about 3,000 accounts; **five seeds**.

Tests first:
- The v2 settings match the fingerprint in `v2.lock`, so a change after this commit fails CI unless the lock is updated openly.
- v1 and v2 share no ids, and each listed change shows up.
- All Task 3–4 checks pass on every seed.

Also auto-write `WORLDS.md`, a table comparing v1 and v2.

Commit: `feat(pipeline): world v2 (5 seeds), settings locked before training`.

### Task 6 — Scalpel hold choice and the officer's queue

Files: modify `packages/sim-runner/src/run.ts`; create `src/queue.ts`, `test/queue.test.ts`.

- **C (Scalpel):** the Gate and `planAccount` pick exact hold or notice only. If the planner would choose a whole freeze, it is recorded as **"suggested to officer"** and not applied. A suggestion never becomes a freeze in the results.
- **Queues:** first come first served, biggest amount first, the warning-sign rule, and Scalpel (amount × chance it's a mule). The oracle queue is built by the grader, because only the grader may see truth.
- **One line per decision** links the AI to the law, for example *"Exact hold ₹30,000 (R1, right size). First in queue: money left within 4 minutes; 3 reported victims."*
- Output: the action time for each account in `decisions.json`.

Tests first:
- With unlimited capacity, every queue order gives the same result.
- With K = 1, a ₹10,000 likely-mule and a ₹50,000 likely-shop: Scalpel acts on the mule first, and "biggest first" acts on the shop first.
- A whole freeze is never applied under C, only suggested.

Commit: `feat(sim-runner): Scalpel holds, capacity-limited queues, decision lines`.

### Task 7 — Train the AI and explain it

Files: `pipeline/scalpel_model/features.py`, `train.py`, `explain.py`, `reasons.py`, `pipeline/tests/test_model.py`.

1. **Who it learns from:** only accounts that hold traced victim money. Those are the accounts it will be used on, and shields are far more common among them.
2. **Features** (about 15) come from `world.json` only and are computed **as of each campaign's decision moment**.
3. **Two models:** **logistic regression first** (simple, and its weights explain themselves, which is easy to defend in a viva), then LightGBM as the upgrade if time allows. Each is tuned on 20% of v1 held back. Neither ever touches v2.
4. **Too-easy alarm:** if logistic regression scores above 0.98 AUC on v1's held-back slice, the world is too easy. We add noise before going further.
5. **Calibration:** class weights bend the scores, so we straighten them afterwards (isotonic calibration) on v1's held-back slice. On v2 we report **one** number with its range, pooled across the 5 seeds: "of accounts scored 0.85 or more, X% were really mules". A full calibration curve would rest on too few accounts.
6. **Reasons:** SHAP for the **mule** probability → top 3 → plain sentences.

Tests first:
- Leak test: no role or truth column, and every feature date is on or before its decision moment.
- Exactly 3 plain reasons per account, with no raw feature names.
- Probabilities lie between 0 and 1 and add up to 1.
- The same seed gives the same scores.
- A textbook mule scores high.

Commit: `feat(pipeline): logistic and LightGBM models with calibrated scores and top-3 reasons`.

### Task 8 — Mark everything on v2

Files: extend `pipeline/scalpel_grade/grade.py`, `pipeline/tests/test_grade.py`; outputs `RESULTS.md` and `results.json`.

**Title of the report:** "Policy test bench under stated assumptions". It never says "AI proven to work".

1. **Two-number headline** for holds 0, A, B, C: Freeze Ratio **and** victim money missed. Also innocent money held, people wrongly restricted, and future money stopped. The Axe ratio is our own **simulated** figure. 15.12× is not used.
2. **Rescue result:** money saved by each queue at K = 5, 10, 20 per hour, shown as a **% of the oracle**. The K values are labelled as assumptions.
3. **The conditional headline:** the same comparison across drain ratio (2×, 5×, 10×) and noise (low, high). The report writes one sentence: *"Scalpel's order beats the warning-sign rule when mules drain at least N× faster than shops; below that it doesn't."*
4. **Delay soundbite:** "each hour of delay on a mule loses ₹X of victim money, on average, in this world."
5. **Role guesses:** **real mules in the officer's top 10** (the AI vs the simple rule to beat), **innocent shields wrongly scored 0.85 or more** (shown as big as the money saved), logistic vs LightGBM, and the calibration number from Task 7.
6. **Honesty rules:**
   - Numbers are pooled over the 5 seeds, with a range.
   - v1 is shown alongside, so the drop is visible.
   - The first line says plainly whether Scalpel beats the warning-sign rule.
   - A **"Where the AI loses"** section lists the 5 worst v2 mistakes with their reasons.
7. **Decided before any results:** if the AI only ties the simple rule to beat, that is an honest, acceptable result, and the report says so.

Tests first:
- Hand-made truth gives exact role counts.
- Hold 0 has the most money missed.
- The oracle is always ≥ every other queue.
- The rescue result for a hand-made 2-account case matches the hand calculation.
- The first line flips when fake results flip.

Commit: `feat(pipeline): grade holds and queues on five v2 worlds`.

### Task 9 — Demo world, wrap-up, anti-drift check

1. A small **demo world** (about 200 accounts, 3 campaigns including the phase 1 story) with assessments and decisions, saved to `pipeline/demo/` for phase 3 and the "same 30 days, three ways" replay.
2. One command runs everything: `python -m scalpel_sim.all`.
3. `pnpm typecheck`, `pnpm test`, `pytest`: all green.
4. Update `CLAUDE.md`, and add this plan to `docs/superpowers/plans/`.
5. Run the **anti-drift check** below.
6. Push, open a pull request, and confirm both CI jobs show ✓.
7. Send you a 1–2 line summary, the conditional headline (good or bad), test counts, a 5-line journal brief, and (if you said yes to Q3) 5 likely viva questions with plain answers.

---

## Anti-drift check (end of every phase, about 10 minutes)

1. **Pitch test:** which of *stop the money / spare the innocent / prove the rules* did this phase move?
2. **Never-cut list intact:** tracing, 3 badges, bank and police clocks, request checker, audit chain, Freeze Ratio, Court Replay.
3. **Two-number headline:** Freeze Ratio and victim money missed, always shown together.
4. **Honesty:**
   - Every number is labelled *measured*, *simulated* or *unverified*.
   - Only the grader can read truth.
   - No citation goes in a demo until R1 has checked it.
   - 15.12× stays "unverified" until it's sourced.
   - Claims about the AI are conditional on the fake world's settings.
5. **AI stays in its lane:** it orders and explains. It never applies a whole freeze by itself.
6. **Scope:** anything built that isn't in the plan gets a written reason, or gets cut.
7. **The wow is on track:** this phase feeds the "same 30 days, three ways" replay.
8. **You can explain it:** a journal brief, plus the top 3 viva questions answered in your own words without notes.
9. **Green:** tests, type check and CI ✓ pass, and `CLAUDE.md` is updated.

## Things to keep in mind

- **R4 (RBI final directions)** is expected around 1 Dec. It's a YAML edit.
- **R1–R3** can be folded in whenever they arrive. **R1 must be done before any public demo.**
- Recent High Court rulings against blanket freezes (Rajasthan, Allahabad, Madhya Pradesh; links in the review) are good candidates for R1 to verify and for Court Replay.

## Risks

| Risk | What we do |
|---|---|
| The result just repeats our own world's settings | Conditional headline across drain ratio and noise; oracle and warning-sign queues to compare against; report titled "under stated assumptions" |
| Little money left to rescue when the bank decides | Checked in Task 3. If so, we say it and lean on "future money stopped". |
| The world is too easy | Walking skeleton, AUC alarm (Task 7), two noise levels, locked v2 |
| Scores don't mean what they say on v2 | Calibration after training; one pooled number with a range. Whole freezes are never automatic anyway. |
| Answers leak into the AI | Runner never given truth; features dated to the decision moment; leak tests |
| Phase 2 eats the time the screens need | About a week of work, then the cut list applies |

**Cut order if it runs long:** LightGBM (keep logistic regression and its reasons) → second noise level → delay soundbite → per-scam split. **Never cut:** the two-number headline, locked v2, the oracle and warning-sign comparison, top-3 reasons, and the conditional headline sentence.

## Words used here

- **Fake world / simulation:** made-up people and payments generated by code.
- **Seed:** the starting number for randomness.
- **Mule:** an account used to pass on stolen money.
- **Shield:** an innocent account that received some of it by accident.
- **Decision moment:** when the bank decides. Anything after it is hidden and used only for marking.
- **Drain ratio:** how much faster mule money leaves than a shop's. Our results depend on it, so we test several values.
- **Walking skeleton:** the thinnest version that works end to end, built first.
- **Locked settings:** a fingerprint of v2's settings saved before training.
- **Oracle:** the best possible order, worked out with the hidden answers, used only as a ceiling.
- **Logistic regression:** a simple AI method whose weights you can read directly.
- **LightGBM:** a stronger method that adds up many small yes/no trees.
- **SHAP:** shows which features pushed an answer most. We keep the top 3 as reasons.
- **AUC:** a score from 0.5 (guessing) to 1.0 (perfect) for how well a model separates mules from others.
- **Calibration:** a score of 0.9 should be right about 9 times in 10.
- **Leakage:** the AI accidentally seeing the answers, including information from after the decision moment.
- **Queue / triage:** the order an officer works through cases.
- **K:** how many actions the officer can take per hour (an assumption).
- **Two-number headline:** Freeze Ratio plus victim money missed.
- **Conditional headline:** a claim that says when it holds, for example "if mules drain at least 5× faster".
