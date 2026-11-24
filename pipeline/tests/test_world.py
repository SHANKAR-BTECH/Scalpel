import json
from collections import Counter

import pytest

from scalpel_sim.config import WorldConfig, v1_config
from scalpel_sim.export import FORBIDDEN_KEYS
from scalpel_sim.world import make_world, remaining_victim_money, rescue_share
from scalpel_sim.tracing import trace
from test_tiny import all_keys

SMALL = v1_config().scaled(0.2)  # ~1,000 accounts: same rules, fast tests


@pytest.fixture(scope="module")
def made():
    return make_world(SMALL)


def test_same_seed_same_world(made):
    again = make_world(SMALL)
    assert json.dumps(made[0], sort_keys=True) == json.dumps(again[0], sort_keys=True)
    other = make_world(SMALL.with_seed(SMALL.seed + 1))
    assert json.dumps(made[0], sort_keys=True) != json.dumps(other[0], sort_keys=True)


def test_full_v1_has_the_planned_size():
    cfg = v1_config()
    assert cfg.n_accounts == 5000


def test_no_answers_anywhere_in_world(made):
    world, _ = made
    assert not {k.lower() for k in all_keys(world)} & FORBIDDEN_KEYS
    assert all(a["id"].startswith("A") and a["id"][1:].isdigit() for a in world["accounts"])


def test_money_is_conserved_and_never_negative(made):
    world, _ = made
    bal = {a["id"]: a["opening"] for a in world["accounts"]}
    opened = {a["id"]: a["openedAt"] for a in world["accounts"]}
    for t in sorted(world["txns"], key=lambda t: (t["at"], t["id"])):
        if t["from"] in bal:
            bal[t["from"]] -= t["amount"]
            assert bal[t["from"]] >= 0
            assert t["at"] >= opened[t["from"]]
        if t["to"] in bal:
            bal[t["to"]] += t["amount"]
            assert t["at"] >= opened[t["to"]]


def test_only_the_past_is_visible(made):
    world, _ = made
    assert all(t["at"] <= world["cutoff"] for t in world["txns"])
    assert all(c["reportedAt"] <= world["cutoff"] for c in world["complaints"])


def test_role_mix_is_within_tolerance(made):
    _, truth = made
    c = Counter(truth["roles"].values())
    n = sum(c.values())
    assert 0.02 <= c["mule"] / n <= 0.04
    assert 0.01 <= c["shield"] / n <= 0.03


def test_victims_report_late_or_never(made):
    world, truth = made
    reports = {c["txnId"]: c for c in world["complaints"]}
    rate = truth["stats"]["reportRate"]
    assert 0.4 <= rate <= 0.7
    assert len(reports) < len(truth["victimTxns"])
    txns = {t["id"]: t for t in world["txns"]}
    delays = [(c["reportedAt"] - txns[c["txnId"]]["at"]) / 3_600_000 for c in world["complaints"]]
    assert min(delays) >= 0 and max(delays) <= 72


def test_complaints_point_at_real_victim_payments(made):
    world, truth = made
    for c in world["complaints"]:
        assert truth["victimTxns"][c["txnId"]] == c["victim"]


def test_truth_victim_money_matches_tracing_everything(made):
    world, truth = made
    r = trace({a["id"]: a["opening"] for a in world["accounts"]}, world["txns"], truth["victimTxns"], as_of=world["cutoff"])
    assert truth["victimMoneyAtCutoff"] == {a: v["tainted"] for a, v in r.items() if v["tainted"] > 0}


def test_mule_money_drains_faster_than_shop_money(made):
    _, truth = made
    mule = next(a for a, v in truth["victimMoneyAtCutoff"].items() if truth["roles"][a] == "mule")
    shop = max((a for a in truth["victimMoneyAtCutoff"] if truth["roles"][a] == "shield"),
               key=lambda a: truth["victimMoneyAtCutoff"][a])  # biggest, so whole-paise rounding can't hide the curve
    m = remaining_victim_money(truth, mule, 10) / truth["victimMoneyAtCutoff"][mule]
    s = remaining_victim_money(truth, shop, 10) / truth["victimMoneyAtCutoff"][shop]
    assert m < s
    assert remaining_victim_money(truth, mule, 10, drain_ratio=1) / truth["victimMoneyAtCutoff"][mule] == pytest.approx(
        remaining_victim_money(truth, shop, 10, drain_ratio=1) / truth["victimMoneyAtCutoff"][shop], rel=1e-3)


def test_future_inflow_only_reaches_mules(made):
    _, truth = made
    assert truth["futureVictimInflow"], "some campaigns must still be running at the decision moment"
    assert all(truth["roles"][a] == "mule" for a in truth["futureVictimInflow"])


def test_there_is_money_left_to_rescue(made):
    world, truth = made
    share = rescue_share(world, truth)
    assert 0 < share <= 1


def test_world_file_never_names_victims(made):
    """Review fix 5: a real bank sees a remitter account, not a 'victim' label or a campaign number."""
    world, _ = made

    def values(o):
        if isinstance(o, dict):
            for v in o.values():
                yield from values(v)
        elif isinstance(o, list):
            for v in o:
                yield from values(v)
        elif isinstance(o, str):
            yield o
    assert not [v for v in values(world) if "VIC" in v.upper()]
