"""Rolling Charge tracing, ported from packages/engine/src/trace.ts (rolling method only).

Used ONLY to compute hidden truth (real victim money per account, including victims
who never reported). The decision code uses the TypeScript engine instead.
A test checks both give the same answers on the phase 1 golden story.
Money is always integer paise.
"""
from __future__ import annotations


def rupees(r: float) -> int:
    return round(r * 100)


def split_proportional(total: int, weights: dict[str, int], base: int) -> dict[str, int]:
    """Same largest-remainder split as engine money.ts splitProportional."""
    keys = sorted(k for k, w in weights.items() if w > 0)
    out: dict[str, int] = {}
    if base == 0 or not keys:
        return out
    wsum = 0
    floor_sum = 0
    rems = []
    for k in keys:
        w = weights[k]
        wsum += w
        q, rem = divmod(total * w, base)
        out[k] = q
        floor_sum += q
        rems.append((k, rem))
    if wsum > base:
        raise ValueError("weights exceed base")
    ideal_num = total * wsum
    ideal = ideal_num // base + (1 if (ideal_num % base) * 2 >= base else 0)
    left = ideal - floor_sum
    rems.sort(key=lambda kr: (-kr[1], kr[0]))
    for k, _ in rems:
        if left <= 0:
            break
        if out[k] < weights[k]:
            out[k] += 1
            left -= 1
    return out


def trace(opening: dict[str, int], txns: list[dict], victim_txns: dict[str, str],
          as_of: int | None = None) -> dict[str, dict]:
    """Return {account: {balance, taint{victim: paise}, tainted}} for visible accounts."""
    acc = {a: {"balance": b, "taint": {}, "tainted": 0} for a, b in opening.items()}
    rows = [t for t in txns if as_of is None or t["at"] <= as_of]
    rows.sort(key=lambda t: (t["at"], t["id"]))
    seen: set[str] = set()
    for t in rows:
        if t["id"] in seen or t["from"] == t["to"]:
            continue
        seen.add(t["id"])
        victim = victim_txns.get(t["id"])
        moved: dict[str, int] = {}
        src = acc.get(t["from"])
        if victim is not None:
            moved = {victim: t["amount"]}
            if src is not None:
                src["balance"] = max(src["balance"], t["amount"]) - t["amount"]
        elif src is not None:
            if src["balance"] < t["amount"]:
                src["balance"] = t["amount"]  # unexplained clean money; never invent taint
            if src["tainted"] > 0 and t["amount"] > 0:
                moved = {v: p for v, p in split_proportional(t["amount"], src["taint"], src["balance"]).items() if p > 0}
            for v, p in moved.items():
                src["taint"][v] -= p
                if src["taint"][v] == 0:
                    del src["taint"][v]
            src["tainted"] -= sum(moved.values())
            src["balance"] -= t["amount"]
        dst = acc.get(t["to"])
        if dst is not None:
            dst["balance"] += t["amount"]
            for v, p in moved.items():
                dst["taint"][v] = dst["taint"].get(v, 0) + p
            dst["tainted"] += sum(moved.values())
    return acc
