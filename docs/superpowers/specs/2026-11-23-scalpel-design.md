# Scalpel — Design Document

**"Hold, don't freeze."**
*Fast enough to save the victim. Precise enough to spare the innocent.*

- Date: 23 Nov 2026
- Author: (student), BE CSE 2nd year — Tech Mahindra telecom virtual internship
- Status: draft, awaiting approval
- Deadline: submit by 28 Dec 2026 (hard deadline 30 Dec 2026)

---

## 1. Intent and the why

### The problem, in one paragraph
When someone in India is scammed (for example a fake "CBI officer" call — a *digital arrest*), the money is split and pushed through a chain of bank/UPI accounts within minutes, while the scam itself runs on telecom infrastructure: SIM boxes, spoofed caller IDs, swapped SIMs and handsets carrying many SIMs. Enforcement today fails in two opposite ways:

1. **Too slow for the victim.** By the time accounts are frozen, most money is gone. Of reported losses, only about 0.37% has been refunded.
2. **Too blunt for innocent people.** Officers often freeze whole accounts all along the chain, including genuine shopkeepers and gig workers who were paid with stolen money in good faith. In 2026 several High Courts (Rajasthan, Allahabad, Madhya Pradesh, Delhi) ordered that only the disputed amount be held, not the whole account. RBI's draft directions (Sept 2026) and MHA's SOP (Jan 2026) point the same way. On the telecom side, blocking the wrong number (e.g. a spoofed caller ID that belongs to an innocent person) has the same "collateral damage" problem.

### What Scalpel is
A decision-support project with **one decision core and three faces**:

| Face | Who it serves | What it does |
|---|---|---|
| **Simulate** | A fraud officer (police cyber cell / bank / telecom fraud desk) | On a simulated Indian telecom + UPI world, traces money *and* SIMs/handsets, ranks cases by money still catchable, flags innocent "human shields", and for every possible action shows money saved vs innocent people harmed. A rule Gate decides what is allowed. |
| **Validate (Court Replay)** | Evaluators, reviewers, the student | Encodes real High Court rulings as structured cases and checks whether Scalpel's Gate reaches the same outcome the court did. |
| **Help ("Account frozen?")** | An innocent person whose account is frozen | Six questions → which rules apply (tagged draft/final), similar real rulings, a document checklist, a transparency-request letter, and links to free legal aid. |

### Why it exists (for the student)
- A standout, explainable resume project in the telecom domain with AI at its core.
- A strong internship submission: the student explains it and sends a deployed link.
- It should genuinely help people (the Help face works today) and be honest about what it cannot prove.

### What success looks like
- The live link loads instantly and a stranger understands the project within 60 seconds.
- The student can defend every rule, number and model feature in an interview without notes.
- Headline results are honest and backed by a held-out test (see §8).
- At least one practitioner (lawyer / cyber-cell officer / wrongly-frozen account holder) has reviewed it and can be quoted.

---

## 2. Goals, non-goals, anti-goals

### Goals
- G1. One shared decision core (Gate + Scorer) used by all three faces.
- G2. Telecom signals (SIM swap, handset reuse, SIM-box route, caller-ID spoof) are real inputs to decisions, and telecom actions are at least half of the action menu.
- G3. Every number on screen is clickable to its formula and/or source.
- G4. Honest evaluation: baselines, a held-out Court Replay set, a changed-world test for the AI model, and a "where Scalpel loses" page.
- G5. Static, precomputed site: no backend and no AI calls at view time.

### Non-goals
- Real integration with I4C/NCRP/CFCFRMS, banks or telecom operators.
- Real personal data of any kind.
- Legal advice.
- Multiple deep scam types (only digital arrest is deep).
- A live LLM chatbot, a graph neural network, a policy sandbox, a mobile app.

### Anti-goals (would be failure even if it "works")
- A headline result that is true only because the student built the world that way, presented as proof.
- Any invented or unverified legal citation.
- A citizen tool that helps real mule-account holders evade investigation.
- A demo that breaks or stalls when an evaluator opens the link.
- Features the student cannot explain.

---

## 3. Constraints

- Solo, 2nd-year student, building with AI coding assistants ("vibe coding").
- About 5 weeks (23 Nov – 28 Dec 2026), including year-end holidays.
- Free tiers only: Gemini API free tier (build time only), Vercel (hosting), GitHub (code + CI), Hugging Face (dataset card).
- Must run on an ordinary laptop. No Docker required.
- Must include AI meaningfully (internship requirement).

