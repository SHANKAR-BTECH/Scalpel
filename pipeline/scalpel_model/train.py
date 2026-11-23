"""Train the AI on world v1 and score any world.

Two models: logistic regression first (simple; its weights explain themselves), then LightGBM.
Training reads v1's answers (it must, to learn). The models never see v2's answers.

python -m scalpel_model.train   (trains on v1 seeds, writes assessments into every world folder)
"""
from __future__ import annotations

import random
from dataclasses import dataclass

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from scalpel_sim.signals import compute_signals
from .features import FEATURES, build_features
from .reasons import reasons_for

CLASSES = ["mule", "normal", "shield"]


class Calibrator:
    """Platt scaling: a smooth, strictly increasing curve from raw mule probability to calibrated score.

    Replaced isotonic regression (review fix): fitted on a near-separable world, isotonic became a step function
    that gave many real mules exactly 0 and erased the model's ranking. A smooth curve keeps the order.
    """

    def __init__(self):
        self.lr = LogisticRegression(C=1.0)

    @staticmethod
    def _logit(p):
        p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p)).reshape(-1, 1)

    def fit(self, raw, y):
        self.lr.fit(self._logit(raw), y)
        return self

    def predict(self, raw):
        return self.lr.predict_proba(self._logit(raw))[:, 1]
TOO_EASY_AUC = 0.98


@dataclass
class Model:
    name: str
    clf: object
    calib: Calibrator
    means: pd.Series
    holdout_auc: float
    holdout_world: str = ""

    def proba(self, X: pd.DataFrame) -> np.ndarray:
        p = self.clf.predict_proba(X[FEATURES])
        order = [list(self.clf.classes_).index(c) for c in CLASSES]
        return p[:, order]

    def mule_score(self, X: pd.DataFrame) -> np.ndarray:
        return np.clip(self.calib.predict(self.proba(X)[:, 0]), 0.0, 1.0)

    def contributions(self, X: pd.DataFrame) -> np.ndarray:
        """Per-feature push on the MULE class (SHAP for LightGBM; exact linear SHAP for logistic)."""
        if self.name == "logistic":
            scaler, lr = self.clf.named_steps["standardscaler"], self.clf.named_steps["logisticregression"]
            z = (X[FEATURES].to_numpy() - scaler.mean_) / scaler.scale_
            zm = (self.means.to_numpy() - scaler.mean_) / scaler.scale_
            coef = lr.coef_[list(lr.classes_).index("mule")]
            return (z - zm) * coef
        import shap
        sv = shap.TreeExplainer(self.clf).shap_values(X[FEATURES])
        k = list(self.clf.classes_).index("mule")
        if isinstance(sv, list):
            return np.asarray(sv[k])
        sv = np.asarray(sv)
        return sv[:, :, k] if sv.ndim == 3 else sv


def training_table(worlds: list[tuple[dict, dict]]) -> tuple[pd.DataFrame, pd.Series]:
    Xs, ys = [], []
    for world, truth in worlds:
        X = build_features(world, compute_signals(world))
        X.index = [f"{world['name']}-{world['seed']}:{a}" for a in X.index]
        Xs.append(X)
        ys.append(pd.Series([truth["roles"][i.split(":", 1)[1]] for i in X.index], index=X.index))
    return pd.concat(Xs), pd.concat(ys)


def train_models(worlds: list[tuple[dict, dict]], seed: int = 7) -> dict[str, Model]:
    X, y = training_table(worlds)
    idx = list(X.index)
    if len(worlds) > 1:  # check on a whole world the model never trained on (no leakage between halves)
        last = f"{worlds[-1][0]['name']}-{worlds[-1][0]['seed']}:"
        tr, ho = [i for i in idx if not i.startswith(last)], [i for i in idx if i.startswith(last)]
        held = last[:-1]
    else:
        random.Random(seed).shuffle(idx)
        cut = int(len(idx) * 0.8)
        tr, ho = idx[:cut], idx[cut:]
        held = "random 20%"
    models = {}
    for name in ("logistic", "lightgbm"):
        if name == "logistic":
            clf = make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=2000, random_state=seed))
        else:
            clf = LGBMClassifier(n_estimators=150, learning_rate=0.05, num_leaves=15, min_child_samples=10,
                                 class_weight="balanced", random_state=seed, deterministic=True, n_jobs=1, verbose=-1)
        clf.fit(X.loc[tr, FEATURES], y.loc[tr])
        tmp = Model(name, clf, Calibrator(), X.loc[tr, FEATURES].mean(), 0.0)
        raw = tmp.proba(X.loc[ho])[:, 0]
        is_mule = (y.loc[ho] == "mule").astype(int).to_numpy()
        tmp.calib.fit(raw, is_mule)  # straighten the scores bent by class weights
        tmp.holdout_auc = float(roc_auc_score(is_mule, raw)) if 0 < is_mule.sum() < len(is_mule) else float("nan")
        tmp.holdout_world = held
        models[name] = tmp
    return models


def assess(model: Model, world: dict) -> dict:
    X = build_features(world, compute_signals(world))
    if X.empty:
        return {"model": model.name, "accounts": {}}
    P = model.proba(X)
    score = model.mule_score(X)
    contrib = model.contributions(X)
    out = {}
    for i, a in enumerate(X.index):
        vals = X.iloc[i].to_dict()
        reasons = reasons_for(vals, dict(zip(FEATURES, contrib[i])), k=3)
        out[a] = {"role": CLASSES[int(np.argmax(P[i]))], "muleScore": round(float(score[i]), 6),
                  "probs": {c: round(float(P[i][j]), 9) for j, c in enumerate(CLASSES)}, "reasons": reasons}
    return {"model": model.name, "accounts": out}


V1_TRAIN_SEEDS = (101, 102, 103)


def write_assessments(out_root, models: dict[str, Model], primary: str = "logistic") -> list:
    """Score every world folder under out_root (only world.json is read) and write the assessments files."""
    from pathlib import Path
    from scalpel_sim.export import dump_json, read_json
    written = []
    for wj in sorted(Path(out_root).glob("*/world/world.json")):
        world = read_json(wj)
        for name, m in models.items():
            res = assess(m, world)
            dump_json(wj.parent / f"assessments-{name}.json", res)
            if name == primary:
                dump_json(wj.parent / "assessments.json", res)
        written.append(wj.parent)
    return written


def main() -> None:
    import argparse
    from pathlib import Path
    from scalpel_sim.config import v1_config
    from scalpel_sim.world import make_world
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "out"))
    args = ap.parse_args()
    worlds = [make_world(v1_config().with_seed(s)) for s in V1_TRAIN_SEEDS]
    models = train_models(worlds)
    for name, m in models.items():
        flag = "  <-- TOO EASY: check the fake world for leaks" if m.holdout_auc > TOO_EASY_AUC else ""
        print(f"{name}: AUC on unseen world {m.holdout_world} = {m.holdout_auc:.3f}{flag}")
    for folder in write_assessments(args.out, models):
        print(f"wrote assessments -> {folder}")


if __name__ == "__main__":
    main()
