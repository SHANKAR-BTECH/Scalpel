"""Numbers the AI looks at, one row per account that holds traced victim money.

Built ONLY from world.json and signals.json (what the bank and telco can see), and only
from things that happened at or before the decision moment.
"""
from __future__ import annotations

from collections import defaultdict
from statistics import median

import pandas as pd

from scalpel_sim.tracing import trace

DAY = 86_400_000
MIN = 60_000
EXITS = {"EXT-ATM", "EXT-CRYPTO", "EXT-GOLD"}

FEATURES = [
    "age_days", "days_since_kyc", "is_current", "is_salary", "dwell_median_min", "senders", "reported_senders",
    "share_in_reported", "share_out_exits", "txns_per_day",
    "sim_swap", "handset_farm", "call_forwarding", "mnrl", "fri_very_high", "simbox", "sign_count",
]
PHONE = {"SIM_SWAP_LT_72H": "sim_swap", "HANDSET_GT5_SIMS": "handset_farm", "CALL_FORWARDING_ACTIVE": "call_forwarding",
         "MNRL_LISTED": "mnrl", "FRI_VERY_HIGH": "fri_very_high", "SIMBOX_ROUTE": "simbox"}


def traced_accounts(world: dict) -> dict[str, int]:
    """Accounts holding victim money traced from REPORTED complaints (what the bank knows)."""
    c = world["cutoff"]
    reported = {x["txnId"]: x["victim"] for x in world["complaints"] if x["reportedAt"] <= c}
    r = trace({a["id"]: a["opening"] for a in world["accounts"]}, world["txns"], reported, as_of=c)
    return {a: v["tainted"] for a, v in r.items() if v["tainted"] > 0}


def build_features(world: dict, signals: dict[str, list[str]]) -> pd.DataFrame:
    c = world["cutoff"]
    txns = [t for t in world["txns"] if t["at"] <= c]
    traced = traced_accounts(dict(world, txns=txns))
    reported_txn = {x["txnId"] for x in world["complaints"] if x["reportedAt"] <= c}
    accts = {a["id"]: a for a in world["accounts"]}

    ev: dict[str, list[tuple[int, int, int, str]]] = defaultdict(list)
    for t in txns:
        if t["at"] < c - 30 * DAY:
            continue
        if t["to"] in traced:
            ev[t["to"]].append((t["at"], 1, t["amount"], t["id"] + "|" + t["from"]))
        if t["from"] in traced:
            ev[t["from"]].append((t["at"], -1, t["amount"], t["to"]))

    rows = {}
    for a in sorted(traced):
        acc = accts[a]
        e = sorted(ev[a])
        dwell = []
        senders, rep_senders = set(), set()
        money_in = money_in_rep = money_out = money_exit = 0
        for i, (at, sign, amt, other) in enumerate(e):
            if sign == 1:
                tid, frm = other.split("|", 1)
                senders.add(frm)
                money_in += amt
                if tid in reported_txn:
                    rep_senders.add(frm)
                    money_in_rep += amt
                left = 0
                for at2, s2, amt2, _ in e[i + 1:]:
                    if s2 == -1:
                        left += amt2
                        if left * 2 >= amt:
                            dwell.append((at2 - at) / MIN)
                            break
                else:
                    dwell.append(1440.0)
            else:
                money_out += amt
                if other in EXITS:
                    money_exit += amt
        sig = set(signals.get(a, []))
        kyc = acc.get("kycChangedAt")
        row = {
            "age_days": (c - acc["openedAt"]) / DAY,
            "days_since_kyc": min(365.0, (c - kyc) / DAY) if kyc is not None else 365.0,
            "is_current": float(acc["type"] == "CURRENT"),
            "is_salary": float(acc["type"] == "SALARY"),
            "dwell_median_min": min(1440.0, median(dwell)) if dwell else 1440.0,
            "senders": float(len(senders)),
            "reported_senders": float(len(rep_senders)),
            "share_in_reported": money_in_rep / money_in if money_in else 0.0,
            "share_out_exits": money_exit / money_out if money_out else 0.0,
            "txns_per_day": len(e) / 30.0,
            "sign_count": float(len(sig)),
        }
        for s, col in PHONE.items():
            row[col] = float(s in sig)
        rows[a] = row
    return pd.DataFrame.from_dict(rows, orient="index", columns=FEATURES).astype(float)
