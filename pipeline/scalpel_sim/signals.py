"""The 10 warning signs the engine's Gate understands, computed ONLY from world.json
(what the bank and telco can see) as of the decision moment.

Names must match BANK_SIGNALS and TELECOM_SIGNALS in packages/engine/src/gate.ts
(a test reads them from that file).
"""
from __future__ import annotations

from collections import defaultdict

DAY = 86_400_000
HOUR = 3_600_000
MIN = 60_000

BANK = ["ACCOUNT_AGE_LT_30D", "DWELL_LT_15M", "GE3_CASE_LINKED_SENDERS", "KYC_CHANGED_LT_30D"]
TELECOM = ["SIM_SWAP_LT_72H", "HANDSET_GT5_SIMS", "CALL_FORWARDING_ACTIVE", "MNRL_LISTED", "FRI_VERY_HIGH", "SIMBOX_ROUTE"]
SIGNAL_NAMES = BANK + TELECOM


def compute_signals(world: dict) -> dict[str, list[str]]:
    c = world["cutoff"]
    out: dict[str, list[str]] = {a["id"]: [] for a in world["accounts"]}
    for a in world["accounts"]:
        if c - a["openedAt"] < 30 * DAY:
            out[a["id"]].append("ACCOUNT_AGE_LT_30D")
        k = a.get("kycChangedAt")
        if k is not None and 0 <= c - k < 30 * DAY:
            out[a["id"]].append("KYC_CHANGED_LT_30D")

    # Dwell: money arriving and at least half of it leaving within 15 minutes (last 30 days).
    by_acct: dict[str, list[tuple[int, int, int]]] = defaultdict(list)  # (at, +credit / -debit)
    for t in world["txns"]:
        if t["at"] > c or t["at"] < c - 30 * DAY:
            continue
        if t["to"] in out:
            by_acct[t["to"]].append((t["at"], 1, t["amount"]))
        if t["from"] in out:
            by_acct[t["from"]].append((t["at"], -1, t["amount"]))
    for a, evs in by_acct.items():
        evs.sort()
        fast = False
        for i, (at, sign, amt) in enumerate(evs):
            if sign != 1:
                continue
            out_sum = 0
            for at2, sign2, amt2 in evs[i + 1:]:
                if at2 - at > 15 * MIN:
                    break
                if sign2 == -1:
                    out_sum += amt2
            if out_sum * 2 >= amt:
                fast = True
                break
        if fast:
            out[a].append("DWELL_LT_15M")

    # Reported victims who paid this account directly.
    txns = {t["id"]: t for t in world["txns"]}
    victims: dict[str, set[str]] = defaultdict(set)
    for comp in world["complaints"]:
        if comp["reportedAt"] <= c and comp["txnId"] in txns:
            victims[txns[comp["txnId"]]["to"]].add(comp["victim"])
    for a, vs in victims.items():
        if a in out and len(vs) >= 3:
            out[a].append("GE3_CASE_LINKED_SENDERS")

    # Telecom.
    phones = world.get("phones", [])
    tel = world.get("telecom", {})
    owner = {p["msisdn"]: p["account"] for p in phones}
    per_imei: dict[str, set[str]] = defaultdict(set)
    for p in phones:
        per_imei[p["imei"]].add(p["msisdn"])
    flags: dict[str, set[str]] = defaultdict(set)
    for s in tel.get("simSwaps", []):
        if 0 <= c - s["at"] <= 72 * HOUR:
            flags[s["msisdn"]].add("SIM_SWAP_LT_72H")
    for p in phones:
        if len(per_imei[p["imei"]]) > 5:
            flags[p["msisdn"]].add("HANDSET_GT5_SIMS")
    for m in tel.get("callForwarding", []):
        flags[m].add("CALL_FORWARDING_ACTIVE")
    for m in tel.get("mnrl", []):
        flags[m].add("MNRL_LISTED")
    for m, tier in tel.get("fri", {}).items():
        if tier == "VERY_HIGH":
            flags[m].add("FRI_VERY_HIGH")
    for m in tel.get("simbox", []):
        flags[m].add("SIMBOX_ROUTE")
    for m, fs in flags.items():
        a = owner.get(m)
        if a in out:
            out[a].extend(s for s in TELECOM if s in fs and s not in out[a])

    return {a: [s for s in SIGNAL_NAMES if s in v] for a, v in out.items()}
