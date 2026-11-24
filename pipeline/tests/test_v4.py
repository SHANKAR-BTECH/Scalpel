"""World v4 "fair test": the lock, and that older worlds did not change."""
import hashlib
import json
from pathlib import Path

from scalpel_sim.configs import v4_fair as C
from scalpel_sim.world import make_world, remaining_victim_money
from scalpel_grade import v4

LOCK = json.loads((Path(__file__).resolve().parents[1] / "scalpel_sim/configs/v4_fair.lock").read_text())


def test_lock_matches_settings():
    assert LOCK["fingerprint"] == C.fingerprint()
    assert LOCK["changes"] == C.CHANGES and len(C.CHANGES) <= 2


def test_lock_records_the_pre_check_honestly():
    assert LOCK["passable"] == (LOCK["meanCeilingGapPoints"] >= C.PASSABLE_POINTS)
    assert {d["seed"] for d in LOCK["devChecks"]} == set(C.V4_DEV_SEEDS)
    assert not set(C.V4_SEEDS) & set(C.V4_DEV_SEEDS) and C.V4_TRAIN_SEED not in C.V4_SEEDS


def test_v4_world_has_its_changes():
    w, t = make_world(C.v4_config(C.V4_DEV_SEEDS[0], "high"))
    mules = [a for a, r in t["roles"].items() if r == "mule"]
    types = {a["id"]: a["type"] for a in w["accounts"]}
    assert any(types[m] == "CURRENT" for m in mules)                  # some mules are current accounts
    assert set(t["mulekind"].values()) == {"pro", "rented"}
    assert t["settle"]                                                   # shops lose money once a day, not every hour
    shop = next(iter(t["settle"]))
    v0 = t["victimMoneyAtCutoff"][shop]
    assert remaining_victim_money(t, shop, 22) == v0 and remaining_victim_money(t, shop, 23) < v0


def test_speed_formula_is_the_pre_registered_one():
    assert v4.speed_from_dwell(60) == min(0.40, max(0.03, 0.6931471805599453 / 4))
    assert v4.speed_from_dwell(1) == 0.40 and v4.speed_from_dwell(1440) == 0.03
