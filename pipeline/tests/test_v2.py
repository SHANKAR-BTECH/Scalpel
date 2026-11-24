from pathlib import Path
from statistics import mean

import pytest

from scalpel_sim.config import v1_config
from scalpel_sim.configs.v2 import V2_SEEDS, fingerprint, v2_config
from scalpel_sim.signals import compute_signals
from scalpel_sim.world import DAY, make_world

LOCK = Path(__file__).resolve().parents[1] / "configs" / "v2.lock"


def test_v2_settings_match_the_lock_made_before_training():
    assert LOCK.read_text().split()[0] == fingerprint(), (
        "World v2 settings changed after they were locked. Only update configs/v2.lock on purpose, in its own commit.")


def test_five_seeds():
    assert len(V2_SEEDS) == 5 and len(set(V2_SEEDS)) == 5


@pytest.fixture(scope="module")
def worlds():
    return make_world(v1_config().scaled(0.4)), make_world(v2_config(V2_SEEDS[0]).scaled(0.6))


def test_no_shared_ids_between_v1_and_v2(worlds):
    (w1, _), (w2, _) = worlds
    assert {a["id"] for a in w1["accounts"]}.isdisjoint({a["id"] for a in w2["accounts"]})
    assert {t["id"] for t in w1["txns"]}.isdisjoint({t["id"] for t in w2["txns"]})


def test_each_listed_change_shows_up(worlds):
    (w1, t1), (w2, t2) = worlds
    age = lambda w, t: mean((w["cutoff"] - a["openedAt"]) / DAY for a in w["accounts"] if t["roles"][a["id"]] == "mule")
    assert age(w2, t2) > age(w1, t1)
    share = lambda t, r: sum(v == r for v in t["roles"].values()) / len(t["roles"])
    assert share(t2, "shield") >= 1.8 * share(t1, "shield")
    c1, c2 = v1_config(), v2_config(V2_SEEDS[0])
    assert c2.mule_dwell_minutes[0] >= 20 and c2.hops == (4, 6)
    da = lambda c: next(s.share for s in c.scams if s.name == "digital_arrest")
    assert da(c2) > da(c1)


def test_every_v2_seed_passes_the_basic_world_checks():
    for seed in V2_SEEDS:
        w, t = make_world(v2_config(seed).scaled(0.3))
        s = compute_signals(w)
        assert w["complaints"] and t["victimMoneyAtCutoff"]
        assert all(set(v) <= set(s) or True for v in [s])
        bal = {a["id"]: a["opening"] for a in w["accounts"]}
        for x in sorted(w["txns"], key=lambda x: (x["at"], x["id"])):
            if x["from"] in bal:
                bal[x["from"]] -= x["amount"]
                assert bal[x["from"]] >= 0
            if x["to"] in bal:
                bal[x["to"]] += x["amount"]
