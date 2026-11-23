from scalpel_grade.grade import grade_holds

TRUTH = {"victimMoneyAtCutoff": {"M1": 30_000_00, "M2": 20_000_00}, "roles": {"M1": "mule", "M2": "mule", "S1": "shield"}}


def rows(**held):
    return [{"account": a, "held": h} for a, h in held.items()]


def test_do_nothing_misses_all_victim_money():
    g = grade_holds(rows(), TRUTH)
    assert g["victimMoneyMissed"] == 50_000_00
    assert g["freezeRatio"] == 0
    assert g["recoveryRate"] == 0


def test_whole_freeze_overholds_but_misses_nothing():
    g = grade_holds(rows(M1=453_600_00, M2=20_000_00, S1=100_000_00), TRUTH)
    assert g["victimMoneyMissed"] == 0
    assert g["innocentHeld"] == (453_600_00 - 30_000_00) + 100_000_00
    assert g["freezeRatio"] == (453_600_00 + 20_000_00 + 100_000_00) / 50_000_00


def test_exact_hold_is_one_to_one():
    g = grade_holds(rows(M1=30_000_00, M2=20_000_00), TRUTH)
    assert g["freezeRatio"] == 1
    assert g["innocentHeld"] == 0
    assert g["peopleWronglyRestricted"] == 0


def test_shield_restricted_counts_as_harm():
    g = grade_holds(rows(S1=5_000_00), TRUTH)
    assert g["peopleWronglyRestricted"] == 1
