import itertools

from scalpel_grade.grade import (grade_holds, headline_line, oracle_order, rescue, role_counts,
                                 future_money_stopped, top_mules)

TRUTH = {
    "roles": {"M": "mule", "S": "shield", "N": "normal", "M2": "mule"},
    "victimMoneyAtCutoff": {"M": 100_00, "S": 50_00, "M2": 30_00},
    "muleDrainPerHour": 0.15, "drainRatio": 5.0, "afterHours": 72,
    "futureVictimInflow": {"M": [1_00] * 72},
}
HELD = {"M": 100_00, "S": 50_00, "M2": 30_00}


def test_hand_made_truth_gives_exact_role_counts():
    assert role_counts(TRUTH) == {"mule": 2, "shield": 1, "normal": 1}


def test_doing_nothing_misses_the_most_money():
    nothing = grade_holds([], TRUTH)
    ruler = grade_holds([{"account": a, "held": h} for a, h in HELD.items()], TRUTH)
    axe = grade_holds([{"account": "M", "held": 900_00}, {"account": "S", "held": 400_00}], TRUTH)
    assert nothing["victimMoneyMissed"] > max(ruler["victimMoneyMissed"], axe["victimMoneyMissed"])


def test_rescue_for_two_accounts_matches_hand_calculation():
    two = {"M": 100_00, "S": 50_00}
    # One action per hour. Shop first: 5,000 now, then the mule after 1 hour of 15% drain: 10,000 x 0.85 = 8,500.
    assert rescue(["S", "M"], two, TRUTH, k=1) == 50_00 + 85_00
    # Mule first: 10,000 now, then the shop after 1 hour of 3% drain: 5,000 x 0.97 = 4,850.
    assert rescue(["M", "S"], two, TRUTH, k=1) == 100_00 + 48_50
    assert oracle_order(two, TRUTH, k=1) == ["M", "S"]


def test_oracle_is_never_beaten_by_any_order():
    for k in (1, 2):
        for ratio in (1.0, 2.0, 10.0):
            best = rescue(oracle_order(HELD, TRUTH, k, ratio), HELD, TRUTH, k, ratio)
            for order in itertools.permutations(HELD):
                assert best >= rescue(list(order), HELD, TRUTH, k, ratio)


def test_whole_freeze_stops_future_money_exact_hold_does_not():
    rows = [{"account": "M", "held": 900_00, "action": "WHOLE_FREEZE"}, {"account": "S", "held": 50_00, "action": "EXACT_HOLD"}]
    assert future_money_stopped(rows, TRUTH) == 72 * 1_00


def test_top_mules_counts_real_mules_in_first_ten():
    assert top_mules(["M", "S", "M2", "N"], TRUTH, n=2) == 1


def test_first_line_flips_when_results_flip():
    win = headline_line(scalpel_pct=80.0, signrule_pct=70.0)
    lose = headline_line(scalpel_pct=70.0, signrule_pct=80.0)
    tie = headline_line(scalpel_pct=75.3, signrule_pct=75.0)
    assert win.startswith("Scalpel's order beats the warning-sign rule")
    assert lose.startswith("Scalpel's order does not beat the warning-sign rule")
    assert tie.startswith("Scalpel's order ties the warning-sign rule")


def test_conditional_sentence_names_the_smallest_winning_ratio():
    from scalpel_grade.report import conditional_sentence
    assert "at least 5x" in conditional_sentence({2.0: "ties", 5.0: "beats", 10.0: "beats"})
    assert "every drain ratio" in conditional_sentence({2.0: "beats", 5.0: "beats", 10.0: "beats"})
    assert "but not at 10x (ties)" in conditional_sentence({2.0: "beats", 5.0: "beats", 10.0: "ties"})


def test_first_line_also_says_how_it_does_against_biggest_first():
    line = headline_line(scalpel_pct=97.6, signrule_pct=87.0, biggest_pct=98.1)
    assert "ties the plain 'biggest amount first' order" in line
    assert "does not beat the plain" in headline_line(scalpel_pct=90.0, signrule_pct=87.0, biggest_pct=98.0)


def test_comparison_with_biggest_first_uses_every_setting():
    from scalpel_grade.report import vs_biggest_sentence
    s = vs_biggest_sentence([("K=5", 92.2, 95.2), ("K=10", 97.6, 98.1), ("K=20", 99.4, 99.6)])
    assert "does worse than 'biggest amount first' at K=5 (92.2% vs 95.2%)" in s
    assert "never ahead of it in any of the 3 settings" in s
    assert "ahead of 'biggest amount first' in 1 of 2" in vs_biggest_sentence([("a", 99.0, 97.0), ("b", 90.0, 90.5)])


def test_delay_shows_both_hold_capped_and_real_drain():
    from scalpel_grade.report import delay_per_mule_hour
    truth = {"roles": {"M": "mule"}, "victimMoneyAtCutoff": {"M": 100_00}, "muleDrainPerHour": 0.15, "drainRatio": 5.0}
    capped, real = delay_per_mule_hour({"M": 40_00}, truth, 5.0)
    assert capped == 0          # after 1 hour 85.00 is still there, more than the 40.00 hold
    assert real == 15_00        # but 15.00 of real victim money left


def test_innocent_harm_counts_normals_too():
    from scalpel_grade.report import _model_marks
    from scalpel_grade.grade import suggested_on_innocent
    acc = {a: {"muleScore": s, "reasons": ["a", "b", "c"]} for a, s in {"M": 0.9, "S": 0.9, "N": 0.95}.items()}
    marks = _model_marks(acc, TRUTH, {"M": 1, "S": 2, "N": 3})
    assert marks["innocent085"] == 2 and marks["innocentMoney085"] == 5
    rows = [{"account": "N", "suggestedWholeFreeze": True}, {"account": "M", "suggestedWholeFreeze": True}]
    assert suggested_on_innocent(rows, TRUTH) == 1


def test_conditional_sentence_lists_the_ratios_it_was_given():
    from scalpel_grade.report import conditional_sentence
    s = conditional_sentence({1.0: "does not beat", 2.0: "beats", 5.0: "beats"})
    assert "at least 2x" in s
    mixed = conditional_sentence({1.0: "beats", 2.0: "beats", 10.0: "ties"})
    assert "any drain ratio" not in mixed and "1x, 2x, 10x" in mixed
