"""World v4 "fair test": pre-lock checks on practice worlds, and the pre-registered comparison of orders.

All orders here use only what the bank can see (world.json + the model's scores), except 'ceiling' and 'oracle',
which use the hidden answers. The no-model orders and score-only order repeat sim-runner/queue.ts in Python
(a test checks they agree on biggest and score-only).
"""
from __future__ import annotations

import math

from scalpel_model.features import build_features, traced_accounts
from scalpel_sim.signals import compute_signals
from scalpel_sim.tracing import trace

from .grade import ceiling_order, oracle_order, rescue

MULE_DRAIN, SHOP_DRAIN = 0.15, 0.03  # queue.ts planning assumptions (score-only order)


def speed_from_dwell(dwell_min: float) -> float:
    """Pre-registered: rate = clamp(ln2 / (4 x dwell_hours), 0.03, 0.40)."""
    h = max(dwell_min, 1.0) / 60
    return min(0.40, max(0.03, math.log(2) / (4 * h)))


def case_totals(world: dict) -> dict[str, int]:
    """Same as queue.ts caseTotals: a case = complaints whose victims paid the same first account."""
    c = world["cutoff"]
    txn = {t["id"]: t for t in world["txns"]}
    comps = [x for x in world["complaints"] if x["reportedAt"] <= c and x["txnId"] in txn]
    parent: dict[str, str] = {}

    def find(x):
        while parent.get(x, x) != x:
            x = parent[x]
        return x

    for x in comps:
        a, b = find("c:" + x["id"]), find("a:" + txn[x["txnId"]]["to"])
        if a != b:
            parent[max(a, b)] = min(a, b)
    case_of = {x["victim"]: find("c:" + x["id"]) for x in comps}
    reported = {x["txnId"]: x["victim"] for x in comps}
    r = trace({a["id"]: a["opening"] for a in world["accounts"]}, world["txns"], reported, as_of=c)
    total: dict[str, int] = {}
    main: dict[str, str] = {}
    for acct, v in r.items():
        per: dict[str, int] = {}
        for vic, p in v["taint"].items():
            k = case_of.get(vic, "victim:" + vic)
            per[k] = per.get(k, 0) + p
            total[k] = total.get(k, 0) + p
        if per:
            main[acct] = sorted(per.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    return {a: total[k] for a, k in main.items()}


def orders(world: dict, scores: dict[str, float] | None) -> tuple[dict[str, int], dict[str, list[str]]]:
    held = traced_accounts(world)
    X = build_features(world, compute_signals(world))
    speed = {a: speed_from_dwell(X.loc[a, "dwell_median_min"]) for a in held}
    case = case_totals(world)
    srt = lambda key: sorted(held, key=lambda a: (*key(a), a))
    out = {
        "biggest": srt(lambda a: (-held[a],)),
        "biggestcase": srt(lambda a: (-case.get(a, held[a]), -held[a])),
        "biggestspeed": srt(lambda a: (-held[a] * speed[a], -held[a])),
    }
    if scores is not None:
        s = lambda a: scores.get(a, 0.0)
        out["scoreonly"] = srt(lambda a: (-held[a] * (s(a) * MULE_DRAIN + (1 - s(a)) * SHOP_DRAIN), -held[a]))
        out["scalpel"] = srt(lambda a: (-held[a] * (s(a) * speed[a] + (1 - s(a)) * SHOP_DRAIN), -held[a]))
    return held, out


def compare(world: dict, truth: dict, scores: dict[str, float] | None, k: int = 10) -> dict[str, float]:
    held, od = orders(world, scores)
    best = rescue(oracle_order(held, truth, k), held, truth, k)
    res = {n: 100 * rescue(o, held, truth, k) / best for n, o in od.items()}
    res["ceiling"] = 100 * rescue(ceiling_order(held, truth), held, truth, k) / best
    res["_oracle"] = best
    return res


def _auc(x, y) -> float:
    from sklearn.metrics import roc_auc_score
    a = roc_auc_score(y, x)
    return max(a, 1 - a)


def leak_checks(world: dict, truth: dict) -> dict:
    """How much a single clue (or the amount alone) gives the mules away, on accounts holding traced money."""
    held = traced_accounts(world)
    X = build_features(world, compute_signals(world))
    y = [truth["roles"][a] == "mule" for a in X.index]
    feats = {c: _auc(X[c].values, y) for c in X.columns if X[c].nunique() > 1}
    amount = _auc([held[a] for a in X.index], y)
    # Reported money held directly (first hop) by people who are not mules, by money.
    c = world["cutoff"]
    txn = {t["id"]: t for t in world["txns"]}
    direct = [txn[x["txnId"]] for x in world["complaints"] if x["reportedAt"] <= c and x["txnId"] in txn]
    tot = sum(t["amount"] for t in direct)
    innocent = sum(t["amount"] for t in direct if truth["roles"].get(t["to"]) != "mule")
    return {"maxClue": max(feats.items(), key=lambda kv: kv[1]), "amountAuc": amount,
            "innocentDirectShare": innocent / tot if tot else 0.0, "clues": feats}