---

## 4. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **PreFlight** — check network config changes on a digital twin before they go live | Strong telecom fit, but a commercial product (Forward Networks "Forward Predict", May 2026) and research (Aether, arXiv 2604.18233) already do this; little direct impact on people | Rejected |
| **Golden Hour** — scam victim complaint copilot | Easy and relatable, but Telangana's Cyber Sarathi and Hyderabad's C-Mitra already do AI complaint drafting | Rejected (its "speed" idea survives inside Simulate) |
| **A. Officer twin only** | Unique metric, but all evidence comes from a self-built simulation; capped around 7.5/10 | Rejected |
| **B. Citizen rights tool only** | Real impact today, but weak telecom and AI content | Rejected |
| **C. One decision core, three faces (Simulate / Validate / Help)** | The expensive part (rules + sources) is written once and reused three times; Court Replay adds real-world grounding; Help adds real impact | **Chosen** |

Chosen through: idea-refine → a 4-member LLM council (Architect, Skeptic, Pragmatist, Researcher, with anonymous peer review) → a full grill-me session (all recommendations accepted by the student).

---

## 5. Architecture (decided)

### 5.1 Shape
```
            ┌──────────────── build time (Python) ────────────────┐
 sim/ ──► Cases ─┐                                                 │
 replay/ ► Cases ─┼─► core: Gate (legal: allowed?) ─► Scorer (trade-off) ─► Decisions + traces
 citizen/ ► Cases ┘                                                 │
                                    build.py ─► web/public/data/*.json + manifest
            └─────────────────────────────────────────────────────┘
 web/ (React, static) reads JSON only. Sliders re-weight precomputed harm components in the browser.
```

- **Gate** = 9 deterministic hard rules with citations. Decides which actions are *allowed*. Never uses the sliders.
- **Scorer** = ranks allowed actions by *money saved − weighted harm*. Weights are the visible sliders.
- Every face produces the same `Case` type and receives the same `Decision` type with a rule trace. Explaining the core once explains all three faces.

### 5.2 Data model (pydantic; JSON Schema exported; TypeScript types generated from it)
- `Person` (id, fictional name, role hidden from model: victim / mule-L1 / mule-L2 / cash-out / shield / normal)
- `Account` (id, owner, bank (fictional), opened_on, kind: savings/current/merchant, kyc_changed_on)
- `SIM` (msisdn — masked and generated to be impossible as a real number, operator (fictional Telco-A/B/C), owner, activated_on, swapped_on)
- `Handset` (imei — fictional, sims[])
- `Txn` (id, from, to, amount, timestamp, purpose: transfer/purchase/withdrawal)
- `Call` (from_displayed, from_actual_route, to, timestamp, spoofed: bool, via_sim_box: bool)
- `Case` (id, scam_type, victim, reported_at, evidence: txns/calls, disputed_amount)
- `Action` (type, target, amount?, duration_days?)
  - Money actions: `hold_amount`, `hold_whole_account`
  - Telecom actions: `block_number`, `disconnect_sim`, `block_imei`, `block_simbox_route`, `flag_number_for_verification`
- `Decision` (action, allowed: bool, rule_trace: [rule_id, result, reason], score components, evidence record)
- `Num` (value, formula_id, inputs[], source_url?) — every displayed figure is a `Num`, which is what makes everything clickable.

### 5.3 The Gate (9 rules)
Stored in `core/policy/rules.yaml` with: id, plain-English condition, citation URL(s), status (`final` / `draft` / `design-rule`), effective date, policy version.

