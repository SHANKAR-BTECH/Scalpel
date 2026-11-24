"""python -m scalpel_grade.v4_run : the pre-registered v4 test (after the lock). Writes out/v4-results.json."""
from __future__ import annotations

import hashlib
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


def model_hash(model) -> str:
    """Fingerprint of the trained mule-score model: every learned number, rounded so it is stable across machines."""
    sc, lr = model.clf.named_steps["standardscaler"], model.clf.named_steps["logisticregression"]
    parts = [sc.mean_, sc.scale_, lr.coef_, lr.intercept_, model.calib.lr.coef_, model.calib.lr.intercept_]
    nums = [round(float(x), 8) for a in parts for x in np.ravel(a)]
    return hashlib.sha256(json.dumps(nums).encode()).hexdigest()


def reliability(model, worlds, bins: int = 10) -> list[dict]:
    """Reliability curve: in each score band, the average score vs the share that really are mules."""
    s_all, y_all = [], []
    for w, t in worlds:
        X = build_features(w, compute_signals(w))
        if X.empty:
            continue
        s_all.append(model.mule_score(X))
        y_all.append(np.array([t["roles"][a] == "mule" for a in X.index], dtype=float))
    s, y = np.concatenate(s_all), np.concatenate(y_all)
    out = []
    for i in range(bins):
        lo, hi = i / bins, (i + 1) / bins
        m = (s >= lo) & ((s < hi) if i < bins - 1 else (s <= hi))
        if m.sum():
            out.append({"band": f"{lo:.1f}-{hi:.1f}", "accounts": int(m.sum()),
                        "meanScore": round(float(s[m].mean()), 3), "shareMules": round(float(y[m].mean()), 3)})
    return out


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


def margin_interval(model, cfgs, k: int, n: int = 200, seed: int = 11) -> dict:
    """Bootstrap over accounts holding traced money (pooled over the test worlds): full Scalpel minus the best
    no-model order, in points of the best possible; also the share of the possible gain the full order closes."""
    from .grade import ceiling_order, oracle_order, rescue
    rng = np.random.default_rng(seed)
    per = []
    for c in cfgs:
        w, t = make_world(c)
        X = build_features(w, compute_signals(w))
        held, od = v4.orders(w, dict(zip(X.index, model.mule_score(X))))
        od["ceiling"] = ceiling_order(held, t)
        per.append((w, t, held, od))
    margins, closed = [], []
    for _ in range(n):
        tot = {m: 0.0 for m in ("biggest", "biggestcase", "biggestspeed", "scalpel", "ceiling")}
        best = 0.0
        for w, t, held, od in per:
            accts = sorted(held)
            pick = rng.choice(len(accts), size=len(accts), replace=True)
            # duplicates become separate copies so the resample keeps its size
            hb = {f"{accts[i]}#{j}": held[accts[i]] for j, i in enumerate(pick)}
            tb = dict(t, victimMoneyAtCutoff={**t["victimMoneyAtCutoff"], **{a: t["victimMoneyAtCutoff"].get(a.split("#")[0], 0) for a in hb}},
                      drainPerHour={**t["drainPerHour"], **{a: t["drainPerHour"][a.split("#")[0]] for a in hb if a.split("#")[0] in t["drainPerHour"]}},
                      settle={**t["settle"], **{a: t["settle"][a.split("#")[0]] for a in hb if a.split("#")[0] in t["settle"]}})
            pos = {a: i for i, a in enumerate(accts)}
            best += rescue(oracle_order(hb, tb, k), hb, tb, k)
            for m in tot:
                rank = {a: r for r, a in enumerate(od[m])}
                order = sorted(hb, key=lambda a: (rank[a.split("#")[0]], a))
                tot[m] += rescue(order, hb, tb, k)
            _ = pos
        pct = {m: 100 * v / best for m, v in tot.items()}
        nm = max(pct["biggest"], pct["biggestcase"], pct["biggestspeed"])
        margins.append(pct["scalpel"] - nm)
        closed.append((pct["scalpel"] - nm) / (pct["ceiling"] - nm) if pct["ceiling"] > nm else 0.0)
    q = lambda xs: [round(float(np.percentile(xs, 5)), 2), round(float(np.percentile(xs, 95)), 2)]
    return {"marginInterval90": q(margins), "gapClosedInterval90": q(closed), "resamples": n}


def main() -> None:
    lock = json.loads((Path(C.__file__).with_suffix(".lock")).read_text())
    assert lock["fingerprint"] == C.fingerprint(), "settings changed after the lock"
    train = [make_world(C.v4_config(C.V4_TRAIN_SEED, n)) for n in ("high", "low")]
    model = train_models(train)["logistic"]
    # Added AFTER the lock: the model is fixed by the locked training seed; its hash is recorded once and then
    # checked on every rerun, so the model can't change silently.
    mh, hfile = model_hash(model), Path(C.__file__).with_suffix(".model-hash")
    if hfile.exists():
        assert hfile.read_text().strip() == mh, "mule-score model changed since its hash was recorded"
    else:
        hfile.write_text(mh + "\n")
    res = {"lockPassable": lock["passable"], "meanCeilingGapDev": lock["meanCeilingGapPoints"], "modelHash": mh}
    for label, over in [("headline", {}), ("noSpeedHint", {"dwell_pro": (2, 240), "dwell_rented": (2, 240)}),
                        ("direct15", {"direct_merchant_share": 0.15}), ("direct25", {"direct_merchant_share": 0.25}),
                        # Added after the lock: 0% sweeps (no shops at all; no current-account mules)
                        ("noShops", {"direct_merchant_share": 0.0, "merchant_buy_prob": 0.0}),
                        ("noCurrent", {"mule_current_share": 0.0})]:
        for noise in (("high", "low") if label == "headline" else ("high",)):
            r, worlds = run_set(model, [C.v4_config(s, noise, **over) for s in C.V4_SEEDS])
            res[f"{label}/{noise}"] = r
            if label == "headline":
                res[f"brier/{noise}"] = round(brier(model, worlds), 4)
                res[f"reliability/{noise}"] = reliability(model, worlds)
                base = np.mean([np.mean([t["roles"][a] == "mule" for a in build_features(w, compute_signals(w)).index]) for w, t in worlds])
                res[f"brierBaseline/{noise}"] = round(float(base * (1 - base)), 4)
    # Added AFTER the lock (no setting changed): a 90% interval for the headline margin, by resampling accounts.
    res["afterLock"] = margin_interval(model, [C.v4_config(s, "high") for s in C.V4_SEEDS], C.HEADLINE["k"])
    h = res["headline/high"][str(C.HEADLINE["k"])]
    best_nm = max(h[n] for n in C.NO_MODEL_RULES)
    res["verdict"] = C.verdict(h["scalpel"], best_nm)
    res["marginPoints"] = round(h["scalpel"] - best_nm, 2)
    OUT.mkdir(exist_ok=True)
    (OUT / "v4-results.json").write_text(json.dumps(res, indent=1) + "\n")
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
