from pathlib import Path

import pytest

from scalpel_sim.configs.v3_split import PASS_MARK_POINTS, V3_SEEDS, fingerprint, v3_config, verdict
from scalpel_sim.world import make_world

LOCK = Path(__file__).resolve().parents[1] / "configs" / "v3_split.lock"


def test_v3_settings_match_the_lock_made_before_grading():
    assert LOCK.read_text().split()[0] == fingerprint(), (
        "World v3 settings or its grading rules changed after they were locked. Update configs/v3_split.lock only on purpose, in its own commit.")


def test_three_seeds_and_two_noise_levels():
    assert V3_SEEDS == (301, 302, 303)
    assert v3_config(301, "high").signal_noise == "high" and v3_config(301).signal_noise == "low"


@pytest.fixture(scope="module")
def world():
    return make_world(v3_config(V3_SEEDS[0]).scaled(0.5))


def test_every_mule_to_mule_piece_is_under_10000_rupees(world):
    w, t = world
    roles = t["roles"]
    pieces = [x for x in w["txns"] if roles.get(x["from"]) == "mule" and roles.get(x["to"]) == "mule"]
    assert len(pieces) > 50
    assert max(x["amount"] for x in pieces) < 10_000 * 100


def test_layers_after_the_first_are_3_to_5_wide_and_chains_4_to_5_deep(world):
    _, t = world
    for c in t["campaigns"]:
        assert 1 <= len(c["chain"]) <= 5
        for level in c["chain"][1:]:
            assert len(level) <= 5


def test_layer_one_leaks_cash(world):
    w, t = world
    first = {m for c in t["campaigns"] for m in c["chain"][0]}
    assert any(x["from"] in first and x["to"] == "EXT-ATM" for x in w["txns"])


def test_v2_and_v1_worlds_are_unchanged_by_the_split_code():
    """Hashes taken from the generator before the split code was added (commit 992244c's world.py)."""
    import hashlib
    import json
    from scalpel_sim.config import v1_config
    from scalpel_sim.configs.v2 import v2_config
    h = lambda cfg: hashlib.sha256(json.dumps(make_world(cfg), sort_keys=True).encode()).hexdigest()
    assert h(v2_config(201).scaled(0.2)) == "063fb75e4f85a6e28e632e7d18a96538458759d05e11d4fd387b1adb4d11f1bd"
    assert h(v1_config().scaled(0.2)) == "bcabe76ca66ab7021f41ee355225025ee43d33c94070000b650084a0ed46c855"


def test_pass_mark_is_two_points_over_both_simple_rules():
    assert PASS_MARK_POINTS == 2.0
    assert verdict(80.0 + 1.9, 80.0, 70.0) == "not earned"
    assert verdict(80.0 + 2.1, 80.0, 70.0) == "earned"
    assert verdict(90.0, 80.0, 88.5) == "not earned"   # must beat the stronger rule too
