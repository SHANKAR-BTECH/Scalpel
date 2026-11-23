# Scalpel — working memory (v5)

Pitch: "Stop the money. Spare the innocent. Prove you followed the rules."
Proportional fraud-response (hold/block) decision + lifecycle platform for Indian banks and telcos.
Fictional "Bharat Demo Bank" + "Telco-A". Solo student project (Tech Mahindra internship). Submit 28 Dec 2026 (hard deadline 30 Dec).

## Working agreement
- Claude writes the code. The user decides and gives it its human voice: README story, video, notices, taste.
- The user wants speed: just build, and give a 1–2 line summary per task. No demos and no people tests (no outreach possible).
- Ask the user for research only by giving ready-to-paste deep-research prompts.
- Pending research prompts:
  - R1 citation audit, R2 form fields, R3 transaction-level cases (given 23 Nov).
  - R4 RBI final directions (on 1 Dec).
  - R5 held-out cases, names and links only (after the `gate-v1` tag).
- NEVER revive the "Asli Kaun?" idea.

## Spine: every decision card shows Allowed? · Right size? · On time?
- **Allowed:**
  - R0 authority × jurisdiction. HC split on BNSS §106 vs §107:
    - Bombay, Kerala and Delhi: police cannot debit-freeze, so route to a Magistrate (§107).
    - Karnataka: police can.
    - No ruling yet: strict default plus a flag.
  - Cross-state cases: strictest applicable rule wins (design choice).
  - Requisition checker (Allahabad 5-point):
    - DEFECTIVE plus strong own signals → bank-initiated exact hold under RBI, and a memo to the IO;
    - DEFECTIVE plus weak signals → memo only.
- **Right size:** Rolling Charge tracing (proportional, lowest-balance, per-victim, multi-hop). Headline KPI: Freeze Ratio = held ÷ traced (industry 15.12×).
- **On time:** a multi-clock engine with regimes RBI_BANK, MHA_POLICE, NPCI_CHARGEBACK, DIGITAL_SUSPENSION, COURT_ORDER and TRAI_UCC. Clocks are YAML data.

## Gate rules R1–R9
- R1: exact hold ≤ traced.
- R2: whole account only as a last resort (mule ≥0.85, ≥2 signals, officer confirmation).
- R3: ≤60-day cap.
- R4: <₹50k fast restoration.
- R5: never block 140/1600/1601 series.
- R6: never block a spoofed displayed number.
- R7: SIM/IMEI block needs ≥2 signals incl. ≥1 telecom.
- R8: shields get an exact hold plus notice only.
- R9: an evidence record is required.

Also: a quash-risk checklist, with citations.

## Assure
- §63 BSA evidence pack (SHA-256 + Merkle root) and an in-browser `/verify` page.
- Fairness report.
- Effective-dated, versioned policies with a rule-change diff.
- Court Replay: 8 dev / 10 held-out, outcome-blind, held-out NOT from rulings seen in the reports.
- A "Where Scalpel loses" page.
- DPDP controls: masking, reveal-with-reason, retention with a legal-hold deferral.

## Constraints
- Money in integer paise.
- IST calendar days; deadlines end 23:59:59.999 IST; Day 0 = event day.
- Fake MSISDN `+91 0XXXX XXXXX`; IMEI prefix `00`.
- Banner "Simulation with fictional data. Not legal advice."
- Watermark "SIMULATION – NOT AN OFFICIAL ORDER".
- Free tiers only.
- Gate and Scorer never read `truth.json`.
- Citations not yet verified are labelled "unverified".

## Stack
- pnpm workspaces; TypeScript.
- `packages/engine` (Vitest, fast-check, zod 4, js-yaml).
- `apps/web`: Next.js, Tailwind, Prisma, Neon, Vercel.
- `pipeline/` (Python: sim + LightGBM/SHAP, capped at 1.5 days).

## Status
- Engine core (23 Nov): money, time, jurisdiction, policy (+YAML), trace, requisition, gate, score, lifecycle, audit, campaign.
- Phase 1 (23 Nov, branch `phase-1-engine`): CI workflow; `restoration` and `fairness` modules; golden cases (`test/golden.test.ts`); every Gate check and request finding lists `unverified` sources. 79 tests green, tsc clean.
- Fix found by golden tests: police-only quash risks (Q5–Q7) now apply only under the MHA_POLICE regime, not after a bank-initiated RBI hold.
- Pending: fold in research R1–R3 when the answers arrive (YAML edits + extra golden cases).
- Phase 2 (23 Nov, branch `phase-2-sim-ai`, plan `docs/superpowers/plans/2026-11-23-phase-2-sim-ai.md`): fake worlds (v1 practice, five v2 test worlds locked before training, noisy v2 variants), `packages/sim-runner` (runs the engine on a world: holds 0/A/B/C + officer's to-do orders), AI = logistic regression (primary) + LightGBM with calibrated mule score and 3 plain reasons, grader + `pipeline/RESULTS.md`, demo world in `pipeline/demo/` (contains the phase 1 story). One command: `cd pipeline && .venv/bin/python -m scalpel_sim.all`. Tests: engine 84, sim-runner 18, pipeline 70.
- Phase 2 result (simulated, under stated assumptions): Scalpel's order beats the warning-sign rule (97.6% vs 87.0% of best possible rescue, v2 pooled, K=10) at drain ratios 2/5/10× and both noise levels; it only TIES "biggest amount first" (98.1%). Two-number headline always shown together: Freeze Ratio + victim money missed. Axe ratio on v2 is our simulated 15.22×; the industry 15.12× stays "unverified" and is not used. v1 is too easy (AUC ~1.0, alarm kept visible); v2 AUC 0.94 logistic, 0.82 LightGBM.
- Python: `pipeline/.venv` via uv (Python 3.12). Only `scalpel_grade` and `scalpel_sim` (world builder) touch truth; the runner refuses world folders with extra files.
- Laptop has no global pnpm: use `npx -y pnpm@10.28.0`.

## Timeline
Plan: `docs/ARCHITECTURE.md` (section 10). Dates are flexible; Shankar prefers moving on when a task is done.
| Date | Milestone |
|---|---|
| 7 Dec | `gate-v1` |
| 16 Dec | MVP |
| 22 Dec | Freeze |
| 28 Dec | Submit |

## Cut order
1. P2 items
2. Hindi
3. Rule diff
4. CAMARA mocks
5. Comparator
