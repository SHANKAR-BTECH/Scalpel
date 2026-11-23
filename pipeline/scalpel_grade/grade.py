"""The grader: the ONLY code allowed to open truth.json.

Marks the engine's decisions against what really happened in the fake world.
"""
from __future__ import annotations


def grade_holds(rows: list[dict], truth: dict) -> dict:
    """Two-number headline (Freeze Ratio and victim money missed) plus harm numbers.

    rows: [{"account", "held"}] from decisions.json. Accounts not listed hold nothing.
    Uses REAL victim money at the decision moment, including victims who never reported.
    """
    real = truth["victimMoneyAtCutoff"]
    roles = truth["roles"]
    held = {r["account"]: r["held"] for r in rows if r["held"] > 0}
    total_real = sum(real.values())
    total_held = sum(held.values())
    accounts = set(real) | set(held)
    missed = sum(max(0, real.get(a, 0) - held.get(a, 0)) for a in accounts)
    innocent = sum(max(0, held.get(a, 0) - real.get(a, 0)) for a in accounts)
    wrongly = sum(1 for a in held if roles.get(a) != "mule" and held[a] > real.get(a, 0))
    return {
        "held": total_held,
        "victimMoney": total_real,
        "freezeRatio": (total_held / total_real) if total_real else ("no-trace" if total_held else 0),
        "victimMoneyMissed": missed,
        "recoveryRate": (total_real - missed) / total_real if total_real else "no-trace",
        "innocentHeld": innocent,
        "peopleWronglyRestricted": wrongly,
        "accountsHeld": len(held),
    }