| ID | Rule | Basis | Status |
|---|---|---|---|
| R1 | A hold on an account may not exceed the traced disputed amount that entered it | MHA SOP (Jan 2026); Allahabad HC (₹36,000 lien, 2026); Rajasthan HC, Shree Balaji Enterprises v. RBI (2026) | final (verify primary texts) |
| R2 | Whole-account hold only as last resort: mule score above threshold AND ≥2 independent signals AND officer confirmation | RBI draft KYC amendment directions on money mules (Sept 2026) | draft (proposed from 1 Apr 2027) |
| R3 | Every hold carries an expiry ≤ 60 days and a 20-day explanation window for the holder | RBI draft directions (Sept 2026) | draft |
| R4 | Disputed amount < ₹50,000 → restoration path without court order; otherwise court-order path | MHA SOP (Jan 2026) | final (verify) |
| R5 | Never block or spam-tag numbers in the 140xx / 1600xx / 1601xx series | TRAI TCCCPR Third Amendment, Regulation 05 of 2026 (Sept 2026) | final |
| R6 | If the caller ID is suspected spoofed, never block the displayed number; act on the originating route / SIM box instead | Scalpel design rule (the displayed number's real owner is innocent) | design-rule |
| R7 | `disconnect_sim` and `block_imei` require ≥2 independent signals, at least one telecom: SIM swap < 72 h, handset carrying > N SIMs, membership of a SIM-box route | Scalpel design rule | design-rule |
| R8 | A suspected human shield gets only an exact-amount hold plus a notice; never a whole-account hold | Scalpel design rule, consistent with HC rulings on innocent recipients | design-rule |
| R9 | No action is allowed without an evidence record (money/SIM path, timestamps, signals, rule trace) | Scalpel design rule; courts require stated reasons (e.g., MP HC 2026) | design-rule |

Rule: **every citation must be checked against a primary text (court website / AWS judgments / RBI / TRAI / MHA) before `gate-v1` is tagged.** Anything that can only be confirmed from a secondary source is labelled "secondary source" on the site.

### 5.4 The Scorer
```
score(action) = ₹saved_now + ₹protected_future
              − ( w1·innocent_₹_blocked
                + w2·innocent_people_hurt
                + w3·livelihood_days_lost
                + w4·genuine_subscribers_cut_off )
```
- `₹saved_now` = victim money still in the target account that the action keeps from moving on (money actions).
- `₹protected_future` (mainly telecom actions) = calls the target SIM / route / handset would make in the next 7 days (from its observed call rate) × scam conversion rate × average loss per successful scam. Shown as a separate column so it is never confused with money actually held. *(Builder's call.)*
- Default weights (builder's call, shown on the Method page): w1 = 1.0 per ₹; w2 = ₹10,000 per person; w3 = ₹1,000 per day; w4 = ₹2,000 per subscriber.
- **Choosing the action set (builder's call):** greedy with re-simulation at build time: take the best-scoring *allowed* action, re-run the money flow, repeat until no allowed action has a positive score.
- **Sliders (builder's call):** moving a slider re-ranks the action table live in the browser. Headline numbers (Saved, Innocents hurt, golden-hour clock) come from plans precomputed for 5 named weight presets (Balanced, Victim-first, Innocent-first, Telecom-first, Equal) × 4 response delays (10/30/60/120 min). This keeps the site static and the numbers exact.

### 5.4a Observed signals vs hidden truth (builder's call)
The simulator stores hidden truth (true roles, `spoofed`, `via_sim_box`, who is innocent). **The Gate, Scorer and model never read hidden truth.** They see only what an officer could observe; hidden truth is used *only* to grade results afterwards.
- **One model, three classes:** the LightGBM model (§6.2) predicts `mule / shield / normal` from observable features. "Suspected human shield" (R8) = shield probability above threshold.
- **Spoof / SIM-box suspicion (R6, R7):** observable network flags: the displayed number's own SIM was not making a call at that moment, or the call entered through a route already flagged as a SIM-box route.
- **R2 signal list (fixed before `gate-v1`):** account < 30 days old; median dwell < 15 min; ≥ 3 case-linked senders; KYC changed < 30 days ago; linked SIM swapped < 72 h ago; linked handset carries > N SIMs.
- **Officer confirmation (R2):** a toggle in the workspace, default **off**. All headline evaluation numbers use "off" (whole-account holds never happen); an "on" variant is precomputed and reported separately.
- **Harm:** *estimated* harm (from model probabilities) ranks actions; *true* harm (from hidden truth) is what the evaluation reports.

### 5.5 Golden-hour clock
Each mule account has a dwell time (minutes before it forwards money) drawn from a distribution; cash-out nodes remove money permanently. `catchable(t)` = money still sitting in reachable accounts at minute t. Each action takes effect after a response delay (default 30 min; slider). The clock shows catchable ₹ over time and how each strategy changes it.

### 5.6 Case queue ranking
Cases sharing accounts, SIMs or handsets are clustered. Priority of a cluster = catchable ₹ × victims linked ÷ max(minutes to cash-out, 5). (The floor of 5 minutes prevents division blow-up.) Top card reads like: "Act on these 3 accounts first → protects 41 victims, ₹63 lakh."

---

## 6. Face 1 — Simulate

### 6.1 The simulated world (`sim/`)
- ~2,000 fictional people, ~2,500 accounts, ~2,300 SIMs, ~1,900 handsets, 3 fictional operators (Telco-A/B/C), 6 fictional banks (e.g., "Bharat Demo Bank"). Indian-style names from Faker `en_IN`. No real brands, IFSC codes or phone numbers.
- Roles: victims, mule layers L1–L3, cash-out points, human shields (genuine shops/gig workers), normal users.
- Telecom layer: SIM boxes routing calls, spoofed caller IDs (some displaying real-looking numbers of innocent fictional people), SIM swaps, handsets carrying many SIMs.
- **Deep scenario: digital arrest** (call via SIM box with spoofed ID → victim pays L1 → split across L2/L3 with dwell times → one hop buys goods from a shield shop → cash-out). Some cases include a SIM-swap twist.
- Other scam types (investment, task/job, fake APK/KYC) exist only as config files to show the engine is general.
- ~150 cases per world, seeded and reproducible.
- **Two world versions:** `v1` (training/default) and `v2` (shifted: different dwell-time distribution, more shields, older mule accounts, more SIM-box use). Generator spec and rules spec are written separately and frozen before evaluation.
- Parameters are calibrated to published Indian statistics where available; each parameter lists its source or is marked "assumed".

### 6.2 The AI component
- **Mule-likelihood model:** LightGBM classifier over accounts (and linked SIMs/handsets), predicting three classes `mule / shield / normal` from observable features only (see §5.4a). Features (explainable from memory, ~8): account age, outflow/inflow ratio, median dwell time, number of case-linked senders, days since KYC change, days since linked SIM swap, SIMs on linked handset, merchant-like payment diversity.
- **Explanations:** SHAP top-3 reasons per account, shown in the workspace.
- **Honest testing:** trained on `v1`, evaluated on `v2`; compared against a simple hand-written rule score. Results (including where the model is worse) shown on the Lab page.
- **Gemini** is used only at build time to draft plain-English explanation text for demo cases; the student reviews every text. No AI in Court Replay or Help.

### 6.3 Strategies compared
- **Axe:** freeze every account within 3 hops; block every number involved.
- **Slow:** hold only the first-hop account, after a 2-hour delay.
- **Lien-everywhere:** exact-amount hold on every traced account; no telecom actions.
- **Scalpel:** Gate + Scorer.

Metrics per strategy: ₹ held for victims, innocent people hurt, innocent ₹ blocked, genuine subscribers cut off. Reported over 5 seeds with ranges.

### 6.4 Officer output
An **Action Order** with evidence record (PDF/print view), watermarked "SIMULATION – NOT AN OFFICIAL ORDER".

---

## 7. Face 2 — Validate (Court Replay)

### 7.1 Protocol (decided)
1. **Pre-register** the selection criteria in a dated commit: Indian High Court orders (2024–2026) on freezing/lien of bank accounts in cyber-fraud matters.
2. Find candidates via LiveLaw / SCC Online / Verdictum reports; take full texts from the AWS Open Data "Indian High Court Judgments" set (CC-BY-4.0) or the court's site.
3. Target **18 rulings**: 8 **dev** (used while writing the rules) and 10 **held-out**, including **at least 3** where a freeze was upheld or the petition dismissed.
4. **Outcome-blind coding:** a facts sheet (amount, who froze, notice given, account type, holder's role, disputed vs total balance, time elapsed) is filled from the facts section before reading the operative order.
5. Tag **`gate-v1`** before encoding any held-out case. No rule changes after that for the reported numbers.
6. **Second coder:** a friend codes ≥5 cases independently; agreement reported. If no friend is available, this is listed as a limitation.
7. **Baseline:** "always hold only the disputed amount."
8. **Reporting:** raw counts ("x/10 held-out"), confusion table, a short note on every disagreement. Called a *consistency check*, not "validation".
9. Store only structured fields plus a link and citation per ruling (reproducing judgments is permitted under Sec. 52(1)(q) of the Copyright Act; credit the dataset).

### 7.2 Outcome labels
`exact_amount_hold` · `whole_account_hold_upheld` · `release_unfreeze` · `other` (with note).

### 7.3 How a ruling becomes a Scalpel prediction (builder's call; frozen with `gate-v1`)
- **Framing:** Scalpel makes its *own* recommendation from the facts sheet (it does not merely judge the action the police took). Only the Gate is used; the Scorer and sliders play no part in Court Replay.
- A small **facts adapter** turns each facts sheet into a `Case` with observed signals only: amount disputed vs total balance, holder's role as stated in the facts (e.g., merchant paid for goods), mule indicators the court records from the investigation, whether a complaint/acknowledgement exists, whether a notice/reasons were given.
- **Mapping to labels:**
  - No identifiable cyber-fraud complaint, no specified disputed amount, or no recorded reasons (R9 fails) → `release_unfreeze`.
  - R2 conditions met from recorded mule indicators (officer confirmation counted as "on" when the investigating officer's findings are on record) → `whole_account_hold_upheld`.
  - Otherwise → `exact_amount_hold` (amount per R1).
- This lets Scalpel differ from the "always hold only the disputed amount" baseline in both directions (releases and upheld freezes), so the held-out comparison is meaningful.

---

## 8. Face 3 — Help ("Account frozen?")

- Six questions (fixed choices): how much was frozen vs total balance; who froze it (bank / police intimation / unknown); when; whether any notice or complaint number was received; how the money arrived (sale / salary / transfer / unknown); account type.
- Output: the rules that apply (each tagged draft/final with date), up to 3 similar rulings from the Court Replay set, a document checklist, and a **transparency-request letter** that only asks for: complaint/FIR or acknowledgement number, amount held and legal basis, date and expected duration, and the officer/branch to contact. It does not coach anyone on proving innocence (this keeps it useless for evading investigation).
- Links: NALSA legal aid helpline 15100, Tele-Law, Nyaya Bandhu, 1930 and cybercrime.gov.in.
- Fully client-side; the question tree is finite and precomputed; nothing is stored or sent. "Not legal advice — information and a draft only."

---

## 9. Website

### 9.1 Pages
1. **Tour** (landing, plays without clicks or network calls): "Ramesh uncle, 68, loses ₹2 lakh to a digital-arrest call" → Axe vs Scalpel split screen with golden-hour clock → the Gate refusing to block a spoofed number → result card.
2. **Simulate:** case queue + case workspace.
3. **Court Replay:** table of rulings, held-out score vs baseline, confusion table, disagreement notes.
4. **Account frozen?** (Help).
5. **Lab:** response-delay sweep, v1→v2 model test, "where Scalpel loses" page.
6. **Method & Limitations:** formulas, default weights, data sources, every rule with status, honest limits.

Banner on every page: "Simulation with fictional data. Not real people. Not legal advice."

### 9.2 Case workspace sketch
```
┌ Case #0142 · Digital arrest · ₹2,00,000 ─────────── ⏱ Catchable: ₹1.6L · 37 min ┐
│  [ Money + SIM map, ~200-node subgraph ]   │  Actions (Gate verdict · score)      │
│   ☎ SIM box ─► spoofed ID ─► Ramesh        │  ✅ Block SIM-box route        R6,R7 │
│   Ramesh ─► A(mule) ─► B ─► Shop E(shield) │  ✅ Hold ₹1.2L in A            R1    │
│                                            │  ✅ Hold ₹40k in E + notice    R8    │
│  [Axe ⟷ Scalpel]  sliders: w1 w2 w3 w4     │  ❌ Block displayed number     R6    │
│  Saved ₹1.71L · Innocents hurt 0           │  [Action Order (SIMULATION)]         │
└───────────────────────────────────────────────────────────────────────────────────┘
```
Every number opens a popover with its formula, inputs and source.

---

## 10. Build, test, deploy

- **Stack:** Python 3.11 (pandas, NetworkX, LightGBM, SHAP, pydantic, pytest, hypothesis); React + Vite + TypeScript + Tailwind + Cytoscape.js.
- **Repo layout:**
  ```
  core/ schema.py  gate.py  score.py  policy/rules.yaml
  sim/  generator.py  configs/{v1,v2,investment,...}.yaml
  model/ train.py  explain.py
  replay/ cases/*.yaml  coding_sheet.md  run.py
  citizen/ tree.yaml  letter_template.md
  lab/  sweeps.py
  adapters/ camara.py   (interface + mock; optional recorded fixture from Nokia's free simulator)
  build.py  → web/public/data/*.json + manifest.json (seed, gate version, hashes)
  web/
  tests/
  docs/
  ```
- **Tests:**
  - Golden test per Gate rule.
  - Property tests: a hold never exceeds the disputed amount unless R2 fired; 140/1600/1601 numbers are never blocked; no hold exceeds 60 days; no action without an evidence record; a spoofed displayed number is never blocked.
  - Court Replay report generated on every build.
  - Build reproducibility: same seed → same manifest hashes.
- **CI/CD:** GitHub Actions runs tests and `build.py`; Vercel deploys only from a green build.
- **CAMARA:** an adapter interface (`SimSwap`, `NumberVerification`) with a mock as default. If Nokia's free simulator works, record one real response as a fixture and show it on the Method page. No live call on the demo path.

---

## 11. Milestones

| Date | Milestone |
|---|---|
| 23–25 Nov | **48-hour test:** one hand-made static page (Ramesh case, Axe vs Scalpel, one chart from a 30-case toy script) shown to 5 people. Pass = ≥3 explain it as "holds only the stolen amount instead of freezing innocent people", and the toy shows at least one setting where Scalpel stops winning. **If it fails (builder's call):** rewrite the page's story and re-test once by 27 Nov. Schema + Gate work continues in parallel because every version needs it. If the re-test also fails, keep the engine but lead the site with Help + Court Replay instead of the officer simulation. |
| by 30 Nov | Schema, Gate (9 rules) + golden tests, Scorer, small generator, 2 dev rulings agree |
| by 7 Dec | Simulate on a static Vercel site: map, action table, sliders, Action Order; 5 dev rulings encoded; practitioner outreach sent |
| by 14 Dec | **Minimum shippable (tag):** Simulate end-to-end, Court Replay (all 8 dev + `gate-v1` tag + held-out encoding started), Tour, clickable numbers |
| by 20 Dec | **Feature freeze:** Help page, Lab (sweep, v1→v2 test, where-it-loses), held-out results, HF dataset card |
| 21–28 Dec | Bugs only, 3-minute video, README, limitations note, mock interviews, submit by 28 Dec |

---

## 12. Deliverables

- Live site (Vercel) and public GitHub repo (MIT license) with README: problem, demo GIF, architecture diagram, results table, limitations.
- 3-minute demo video (backup if the site is ever down).
- Small Hugging Face dataset card for the simulated world (synthetic, not real persons; CC-BY-4.0).
- 2–3 resume bullets built from the real final numbers, and one LinkedIn post.
- One quoted practitioner review (goal).

---

## 13. Score targets (honest)

| Aspect | Target | What earns it |
|---|---|---|
| Uniqueness | 9 | Harm-aware action scoring + Court Replay + telecom signals in one engine |
| Evaluation rigor | 9 | Baselines, held-out rulings, frozen `gate-v1`, v1→v2 model test, "where it loses" |
| Feasibility | 9 | Cuts in §2; milestones in §11 |
| Tech Mahindra telecom fit | 9 | Telecom signals drive the Gate; ≥ half the actions are telecom; CAMARA adapter |
| Demo reliability | 9–10 | Static precomputed site, scripted tour, backup video |
| Explainability | 9 | One schema, one pure core, rule traces, clickable numbers, ~8 model features |
| Real-world validation | 8 | Court Replay + one practitioner review; cannot honestly be 9 with simulated flows |
| Real impact on people | 8 | Help face usable today; impact is still mostly potential |
| Deployability | 6 | "Integration-ready" adapters; real integration is impossible for a student |

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Circular "I win in my own world" result | Separate frozen specs, v2 world, held-out rulings, baselines, "where it loses" page |
| Wrong or invented legal citation | Primary-text check before `gate-v1`; status and date on every rule; no AI in Court Replay or Help |
| Too few usable rulings | Encode 5 early; if fewer than 15 usable in total, report the smaller n honestly |
| Help face misused by mule holders | Letter asks only for transparency information |
| Scope overrun | Minimum shippable by 14 Dec; feature freeze 20 Dec; Not-doing list in §2 |
| Student can't explain parts | ~8 model features, 9 rules, mock interviews in the final week |
| Free-tier failure on demo day | No runtime dependencies at all |

---

## 15. Left to the builder

- Exact distributions for dwell times, shield frequency and SIM-box share (documented in configs, sourced or marked "assumed").
- Threshold N for "handset carrying > N SIMs" (suggest N = 5) and the mule-score threshold for R2.
- Visual styling, colours and layout details beyond §9.2.
- Exact wording of explanation texts (reviewed by the student).
- Which 18 rulings, within the protocol in §7.
