import json

from scalpel_sim.tiny import make_tiny
from scalpel_sim.export import write_world, FORBIDDEN_KEYS
from scalpel_sim.tracing import trace


def all_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from all_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_keys(v)


def test_same_seed_same_world_and_different_seed_differs():
    a, _ = make_tiny(seed=1)
    b, _ = make_tiny(seed=1)
    c, _ = make_tiny(seed=2)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert json.dumps(a, sort_keys=True) != json.dumps(c, sort_keys=True)


def test_world_has_no_answers_in_it():
    world, _ = make_tiny(seed=1)
    keys = {k.lower() for k in all_keys(world)}
    assert not keys & FORBIDDEN_KEYS


def test_world_is_tiny_and_only_shows_the_past():
    world, _ = make_tiny(seed=1)
    assert 40 <= len(world["accounts"]) <= 60
    assert all(t["at"] <= world["cutoff"] for t in world["txns"])
    assert all(c["reportedAt"] <= world["cutoff"] for c in world["complaints"])


def test_no_visible_balance_ever_goes_negative():
    world, _ = make_tiny(seed=1)
    bal = {a["id"]: a["opening"] for a in world["accounts"]}
    for t in sorted(world["txns"], key=lambda t: (t["at"], t["id"])):
        if t["from"] in bal:
            bal[t["from"]] -= t["amount"]
            assert bal[t["from"]] >= 0, t
        if t["to"] in bal:
            bal[t["to"]] += t["amount"]


def test_complaints_point_at_real_payments_into_bank_accounts():
    world, _ = make_tiny(seed=1)
    txns = {t["id"]: t for t in world["txns"]}
    ids = {a["id"] for a in world["accounts"]}
    assert world["complaints"], "tiny world needs at least one complaint"
    for c in world["complaints"]:
        assert txns[c["txnId"]]["to"] in ids


def test_some_victims_never_report():
    world, truth = make_tiny(seed=1)
    assert len(world["complaints"]) < len(truth["victimTxns"])


def test_truth_victim_money_matches_tracing_all_victims():
    world, truth = make_tiny(seed=1)
    opening = {a["id"]: a["opening"] for a in world["accounts"]}
    r = trace(opening, world["txns"], truth["victimTxns"], as_of=world["cutoff"])
    assert truth["victimMoneyAtCutoff"] == {a: v["tainted"] for a, v in r.items() if v["tainted"] > 0}


def test_write_world_keeps_truth_in_its_own_folder(tmp_path):
    world, truth = make_tiny(seed=1)
    write_world(tmp_path / "tiny", world, truth)
    assert (tmp_path / "tiny" / "world" / "world.json").exists()
    assert (tmp_path / "tiny" / "truth" / "truth.json").exists()
    assert not any("truth" in p.name for p in (tmp_path / "tiny" / "world").iterdir())


def test_checked_in_fixture_matches_generator():
    """The TypeScript runner tests read this fixture, so both languages share one contract."""
    from pathlib import Path
    from scalpel_sim.export import read_json
    world, truth = make_tiny(seed=1)
    here = Path(__file__).parent / "fixtures" / "tiny"
    assert read_json(here / "world" / "world.json") == world
    assert read_json(here / "truth" / "truth.json") == truth
