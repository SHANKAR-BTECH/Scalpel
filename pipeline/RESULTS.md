Scalpel's order beats the warning-sign rule: it secures 97.8% of the best possible rescue vs 87.0% (5 unseen v2 worlds pooled, 10 actions an hour). It does worse than 'biggest amount first' at K=5, 1x drain, low noise (92.5% vs 94.8%) and in 8 of 24 settings tested. It is never ahead of it in any of the 24 settings tested, so in these worlds the amount alone carries most of the ordering.

# Policy test bench under stated assumptions

> Simulation with fictional data. Not legal advice. Every number below comes from fake worlds whose rules are listed at the end. It shows how the policies compare *under those assumptions*; it does not prove the AI works on real banks.

**Agreed before any results were produced:** if the AI only ties the warning-sign rule, that is an honest, acceptable result and this report says so. A tie means within 1 point of the best possible rescue.

Unseen test worlds: 5 v2 worlds (seeds 201, 202, 203, 204, 205), built and locked before training. Numbers are pooled over the 5 with the lowest and highest single world in brackets. v1 (the practice world the AI learned from) is shown alongside, so the drop is visible.

## 1. Holds: the two-number headline

Freeze Ratio = money held ÷ real victim money (1.00× is exactly right). Victim money missed = real victim money left unheld, including victims who never complained. The Axe ratio here is our own simulated figure; no industry figure is quoted.

| Policy | Freeze Ratio v2 (range) | Victim money missed v2 | Innocent money held v2 | People wrongly restricted v2 | Future money stopped v2 | Freeze Ratio v1 |
|---|---|---|---|---|---|---|
| 0 Do nothing | 0.00× (0.00–0.00) | ₹25,281,614 of ₹25,281,614 | ₹0 | 0 | ₹0 | 0.00× |
| A Axe (whole freeze) | 15.22× (12.97–16.70) | ₹1,648,783 of ₹25,281,614 | ₹361,186,753 | 2058 | ₹1,762,761 | 10.60× |
| B Ruler (exact traced) | 0.44× (0.26–0.56) | ₹14,151,172 of ₹25,281,614 | ₹0 | 0 | ₹0 | 0.49× |
| C Scalpel | 0.44× (0.26–0.56) | ₹14,151,172 of ₹25,281,614 | ₹0 | 0 | ₹0 | 0.49× |

Scalpel and the Ruler hold the same amounts: both hold exactly the traced money. Scalpel adds the order, the reasons, the rule checks and the suggestions below.

Scalpel suggested 136 whole freezes on v2 for an officer to decide; **2 of them were on innocent accounts**. None were applied automatically, so "future money stopped" is ₹0 for Scalpel by design. Only the Axe stops money that arrives later, at the cost of the innocent money it locks.

## 2. Rescue: who the officer acts on first

Every queue uses the same exact-sized holds; only the order differs. The officer can act on K accounts an hour (K = 5, 10, 20 are **assumptions**, not measured). Mule money drains 15% an hour; shop money drains 5× slower. Shown as % of the best possible order (the "oracle", which knows the hidden answers).

| Order | K=5 v2 | K=10 v2 | K=20 v2 | K=10 v1 |
|---|---|---|---|---|
| First come, first served | 29.4% (15–51) | 41.9% (23–68) | 60.5% (42–82) | 18.9% |
| Biggest amount first | 95.2% (95–96) | 98.1% (97–99) | 99.6% (99–100) | 93.8% |
| Biggest case first | 36.5% (32–43) | 48.3% (47–54) | 68.6% (66–71) | 30.9% |
| Warning-sign rule (2+ signs first) | 72.1% (59–81) | 87.0% (77–96) | 96.1% (92–99) | 90.2% |
| Scalpel (money likely lost per hour) | 93.2% (92–95) | 97.8% (96–99) | 99.5% (99–100) | 93.9% |
| Perfect knowledge of who is a mule (ceiling) | 95.3% (95–96) | 98.1% (97–99) | 99.6% (99–100) | 93.8% |

The ceiling row feeds Scalpel's own formula the TRUE roles: no mule-score model can do better with this rule. Where it barely beats 'biggest amount first', the amount already gives away who the mules are, so better detection cannot help the order.

Scalpel's order = amount × (mule score × 15% + (1 − mule score) × 3%), the money likely lost per hour of waiting. It uses the 5× drain assumption; section 3 tests it against 1×, 2× and 10×.

