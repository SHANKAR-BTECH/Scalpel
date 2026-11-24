"""The demo export: the only bridge from the hidden answers to the website. Totals and series only."""
import json

import pytest

from scalpel_grade.demo_export import (
    LANES, HOURS, build_demo, missed_buckets, order_curves, replay_series, rescue_curve,
)
from scalpel_grade.grade import oracle_order, rescue
from scalpel_sim.export import read_json
from pathlib import Path

PIPE = Path(__file__).resolve().parents[1]
DEMO = PIPE / "demo"


@pytest.fixture(scope="module")
def demo():
    truth = read_json(DEMO / "truth" / "truth.json")
    q = read_json(DEMO / "decisions" / "queues-logistic.json")
    rows = {p: read_json(DEMO / "decisions" / f"{p}.json")["rows"] for p in ("0", "A", "C")}
    return truth, q, rows


def test_rescue_curve_ends_at_rescue(demo):
    truth, q, _ = demo
    for name, order in q["orders"].items():
        c = rescue_curve(order, q["held"], truth, 10)
        assert c[-1] == rescue(order, q["held"], truth, 10)
        assert all(b >= a for a, b in zip(c, c[1:]))


def test_replay_series_shapes_and_monotone(demo):
    truth, q, rows = demo
    for lane, (policy, order) in LANES(q).items():
        s = replay_series(rows[policy], order, truth, 10, HOURS)
        for k, v in s.items():
            assert len(v) == HOURS + 1, (lane, k)
            assert all(b >= a for a, b in zip(v, v[1:])), (lane, k)


def test_money_keeps_leaving_when_nobody_acts(demo):
    truth, q, rows = demo
    s = replay_series(rows["0"], q["orders"]["biggest"], truth, 10, HOURS)
    assert s["victimMoneyGonePaise"][0] == 0 and s["victimMoneyGonePaise"][-1] > 0
    sc = replay_series(rows["C"], q["orders"]["scalpel"], truth, 10, HOURS)
    assert sc["victimMoneyGonePaise"][-1] < s["victimMoneyGonePaise"][-1]


def test_do_nothing_secures_nothing(demo):
    truth, q, rows = demo
    s = replay_series(rows["0"], q["orders"]["biggest"], truth, 10, HOURS)
    assert set(s["securedPaise"]) == {0} and set(s["innocentLockedPaise"]) == {0}


def test_exact_hold_lanes_end_where_rescue_ends(demo):
    truth, q, rows = demo
    for name in ("biggest", "scalpel"):
        s = replay_series(rows["C"], q["orders"][name], truth, 10, HOURS)
        assert s["securedPaise"][-1] == rescue(q["orders"][name], q["held"], truth, 10)


def test_whole_freeze_locks_innocent_money_exact_holds_do_not_here(demo):
    truth, q, rows = demo
    axe = replay_series(rows["A"], q["orders"]["biggest"], truth, 10, HOURS)
    sc = replay_series(rows["C"], q["orders"]["scalpel"], truth, 10, HOURS)
    assert axe["innocentLockedPaise"][-1] > sc["innocentLockedPaise"][-1]


def test_missed_buckets_add_up_exactly_for_every_lane(demo):
    truth, q, rows = demo
    total = sum(truth["victimMoneyAtCutoff"].values())
    for lane, (policy, order) in LANES(q).items():
        b = missed_buckets(rows[policy], order, truth, 10, HOURS)
        assert sum(b.values()) == total, lane
        assert all(v >= 0 for v in b.values()), lane


def test_order_curves_band_and_oracle_is_best():
    worlds = sorted((PIPE / "out").glob("v2-s*"))
    if not worlds:
        pytest.skip("run python -m scalpel_sim.all first")
    oc = order_curves(worlds, ks=(10,))
    c = oc["10"]
    for name in ("fcfs", "biggest", "signrule", "scalpel"):
        assert len(c[name]["mean"]) == len(c["oracle"]["mean"])
        assert c[name]["mean"][-1] <= c["oracle"]["mean"][-1] + 1e-9
        assert c[name]["x"] == c["oracle"]["x"] and c[name]["x"][0] == 1
        assert all(lo <= m + 1e-9 and m <= hi + 1e-9 for lo, m, hi in zip(c[name]["min"], c[name]["mean"], c[name]["max"]))
    assert abs(c["oracle"]["mean"][-1] - 100.0) < 1e-6


def test_built_demo_has_no_roles_and_ids_only_in_memo_and_worst():
    d = build_demo(PIPE)
    text = json.dumps({k: v for k, v in d.items() if k not in ("memo", "worst")})
    assert '"role"' not in text and "mule" not in json.dumps(d.get("replay", {}))
    for prefix in ("D0", "B0", "A0"):
        assert f'"{prefix}' not in text
    assert d["schema"] == "scalpel-demo/3"
    assert len(d["provenance"]["demoSha256"]) == 0  # filled when written to disk
