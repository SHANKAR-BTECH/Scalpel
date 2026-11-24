"""World v4 "fair test": a world where knowing who is a mule, and how fast it moves money, can really help.

Written BEFORE any v4 test world exists. Settings may be changed only on the practice (dev) seeds, at most twice,
each change recorded in CHANGES below; then the lock file configs/v4_fair.lock is written and only after that the
test seeds are built and graded. The result is reported whatever it is. Plan: scalpel-plan/PART-C-PLAN.md.

Every share and rate below is OUR ASSUMPTION (no published Indian figure exists for any of them):
- direct_merchant_share: victims told to pay a real shop for goods the fraudster collects. Real cases mostly show
  shops getting money second-hand (Malabar Gold, Telangana QR shops), so the headline is small (5%).
- merchant_buy_prob / pct: a mule buys gold or phones from a real shop with part of the money (second-hand route).
- mule_current_share: rented firm accounts / shop QR used as mules (I4C alert on illegal payment gateways).
- speed_pro / speed_rented: share of a mule's money that leaves each hour. Police speak of a 1-3 hour "golden hour";
  no data on spread exists.
- dwell_pro / dwell_rented: minutes before a mule passes money on, before the decision moment (overlapping ranges,
  so past speed is only a rough hint of future speed).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, replace

from .v2 import _V2

V4_TRAIN_SEED = 400
V4_DEV_SEEDS = (490, 491, 492, 493, 494)
V4_SEEDS = (401, 402, 403)

FAIR = {"v4": {
    "direct_merchant_share": 0.05,
    "merchant_buy_prob": 0.30,
    "merchant_buy_pct": (30, 70),
    "mule_current_share": 0.20,
    "speed_pro": (0.20, 0.40),
    "speed_rented": (0.03, 0.10),
    "dwell_pro": (2, 90),
    "dwell_rented": (30, 240),
    "normal_drain": 0.02,
    "instant_shop_drain": 0.05,
}}

_V4 = replace(_V2, name="v4", id_prefix="F", seed=V4_SEEDS[0], extra=FAIR)

# Pre-registered grading.
SPEED_FORMULA = "rate = clamp(ln2 / (4 x dwell_hours), 0.03, 0.40); dwell = the account's median minutes before passing money on"
NO_MODEL_RULES = ("biggest", "biggestcase", "biggestspeed")
HEADLINE = {"noise": "high", "k": 10, "pooled_over": "seeds 401-403"}
PASS_MARK_POINTS = 2.0      # full Scalpel must beat the best no-model order by >= 2 points of the best possible
PASSABLE_POINTS = 4.0       # pre-lock check: perfect knowledge must beat the best no-model order by >= 4 points
CHANGES: list[str] = []     # settings changed on dev seeds before the lock (max 2), in order


def v4_config(seed: int = V4_SEEDS[0], noise: str = "high", **over):
    cfg = replace(_V4, seed=seed, name="v4" if noise == "low" else "v4noisy", signal_noise=noise)
    if over:
        cfg = replace(cfg, extra={"v4": {**FAIR["v4"], **over}})
    return cfg


def verdict(scalpel_pct: float, best_no_model_pct: float) -> str:
    return "earned" if scalpel_pct - best_no_model_pct >= PASS_MARK_POINTS else "not earned"


def fingerprint() -> str:
    data = {"config": asdict(_V4), "seeds": list(V4_SEEDS), "train": V4_TRAIN_SEED, "dev": list(V4_DEV_SEEDS),
            "speed": SPEED_FORMULA, "rules": list(NO_MODEL_RULES), "headline": HEADLINE, "pass": PASS_MARK_POINTS,
            "passable": PASSABLE_POINTS, "changes": CHANGES}
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
