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
    reported = sum(r.get("traced", 0) for r in rows)  # victim money traced from complaints made so far
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
        "reportedMoney": reported,
        "reportedRatio": (total_held / reported) if reported else 0,
        "victimMoneyMissed": missed,
        "recoveryRate": (total_real - missed) / total_real if total_real else "no-trace",
        "innocentHeld": innocent,
        "peopleWronglyRestricted": wrongly,
        "accountsHeld": len(held),
    }


# ---------- Task 8: role counts, future money, the officer's to-do order ----------

def role_counts(truth: dict) -> dict[str, int]:
    out = {"mule": 0, "shield": 0, "normal": 0}
    for r in truth["roles"].values():
        out[r] += 1
    return out


def future_money_stopped(rows: list[dict], truth: dict) -> int:
    """Victim money arriving AFTER the decision moment that a whole freeze would block. Exact holds block none."""
    flow = truth.get("futureVictimInflow", {})
    return sum(sum(flow.get(r["account"], [])) for r in rows if r.get("action") == "WHOLE_FREEZE")


def _saved(account: str, hour: int, held: dict[str, int], truth: dict, drain_ratio: float | None) -> int:
    from scalpel_sim.world import remaining_victim_money
    return min(held.get(account, 0), remaining_victim_money(truth, account, hour, drain_ratio))


def rescue(order: list[str], held: dict[str, int], truth: dict, k: int, drain_ratio: float | None = None) -> int:
    """Victim money secured if the officer acts on `order`, K accounts per hour, each with an exact hold."""
    return sum(_saved(a, i // k, held, truth, drain_ratio) for i, a in enumerate(order))


def oracle_order(held: dict[str, int], truth: dict, k: int, drain_ratio: float | None = None) -> list[str]:
    """The best possible order (it knows the hidden answers). Solved exactly as an assignment of accounts to slots."""
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    accts = sorted(held)
    if not accts:
        return []
    n = len(accts)
    hours = sorted({j // k for j in range(n)})
    by_hour = np.array([[_saved(a, h, held, truth, drain_ratio) for h in hours] for a in accts], dtype=float)
    value = by_hour[:, [j // k for j in range(n)]]
    rows, cols = linear_sum_assignment(value, maximize=True)
    return [accts[r] for r, _ in sorted(zip(rows, cols), key=lambda x: x[1])]


def ceiling_order(held: dict[str, int], truth: dict, drain_ratio: float | None = None) -> list[str]:
    """Scalpel's own formula (amount x money lost per hour) fed the TRUE roles: score 1 for mules, 0 for everyone else.
    It is the best any mule-score model could do with this ordering rule. If even this barely beats 'biggest first',
    no model can earn a margin."""
    p = truth["muleDrainPerHour"]
    ratio = truth["drainRatio"] if drain_ratio is None else drain_ratio
    rate = lambda a: p if truth["roles"].get(a) == "mule" else p / ratio
    return sorted(held, key=lambda a: (-held[a] * rate(a), -held[a], a))


def top_mules(order: list[str], truth: dict, n: int = 10) -> int:
    return sum(truth["roles"].get(a) == "mule" for a in order[:n])


def verdict(scalpel_pct: float, signrule_pct: float, margin: float = 1.0) -> str:
    """Agreed before any results: within ±1 point of the oracle is a tie, and a tie is an honest, acceptable result."""
    d = scalpel_pct - signrule_pct
    return "beats" if d >= margin else ("does not beat" if d <= -margin else "ties")


def headline_line(scalpel_pct: float, signrule_pct: float, biggest_pct: float | None = None) -> str:
    v = verdict(scalpel_pct, signrule_pct)
    line = (f"Scalpel's order {v} the warning-sign rule: it secures {scalpel_pct:.1f}% of the best possible "
            f"rescue vs {signrule_pct:.1f}% (5 unseen v2 worlds pooled, 10 actions an hour).")
    if biggest_pct is not None:
        line += (f" It {verdict(scalpel_pct, biggest_pct)} the plain 'biggest amount first' order ({biggest_pct:.1f}%), "
                 "so in these worlds the amount alone carries most of the ordering.")
    return line


def suggested_on_innocent(rows: list[dict], truth: dict) -> int:
    """Whole freezes the planner suggested on accounts that are not really mules (never applied, but a real risk if an officer agrees)."""
    return sum(1 for r in rows if r.get("suggestedWholeFreeze") and truth["roles"].get(r["account"]) != "mule")