## 3. When does it win? (the conditional headline)

**Scalpel's order beats the warning-sign rule at every drain ratio tested (1x, 2x, 5x, 10x).**

With noisier phone signals: Scalpel's order beats the warning-sign rule at every drain ratio tested (1x, 2x, 5x, 10x).

| Mules drain faster than shops by | Phone-signal noise | Scalpel | Warning-sign rule | Result |
|---|---|---|---|---|
| 1x | low | 96.3% | 85.0% | beats |
| 2x | low | 97.3% | 86.2% | beats |
| 5x | low | 97.8% | 87.0% | beats |
| 10x | low | 98.0% | 87.2% | beats |
| 1x | high | 96.3% | 81.8% | beats |
| 2x | high | 97.2% | 83.1% | beats |
| 5x | high | 97.8% | 84.0% | beats |
| 10x | high | 97.9% | 84.2% | beats |

## 4. The cost of waiting

**Each hour of delay on a mule lets ₹11,644 of real victim money leave, on average, in this world** (v2, first hour, 15% an hour drain). An exact hold only covers money traced from complaints made so far, so what the hold itself can still secure drops by only ₹894 per mule in that hour: the bigger loss is money nobody has complained about yet.

## 5. Role guesses

| Model | Real mules in the officer's top 10 (Scalpel order) | Same, warning-sign rule | Innocent accounts scored 0.85+ (of them shops) | Their held money | Of accounts scored 0.85+, really mules | AUC v2 (range) |
|---|---|---|---|---|---|---|
| logistic | 50 of 50 | 50 of 50 | 5 (0) | ₹231 | 98% of 203 | 1.00 (0.99–1.00) |
| lightgbm | 50 of 50 | 50 of 50 | 1 (0) | ₹0 | 99% of 162 | 0.88 (0.87–0.88) |

For scale: the Scalpel order secured ₹10,877,361 of victim money across the 5 worlds (K=10). Innocent accounts scored 0.85+ are listed beside it on purpose: a high score on an innocent person is a real harm, even though the Gate never freezes a whole account without an officer (R2) and gives shops only an exact hold (R8).

**v2 is also "too easy" by our own alarm for logistic** (AUC above 0.98 on accounts holding traced money). The fake worlds separate mules more cleanly than real data would, so treat every AI number here as an upper bound.

AUC is measured on the calibrated score, which keeps the raw model's order exactly.

Both orders put only real mules in the top 10 on every world, so the top 10 does not separate them; the difference shows further down the list (section 2).

The "really mules" column is the calibration check: a score of 0.85+ should mean roughly 85%+ of those accounts are mules.

## 6. Where the AI loses

The 5 costliest v2 mistakes (wrong score × money involved), with the reasons the AI gave. v2 mules are slower (money waits 20–90 minutes) and often old rented accounts, unlike anything in v1, so the AI scores some of them near 0. The amount-based order still puts big ones early, which is why the rescue numbers hold up.

| World | Account | Really | Mule score | Traced money | AI's reasons |
|---|---|---|---|---|---|
| v2-s201 | B02830 | mule | 0.09 | ₹193,948 | Money came from 3 different senders; No call forwarding; Money left within 63 minutes of arriving |
| v2-s201 | B01589 | mule | 0.02 | ₹144,557 | All the money came from one sender; No warning signs; Money left within 39 minutes of arriving |
| v2-s204 | B01118 | mule | 0.01 | ₹137,829 | Money came from 2 different senders; No warning signs; Money left within 72 minutes of arriving |
| v2-s205 | B01316 | mule | 0.00 | ₹110,966 | Money came from 2 different senders; 2 warning signs at once; Money usually stays a long time (1440 minutes or more) |
| v2-s205 | B02089 | mule | 0.03 | ₹101,861 | Money came from 2 different senders; No warning signs; Money left within 72 minutes of arriving |

## 6b. The harder split-payment world (pre-registered)

Settings, the stronger simple rule (biggest case first) and the pass mark (+2 points over both simple rules) were locked in `configs/v3_split.lock` before any v3 world was graded. The mule-score model was not retrained.

