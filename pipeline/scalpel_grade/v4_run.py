"""python -m scalpel_grade.v4_run : the pre-registered v4 test (after the lock). Writes out/v4-results.json."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from scalpel_model.features import build_features
from scalpel_model.train import train_models
from scalpel_sim.configs import v4_fair as C
from scalpel_sim.signals import compute_signals
from scalpel_sim.world import make_world

from . import v4

OUT = Path(__file__).resolve().parents[1] / "out"
LADDER = ["biggest", "biggestcase", "biggestspeed", "scoreonly", "scalpel", "ceiling"]


def brier(model, worlds) -> float:
    errs = []
    for w, t in worlds:
        X = build_features(w, compute_signals(w))
        if X.empty:
            continue
        s = model.mule_score(X)
        y = np.array([t["roles"][a] == "mule" for a in X.index], dtype=float)
        errs.append((s - y) ** 2)
    return float(np.concatenate(errs).mean())


def run_set(model, cfgs, ks=(2, 5, 10)) -> dict:
    worlds = [make_world(c) for c in cfgs]
    out = {}
    for k in ks:
        tot = {n: 0.0 for n in LADDER}
        best = 0
        for w, t in worlds:
            X = build_features(w, compute_signals(w))
            scores = dict(zip(X.index, model.mule_score(X))) if not X.empty else {}
            r = v4.compare(w, t, scores, k)
            for n in LADDER:
                tot[n] += r[n] * r["_oracle"]   # pool by money: % of the pooled best possible
            best += r["_oracle"]
        out[str(k)] = {n: round(tot[n] / best, 2) for n in LADDER}
    return out, worlds


def main() -> None:
    lock = json.loads((Path(C.__file__).with_suffix(".lock")).read_text())
    assert lock["fingerprint"] == C.fingerprint(), "settings changed after the lock"
    train = [make_world(C.v4_config(C.V4_TRAIN_SEED, n)) for n in ("high", "low")]
    model = train_models(train)["logistic"]
    res = {"lockPassable": lock["passable"], "meanCeilingGapDev": lock["meanCeilingGapPoints"]}
    for label, over in [("headline", {}), ("noSpeedHint", {"dwell_pro": (2, 240), "dwell_rented": (2, 240)}),
                        ("direct15", {"direct_merchant_share": 0.15}), ("direct25", {"direct_merchant_share": 0.25})]:
        for noise in (("high", "low") if label == "headline" else ("high",)):
            r, worlds = run_set(model, [C.v4_config(s, noise, **over) for s in C.V4_SEEDS])
            res[f"{label}/{noise}"] = r
            if label == "headline":
                res[f"brier/{noise}"] = round(brier(model, worlds), 4)
                base = np.mean([np.mean([t["roles"][a] == "mule" for a in build_features(w, compute_signals(w)).index]) for w, t in worlds])
                res[f"brierBaseline/{noise}"] = round(float(base * (1 - base)), 4)
    h = res["headline/high"][str(C.HEADLINE["k"])]
    best_nm = max(h[n] for n in C.NO_MODEL_RULES)
    res["verdict"] = C.verdict(h["scalpel"], best_nm)
    res["marginPoints"] = round(h["scalpel"] - best_nm, 2)
    OUT.mkdir(exist_ok=True)
    (OUT / "v4-results.json").write_text(json.dumps(res, indent=1) + "\n")
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
