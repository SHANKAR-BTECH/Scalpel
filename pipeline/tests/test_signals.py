import re
from pathlib import Path

import pytest

from scalpel_sim.config import v1_config
from scalpel_sim.signals import compute_signals, SIGNAL_NAMES
from scalpel_sim.world import make_world, DAY, HOUR, MIN

ENGINE_GATE = Path(__file__).resolve().parents[2] / "packages" / "engine" / "src" / "gate.ts"
C = 1_800_000_000_000


def mini(accounts=None, txns=None, complaints=None, phones=None, telecom=None):
    return {"cutoff": C, "accounts": accounts or [], "txns": txns or [], "complaints": complaints or [],
            "phones": phones or [], "telecom": telecom or {}}


def acct(i, age_days=400, kyc=None):
    return {"id": i, "type": "SAVINGS", "openedAt": C - age_days * DAY, "kycChangedAt": kyc, "opening": 0}


def test_signal_names_match_the_engine_exactly():
    text = ENGINE_GATE.read_text()
    names = re.findall(r'"([A-Z0-9_]+)"', text[text.index("BANK_SIGNALS"):text.index("export type Signal")])
    assert sorted(names) == sorted(SIGNAL_NAMES)


def test_account_age_edge():
    s = compute_signals(mini([acct("A1", 10), acct("A2", 40)]))
    assert "ACCOUNT_AGE_LT_30D" in s["A1"] and "ACCOUNT_AGE_LT_30D" not in s["A2"]


def test_kyc_change_edge():
    s = compute_signals(mini([acct("A1", kyc=C - 5 * DAY), acct("A2", kyc=C - 45 * DAY)]))
    assert "KYC_CHANGED_LT_30D" in s["A1"] and "KYC_CHANGED_LT_30D" not in s["A2"]


def test_dwell_edge():
    t = lambda i, at, f, to: {"id": i, "at": at, "from": f, "to": to, "amount": 10_000_00, "channel": "UPI"}
    w = mini([acct("A1"), acct("A2")], [
        t("t1", C - 5 * HOUR, "EXT", "A1"), t("t2", C - 5 * HOUR + 14 * MIN, "A1", "EXT-ATM"),
        t("t3", C - 5 * HOUR, "EXT", "A2"), t("t4", C - 5 * HOUR + 20 * MIN, "A2", "EXT-ATM")])
    s = compute_signals(w)
    assert "DWELL_LT_15M" in s["A1"] and "DWELL_LT_15M" not in s["A2"]


def test_three_reported_victims_needed():
    t = lambda i, to: {"id": i, "at": C - HOUR, "from": f"EXT-{i}", "to": to, "amount": 100, "channel": "UPI"}
    txns = [t(f"a{i}", "A1") for i in range(3)] + [t(f"b{i}", "A2") for i in range(3)]
    complaints = [{"id": f"c{i}", "victim": f"V{i}", "txnId": f"a{i}", "reportedAt": C - 1} for i in range(3)]
    complaints += [{"id": f"d{i}", "victim": f"W{i}", "txnId": f"b{i}", "reportedAt": C - 1} for i in range(2)]
    s = compute_signals(mini([acct("A1"), acct("A2")], txns, complaints))
    assert "GE3_CASE_LINKED_SENDERS" in s["A1"] and "GE3_CASE_LINKED_SENDERS" not in s["A2"]


def test_sim_swap_only_counts_before_the_decision_moment():
    phones = [{"account": "A1", "msisdn": "+91 01234 56789", "imei": "001"}, {"account": "A2", "msisdn": "+91 09876 54321", "imei": "002"}]
    tel = {"simSwaps": [{"msisdn": "+91 01234 56789", "at": C - 10 * HOUR}, {"msisdn": "+91 09876 54321", "at": C + HOUR}]}
    s = compute_signals(mini([acct("A1"), acct("A2")], phones=phones, telecom=tel))
    assert "SIM_SWAP_LT_72H" in s["A1"] and "SIM_SWAP_LT_72H" not in s["A2"]


def test_handset_with_more_than_five_sims():
    phones = [{"account": f"A{i}", "msisdn": f"+91 0000{i} 00000", "imei": "00X" if i < 6 else f"00{i}"} for i in range(8)]
    s = compute_signals(mini([acct(f"A{i}") for i in range(8)], phones=phones))
    assert "HANDSET_GT5_SIMS" in s["A0"] and "HANDSET_GT5_SIMS" not in s["A7"]


def test_signals_code_never_reads_the_answers():
    src = (Path(__file__).resolve().parents[1] / "scalpel_sim" / "signals.py").read_text()
    assert "truth" not in src.lower()


@pytest.fixture(scope="module")
def v1small():
    return make_world(v1_config().scaled(0.4))


def test_fake_identifiers_only(v1small):
    world, _ = v1small
    assert world["phones"]
    for p in world["phones"]:
        assert re.fullmatch(r"\+91 0\d{4} \d{5}", p["msisdn"]), p
        assert p["imei"].startswith("00") and len(p["imei"]) == 15


@pytest.mark.parametrize("noise", ["low", "high"])
def test_signals_are_noisy(noise):
    from dataclasses import replace
    world, truth = make_world(replace(v1_config().scaled(0.4), signal_noise=noise))
    s = compute_signals(world)
    roles = truth["roles"]
    mules = [a for a, r in roles.items() if r == "mule"]
    normals = [a for a, r in roles.items() if r == "normal"]
    assert sum(len(s[a]) <= 1 for a in mules) / len(mules) >= 0.10
    assert sum(len(s[a]) >= 1 for a in normals) / len(normals) >= 0.02