**Split-payment world (locked in advance; high phone-signal noise, K=10, 3 seeds): the mule-score model's order got 97.1% of the best possible, against 96.7% for biggest amount first and 42.2% for biggest case first. That is +0.3 points against the better simple rule; the pass mark was +2, so the model's order has not earned its place in this world. Even perfect knowledge of who is a mule would only reach 97.1% (+0.4 points), so no model could have passed this bar: in this world the amount already gives away who the mules are.**

| Order | K=5 high noise | K=10 high noise | K=20 high noise | K=10 low noise |
|---|---|---|---|---|
| First come, first served | 9.8% (8–13) | 13.9% (11–18) | 26.8% (21–33) | 13.9% |
| Biggest amount first | 95.7% (95–97) | 96.7% (96–97) | 98.8% (98–99) | 96.7% |
| Biggest case first | 33.1% (22–38) | 42.2% (28–53) | 59.5% (45–75) | 42.2% |
| Warning-sign rule (2+ signs first) | 66.9% (60–77) | 75.3% (73–79) | 88.4% (87–89) | 79.6% |
| Scalpel (money likely lost per hour) | 95.4% (94–97) | 97.1% (96–97) | 99.0% (99–99) | 97.0% |
| Perfect knowledge of who is a mule (ceiling) | 95.6% (94–97) | 97.1% (97–98) | 99.0% (99–99) | 97.1% |

Disclosed after grading: the "mixed credit" top-up in the v3 generator is taken from money the mule kept back, which is mostly victim money, not the mule's own. The lock and the result are unchanged.

## 6c. The fair-test world v4 (pre-registered)

Settings, the speed formula, the no-model orders and the pass mark (+2 points over the best no-model order) were locked in `configs/v4_fair.lock` before any test world existed. The check on practice worlds, done before the lock, already said the test was **not passable**: perfect knowledge beat the best no-model order by only 0.63 points (needed 4). No setting was tuned after that. The model was trained once on v4 seed 400.

**Result: not earned** (margin +0.07 points at K=10, high noise, seeds 401-403 pooled).

| Order | K=2 | K=5 | K=10 | K=10, past speed tells nothing | K=10, 25% paid straight to shops |
|---|---|---|---|---|---|
| Biggest amount first | 86.7% | 91.4% | 95.9% | 96.7% | 97.9% |
| Biggest case first | 31.7% | 38.6% | 52.3% | 57.7% | 55.3% |
| Amount x past speed (no model) | 88.7% | 94.9% | 98.0% | 95.7% | 98.8% |
| Mule score only (today's Scalpel order) | 87.4% | 92.5% | 97.0% | 97.2% | 98.3% |
| Mule score x past speed (full) | 88.6% | 95.3% | 98.0% | 96.2% | 98.9% |
| Perfect knowledge (true roles and speeds) | 90.9% | 97.3% | 98.8% | 98.7% | 98.8% |

Mule score accuracy (Brier score, lower is better): 0.022 vs 0.103 for always guessing the average.

What it means: how fast an account moved money before is the useful clue for the to-do order (+2 to +3.5 points over biggest first). The mule score adds almost nothing on top, because the amount and account age already give most mules away. The score's value is in naming who is likely a mule and why (memo reasons, the whole-freeze condition R2), not in the order.

## 7. Assumptions (change these and the numbers change)

- The worlds are invented. v2 changes criminal habits on purpose: older rented mule accounts, slower mules, twice as many innocent shops, more digital-arrest scams.
- Victims complain late or never (40–70% report, up to 72 hours late). Only complaints made before the decision moment are visible.
- After the decision moment, mule money drains 15% an hour and other money drains 1×, 2×, 5× or 10× slower. Note the mismatch: before the decision moment, shops in these worlds sweep most of their takings every evening (30% of them hourly), so for those shops the 1× row is the realistic one.
- The mule score is calibrated with a smooth curve (Platt scaling) fitted on an unseen v1 world. This replaced a step-shaped calibrator after the final review showed it flattened many real mules to exactly 0; that change was made after v2 results had been seen, and is disclosed here.
- Victim payments in the world file come from neutral outside-account ids, as a bank would see them; only complaints say who reported fraud.
- Officer capacity K = 5, 10 or 20 accounts an hour.
- The AI never saw v2's answers. Only the grader opens truth.json.
- v2's settings were locked before training and re-locked once, openly, when shared world-realism fields were added (no v2 result had been looked at).
- v1 is easy for the AI (near-perfect on an unseen v1 seed). The v1 column is graded on v1 seed 101, which the AI trained on.
