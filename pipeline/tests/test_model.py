from pathlib import Path

import numpy as np
import pytest

from scalpel_sim.config import v1_config
from scalpel_sim.export import FORBIDDEN_KEYS
from scalpel_sim.signals import compute_signals
from scalpel_sim.world import make_world, DAY, HOUR, MIN
from scalpel_model.features import build_features, FEATURES
from scalpel_model.train import train_models, assess
from scalpel_model.reasons import reasons_for

PKG = Path(__file__).resolve().parents[1] / "scalpel_model"


@pytest.fixture(scope="module")
def trained():
    worlds = [make_world(v1_config().scaled(0.4).with_seed(s)) for s in (11, 12)]
    return worlds, train_models(worlds, seed=7)


def test_feature_table_has_no_answers_and_code_never_opens_truth():
    world, _ = make_world(v1_config().scaled(0.2))
    X = build_features(world, compute_signals(world))
    assert not {c.lower() for c in X.columns} & FORBIDDEN_KEYS
    assert list(X.columns) == FEATURES
    assert "truth" not in (PKG / "features.py").read_text().lower()


def test_only_accounts_holding_traced_money_are_scored():
    world, _ = make_world(v1_config().scaled(0.2))
    X = build_features(world, compute_signals(world))
    assert 0 < len(X) < len(world["accounts"])


def test_features_ignore_anything_after_the_decision_moment():
    world, _ = make_world(v1_config().scaled(0.2))
    s = compute_signals(world)
    X1 = build_features(world, s)
    a = X1.index[0]
    late = {"id": "LATE", "at": world["cutoff"] + HOUR, "from": "EXT-X", "to": a, "amount": 999_999_00, "channel": "UPI"}
    world2 = dict(world, txns=world["txns"] + [late])
    X2 = build_features(world2, s)
    assert X1.loc[a].equals(X2.loc[a])


def test_scores_are_probabilities(trained):
    worlds, models = trained
    out = assess(models["logistic"], worlds[0][0])
    for v in out["accounts"].values():
        assert 0 <= v["muleScore"] <= 1
        assert abs(sum(v["probs"].values()) - 1) < 1e-6


def test_exactly_three_plain_reasons(trained):
    worlds, models = trained
    for name in ("logistic", "lightgbm"):
        out = assess(models[name], worlds[0][0])
        for v in out["accounts"].values():
            assert len(v["reasons"]) == 3
            assert all(r and "_" not in r for r in v["reasons"])


def test_same_seed_same_scores():
    worlds = [make_world(v1_config().scaled(0.3).with_seed(s)) for s in (21,)]
    a = assess(train_models(worlds, seed=3)["logistic"], worlds[0][0])
    b = assess(train_models(worlds, seed=3)["logistic"], worlds[0][0])
    assert a == b


def test_textbook_mule_scores_high(trained):
    worlds, models = trained
    X = build_features(worlds[0][0], compute_signals(worlds[0][0]))
    row = X.iloc[[0]].copy()
    row[:] = 0
    row["age_days"] = 6
    row["dwell_median_min"] = 4
    row["reported_senders"] = 5
    row["share_in_reported"] = 0.9
    row["share_out_exits"] = 0.8
    row["sign_count"] = 4
    row["sim_swap"] = 1
    for name in ("logistic", "lightgbm"):
        raw, calibrated = models[name].proba(row)[0][0], models[name].mule_score(row)[0]
        assert raw > 0.9, (name, raw)
        assert calibrated >= 0.5, (name, calibrated)  # lookalike innocents in the unseen world keep this honest


def test_reason_text_for_fast_money():
    r = reasons_for({"dwell_median_min": 4.0}, {"dwell_median_min": 2.5}, k=1)
    assert r == ["Money left within 4 minutes of arriving"]


def test_write_assessments_puts_three_files_in_each_world_folder(tmp_path, trained):
    from scalpel_sim.export import write_world, read_json
    from scalpel_model.train import write_assessments
    worlds, models = trained
    write_world(tmp_path / "w1", *worlds[1])
    written = write_assessments(tmp_path, models, primary="logistic")
    folder = tmp_path / "w1" / "world"
    names = sorted(p.name for p in folder.glob("assessments*.json"))
    assert names == ["assessments-lightgbm.json", "assessments-logistic.json", "assessments.json"]
    assert read_json(folder / "assessments.json")["model"] == "logistic"
    assert written == [folder]
    assert not (tmp_path / "w1" / "truth" / "assessments.json").exists()


def test_fast_moving_money_alone_does_not_give_the_answer():
    """Real shops sweep takings daily and many people pass salary on quickly, so speed alone must not separate mules."""
    from sklearn.metrics import roc_auc_score
    world, truth = make_world(v1_config().scaled(0.4).with_seed(31))
    X = build_features(world, compute_signals(world))
    is_mule = [truth["roles"][a] == "mule" for a in X.index]
    fast_innocent = [(d < 240) and not m for d, m in zip(X["dwell_median_min"], is_mule)]
    assert sum(fast_innocent) >= 0.1 * (len(X) - sum(is_mule))
    assert roc_auc_score(is_mule, -X["dwell_median_min"]) < 0.98


def test_check_score_uses_a_whole_unseen_world(trained):
    _, models = trained
    assert models["logistic"].holdout_world == "v1-12"


def test_reason_wording_for_one_and_zero():
    assert reasons_for({"senders": 1.0}, {"senders": 1.0}, k=1) == ["All the money came from one sender"]
    assert reasons_for({"sign_count": 0.0}, {"sign_count": -1.0}, k=1) == ["No warning signs"]
