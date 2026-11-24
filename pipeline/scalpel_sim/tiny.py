"""A tiny fake world (about 50 accounts) for the walking skeleton.

One scam: victims pay two mule accounts, money hops on, some lands with two shops
(shields), some is taken out as cash. Normal customers get salaries and spend.
Account ids are neutral (A001...), so the id never gives the answer away.
Fictional data only.
"""
from __future__ import annotations

import random

from .tracing import trace

DAY = 86_400_000
MIN = 60_000
T0 = 1_796_668_200_000  # 2026-12-01 00:00 IST, epoch ms


class _Book:
    """Keeps visible balances so no account ever pays more than it has."""

    def __init__(self, opening: dict[str, int]):
        self.bal = dict(opening)
        self.txns: list[dict] = []

    def pay(self, frm: str, to: str, amount: int, at: int, channel: str) -> dict | None:
        if frm in self.bal:
            amount = min(amount, self.bal[frm])
        if amount <= 0:
            return None
        t = {"id": f"T{len(self.txns) + 1:05d}", "at": at, "from": frm, "to": to, "amount": amount, "channel": channel}
        self.txns.append(t)
        if frm in self.bal:
            self.bal[frm] -= amount
        if to in self.bal:
            self.bal[to] += amount
        return t


def make_tiny(seed: int = 1) -> tuple[dict, dict]:
    rng = random.Random(seed)
    cutoff = T0 + 10 * DAY
    ids = [f"A{i:03d}" for i in range(1, 46)]
    rng.shuffle(ids)
    mules, shields, normals = ids[:3], ids[3:5], ids[5:]
    roles = {**{a: "mule" for a in mules}, **{a: "shield" for a in shields}, **{a: "normal" for a in normals}}

    accounts = []
    for a in sorted(ids):
        if roles[a] == "mule":
            typ, opened, opening = "SAVINGS", cutoff - rng.randint(5, 25) * DAY, rng.randint(0, 2_000) * 100
        elif roles[a] == "shield":
            typ, opened, opening = "CURRENT", cutoff - rng.randint(400, 3000) * DAY, rng.randint(50_000, 300_000) * 100
        else:
            typ = rng.choice(["SAVINGS", "SAVINGS", "SALARY", "CURRENT"])
            opened, opening = cutoff - rng.randint(60, 4000) * DAY, rng.randint(5_000, 200_000) * 100
        accounts.append({"id": a, "type": typ, "openedAt": opened, "kycChangedAt": None, "opening": opening})

    book = _Book({a["id"]: a["opening"] for a in accounts})
    events: list[tuple[int, str, str, int, str]] = []
    # Normal life: salaries in, shopping out, a few transfers between people.
    for d in range(10):
        for a in normals:
            if rng.random() < 0.08:
                events.append((T0 + d * DAY + rng.randint(9, 11) * 3_600_000, "EXT-EMPLOYER", a, rng.randint(20_000, 80_000) * 100, "NEFT"))
            if rng.random() < 0.5:
                events.append((T0 + d * DAY + rng.randint(10, 21) * 3_600_000, a, rng.choice(shields + ["EXT-MERCHANT"]), rng.randint(200, 5_000) * 100, "UPI"))
            if rng.random() < 0.1:
                events.append((T0 + d * DAY + rng.randint(10, 21) * 3_600_000, a, rng.choice(normals), rng.randint(500, 10_000) * 100, "UPI"))
    for ev in sorted(events):
        book.pay(ev[1], ev[2], ev[3], ev[0], ev[4])

    # The scam (days 7-9): victims pay the first two mules; money hops and leaves.
    victim_txns: dict[str, str] = {}
    complaints = []
    first, second, third = mules
    for i in range(8):
        at = T0 + 7 * DAY + i * 5 * 3_600_000 + rng.randint(0, 59) * MIN
        victim = f"VIC-{i + 1:02d}"
        t = book.pay(f"EXT-{victim}", first if i % 2 == 0 else second, rng.randint(5_000, 60_000) * 100, at, "UPI")
        victim_txns[t["id"]] = victim
        mule = t["to"]
        book.pay(mule, third, t["amount"] * rng.randint(30, 60) // 100, at + rng.randint(3, 12) * MIN, "IMPS")
        book.pay(mule, rng.choice(shields), rng.randint(500, 3_000) * 100, at + rng.randint(20, 90) * MIN, "UPI")
        book.pay(third, "EXT-ATM", t["amount"] * rng.randint(20, 40) // 100, at + rng.randint(15, 40) * MIN, "ATM_CASH")
        if rng.random() < 0.65:
            reported = at + rng.randint(1, 72) * 3_600_000
            if reported <= cutoff:
                complaints.append({"id": f"C{len(complaints) + 1:03d}", "victim": victim, "txnId": t["id"], "reportedAt": reported})

    txns = [t for t in book.txns if t["at"] <= cutoff]
    world = {"schema": "scalpel-world/1", "name": f"tiny-{seed}", "seed": seed, "cutoff": cutoff,
             "accounts": accounts, "txns": txns, "complaints": complaints}
    opening = {a["id"]: a["opening"] for a in accounts}
    traced = trace(opening, book.txns, victim_txns, as_of=cutoff)
    at_cutoff = {a: v["tainted"] for a, v in traced.items() if v["tainted"] > 0}
    truth = {"schema": "scalpel-truth/1", "name": world["name"], "roles": roles, "victimTxns": victim_txns,
             "victimMoneyAtCutoff": at_cutoff,
             "victimMoneyByHour": {a: [v] * 73 for a, v in at_cutoff.items()},
             "futureVictimInflow": {}}
    return world, truth
