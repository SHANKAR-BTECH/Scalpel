"""The Python truth tracer must agree with the TypeScript engine (phase 1 golden story)."""
from scalpel_sim.tracing import rupees, split_proportional, trace

T0 = 1_797_000_000_000


def tx(i, frm, to, r):
    return {"id": i, "at": T0 + len(i) * 0 + {"v1": 1, "v2": 2, "v3": 3, "h1": 4, "x1": 5}[i] * 60_000,
            "from": frm, "to": to, "amount": rupees(r)}


def test_split_proportional_adds_up_exactly():
    parts = split_proportional(rupees(100.01), {"A": 10_001, "B": 20_002}, 30_003)
    assert sum(parts.values()) == rupees(100.01)


def test_story_matches_engine_golden_numbers():
    r = trace(
        opening={"M1": rupees(20_000), "M2": 0},
        txns=[tx("v1", "VICTIM-A", "M1", 60_000), tx("v2", "VICTIM-B", "M1", 15_000),
              tx("v3", "VICTIM-C", "M1", 5_000), tx("h1", "M1", "M2", 25_000), tx("x1", "M1", "ATM", 37_500)],
        victim_txns={"v1": "A", "v2": "B", "v3": "C"},
    )
    m1 = r["M1"]
    assert m1["balance"] == rupees(37_500)
    assert m1["tainted"] == rupees(30_000)
    assert m1["taint"] == {"A": rupees(22_500), "B": rupees(5_625), "C": rupees(1_875)}
    assert r["M2"]["tainted"] == rupees(20_000)


def test_as_of_ignores_later_payments():
    r = trace(opening={"M1": 0}, txns=[{"id": "v1", "at": 10, "from": "V", "to": "M1", "amount": 500},
                                        {"id": "x", "at": 20, "from": "M1", "to": "ATM", "amount": 500}],
              victim_txns={"v1": "A"}, as_of=15)
    assert r["M1"]["tainted"] == 500
