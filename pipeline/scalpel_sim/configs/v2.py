"""World v2: criminals changed their habits. Built ONLY for the final test.

These settings were written and locked (configs/v2.lock) BEFORE any model was trained.
Changing them afterwards fails CI unless the lock is updated openly in its own commit.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, replace

from ..config import ScamType, WorldConfig

V2_SEEDS = (201, 202, 203, 204, 205)

_V2 = WorldConfig(
    name="v2",
    seed=V2_SEEDS[0],
    id_prefix="B",
    n_accounts=3000,
    campaigns=18,
    shield_share=0.04,                      # about twice as many innocent shops
    scams=(
        ScamType("investment", 0.15, (6, 20), (20_000, 200_000)),
        ScamType("digital_arrest", 0.40, (3, 10), (50_000, 500_000)),
        ScamType("kyc_update", 0.25, (8, 25), (5_000, 60_000)),
        ScamType("part_time_job", 0.20, (8, 25), (2_000, 40_000)),
    ),
    hops=(4, 6),
    mule_old_rented_share=0.60,             # many mules are old "rented" accounts
    mule_dwell_minutes=(20, 90),            # slower mules: money waits before moving on
)


def v2_config(seed: int = V2_SEEDS[0]) -> WorldConfig:
    return replace(_V2, seed=seed)


def fingerprint() -> str:
    """SHA-256 of the v2 settings (seed list included)."""
    data = {"config": asdict(_V2), "seeds": list(V2_SEEDS)}
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
