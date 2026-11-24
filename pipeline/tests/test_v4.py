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


def test_score_only_order_uses_the_same_numbers_as_queue_ts():
    import re
    ts = (Path(__file__).resolve().parents[2] / "packages/sim-runner/src/queue.ts").read_text()
    mule = float(re.search(r"MULE_DRAIN_PER_HOUR = ([0-9.]+)", ts).group(1))
    ratio = float(re.search(r"ASSUMED_DRAIN_RATIO = ([0-9.]+)", ts).group(1))
    assert v4.MULE_DRAIN == mule and abs(v4.SHOP_DRAIN - mule / ratio) < 1e-12


def test_model_hash_file_is_recorded():
    from pathlib import Path
    from scalpel_sim.configs import v4_fair as C
    h = Path(C.__file__).with_suffix(".model-hash").read_text().strip()
    assert len(h) == 64 and all(c in "0123456789abcdef" for c in h)


def test_reliability_bands_cover_all_accounts():
    import numpy as np
    from scalpel_grade.v4_run import reliability

    class M:
        def mule_score(self, X):
            return np.linspace(0, 1, len(X))
    from scalpel_sim.configs import v4_fair as C
    from scalpel_sim.world import make_world
    from scalpel_model.features import build_features
    from scalpel_sim.signals import compute_signals
    w = make_world(C.v4_config(C.V4_DEV_SEEDS[0]))
    n = len(build_features(w[0], compute_signals(w[0])))
    rel = reliability(M(), [w])
    assert sum(b["accounts"] for b in rel) == n
