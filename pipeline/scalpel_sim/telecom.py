"""Fake phone-network data for Telco-A: one number and handset per account, plus
SIM swaps, call forwarding, shared handsets, the MNRL list, DoT's Financial Fraud
Risk Indicator (FRI) tier and SIM-box routes.

Noisy on purpose: many mules show few signs, and some normal people show one.
Identifiers are fake: numbers look like +91 0XXXX XXXXX and IMEIs start with 00.
"""
from __future__ import annotations

import random

HOUR = 3_600_000

# Chance of each sign: (mule, everyone else). "high" noise weakens mules and strengthens the rest.
RATES = {
    "swap": (0.20, 0.010),
    "forward": (0.15, 0.020),
    "farm": (0.12, 0.0),      # mule handset shared by many SIMs
    "mnrl": (0.10, 0.002),
    "fri": (0.15, 0.005),
    "simbox": (0.10, 0.001),
}


def make_telecom(seed: int, account_ids: list[str], roles: dict[str, str], cutoff: int, noise: str = "low", soft: set[str] | None = None):
    """soft (v4): mules that are old rented accounts on the owner's own phone show signs only 3x as often as normal people."""
    rng = random.Random(seed * 7919 + 1)
    mule_f, other_f = (1.0, 1.0) if noise == "low" else (0.6, 2.0)
    used: set[str] = set()

    def msisdn() -> str:
        while True:
            d = f"{rng.randint(0, 9999):04d}{rng.randint(0, 99999):05d}"
            m = f"+91 0{d[:4]} {d[4:]}"
            if m not in used:
                used.add(m)
                return m

    def imei() -> str:
        return "00" + "".join(str(rng.randint(0, 9)) for _ in range(13))

    farms = [imei() for _ in range(max(1, len(account_ids) // 400))]
    phones, swaps, forwarding, mnrl, fri, simbox = [], [], [], [], {}, []
    for a in account_ids:
        is_mule = roles[a] == "mule"
        if soft and a in soft:
            p = lambda k: min(RATES[k][0] * mule_f, RATES[k][1] * other_f * 3)
        else:
            p = lambda k: RATES[k][0] * mule_f if is_mule else RATES[k][1] * other_f
        m = msisdn()
        handset = rng.choice(farms) if rng.random() < p("farm") else imei()
        phones.append({"account": a, "msisdn": m, "imei": handset})
        if rng.random() < p("swap"):
            swaps.append({"msisdn": m, "at": cutoff - rng.randint(1, 70) * HOUR})
        elif rng.random() < 0.02:
            swaps.append({"msisdn": m, "at": cutoff - rng.randint(100, 2000) * HOUR})  # old swap: not a sign
        if rng.random() < p("forward"):
            forwarding.append(m)
        if rng.random() < p("mnrl"):
            mnrl.append(m)
        r = rng.random()
        fri[m] = "VERY_HIGH" if r < p("fri") else ("HIGH" if r < p("fri") * 3 else "LOW")
        if rng.random() < p("simbox"):
            simbox.append(m)
    telecom = {"simSwaps": swaps, "callForwarding": forwarding, "mnrl": mnrl, "fri": fri, "simbox": simbox}
    return phones, telecom
