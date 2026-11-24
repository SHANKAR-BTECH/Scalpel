"""World v3 "split payments": a harder test where amounts mislead. Pre-registered.

Everything below (world settings, seeds, the stronger simple rule, the headline setting and
the pass mark) was written and locked in configs/v3_split.lock BEFORE any v3 world was graded.
The mule-score model is NOT retrained for v3. The result is reported whatever it is.

What changes from v2 (the rest is v2 as locked):
- Each mule passes money on in pieces under Rs 10,000, spread over 3 to 5 next-layer accounts.
  (Rs 10,000 is our assumption, not an Indian figure.)
- Layer 1 cashes out 10 to 30% at an ATM straight away (a "cash-out leak").
- Chains are 4 to 5 layers deep.
- 30% of pieces are "mixed": the mule adds some of its own money, so the reported part sits inside a bigger credit.
- More mule accounts (8% of 3,000) and 14 campaigns, because wide layers need more mules.
- Two noise levels are built. The headline is HIGH noise.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, replace

from .v2 import _V2

V3_SEEDS = (301, 302, 303)

SPLIT = {
    "split_width": (3, 5),           # next-layer accounts per layer after the first
    "piece_rupees": (2_000, 9_999),  # every mule-to-mule piece is under Rs 10,000
    "cashout_leak_l1": (10, 30),     # % cashed out at layer 1 before passing on
    "mixed_share": 0.30,             # share of pieces topped up with the mule's own money
    "mixed_topup_rupees": (500, 3_000),
}

_V3 = replace(_V2, name="v3", id_prefix="S", seed=V3_SEEDS[0], hops=(4, 5), mule_share=0.08, campaigns=14, extra=SPLIT)

# Pre-registered grading (locked with the world).
STRONGER_RULE = "biggestcase"     # accounts in the case (complaint chain) with the most traced money first; ties: own amount
HEADLINE = {"noise": "high", "k": 10, "drain": 5.0, "pooled_over": "seeds 301-303"}
PASS_MARK_POINTS = 2.0            # model's order must beat BOTH biggest and biggestcase by >= 2 points of the best possible


def v3_config(seed: int = V3_SEEDS[0], noise: str = "low"):
    name = "v3" if noise == "low" else "v3noisy"
    return replace(_V3, seed=seed, name=name, signal_noise=noise)


def verdict(scalpel_pct: float, biggest_pct: float, biggestcase_pct: float) -> str:
    """'earned' only if the model's order beats both simple rules by the locked pass mark."""
    margin = scalpel_pct - max(biggest_pct, biggestcase_pct)
    return "earned" if margin >= PASS_MARK_POINTS else "not earned"


def fingerprint() -> str:
    data = {"config": asdict(_V3), "seeds": list(V3_SEEDS), "rule": STRONGER_RULE, "headline": HEADLINE, "pass": PASS_MARK_POINTS}
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
