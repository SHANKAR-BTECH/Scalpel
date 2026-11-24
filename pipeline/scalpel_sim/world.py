"""Fake world generator: the fictional "Bharat Demo Bank" over 30 days.

Scam campaigns: victims pay first-hop mules; money hops on through mule chains and
leaves as cash, crypto or gold. Mules also spend a little at shops, which is how
innocent shops (shields) end up holding scam money. Normal customers live normal
lives around them. Pattern names follow IBM's AMLSim (fan-in at the first hop,
a chain of hops, fan-out to exits).

world.json holds only what the bank can see at the decision moment.
truth.json holds the answers and what happens next (hidden, grader only).
"""
from __future__ import annotations

import random

from .config import WorldConfig
from .telecom import make_telecom
from .tracing import trace

DAY = 86_400_000
HOUR = 3_600_000
MIN = 60_000
T0 = 1_796_668_200_000  # 2026-12-01 00:00 IST, epoch ms
EXITS = ["EXT-ATM", "EXT-CRYPTO", "EXT-GOLD"]


class Book:
    """Visible balances, so nobody pays more than they have or before they exist."""

    def __init__(self, opening: dict[str, int], opened: dict[str, int], prefix: str = "A"):
        self.prefix = prefix
        self.bal = dict(opening)
        self.opened = opened
        self.txns: list[dict] = []

    def pay(self, frm: str, to: str, amount: int, at: int, channel: str) -> dict | None:
        if frm in self.bal:
            if at < self.opened[frm]:
                return None
            amount = min(amount, self.bal[frm])
        if to in self.opened and at < self.opened[to]:
            return None
        if amount <= 0:
            return None
        t = {"id": f"T{self.prefix}{len(self.txns) + 1:07d}", "at": at, "from": frm, "to": to, "amount": amount, "channel": channel}
        self.txns.append(t)
        if frm in self.bal:
            self.bal[frm] -= amount
        if to in self.bal:
            self.bal[to] += amount
        return t


def _victim_id(cfg: WorldConfig, c: int, v: int) -> str:
    """A neutral outside-account id: no 'victim' label and no campaign number (a bank only sees a remitter)."""
    import hashlib
    return "R" + hashlib.sha256(f"{cfg.name}|{cfg.seed}|{c}|{v}".encode()).hexdigest()[:10].upper()


def _pick_scam(rng: random.Random, cfg: WorldConfig):
    x, acc = rng.random(), 0.0
    for s in cfg.scams:
        acc += s.share
        if x <= acc:
            return s
    return cfg.scams[-1]


def make_world(cfg: WorldConfig) -> tuple[dict, dict]:
    rng = random.Random(cfg.seed)
    cutoff = T0 + cfg.cutoff_day * DAY
    end = cutoff + cfg.after_hours * HOUR
    n = cfg.n_accounts
    ids = [f"{cfg.id_prefix}{i:05d}" for i in range(1, n + 1)]
    order = ids[:]
    rng.shuffle(order)
    n_mule, n_shield = round(n * cfg.mule_share), round(n * cfg.shield_share)
    mules, shields, normals = order[:n_mule], order[n_mule:n_mule + n_shield], order[n_mule + n_shield:]
    roles = {**{a: "mule" for a in mules}, **{a: "shield" for a in shields}, **{a: "normal" for a in normals}}

    accounts, opened, opening = {}, {}, {}
    rented: set[str] = set()  # old accounts whose owners still use them day to day
    for a in ids:
        kyc = None
        if roles[a] == "mule":
            if rng.random() < cfg.mule_old_rented_share:
                age = rng.randint(60, 1500)
                rented.add(a)
            else:
                age = rng.randint(*cfg.mule_age_days)
            typ, bal = "SAVINGS", rng.randint(0, 3_000) * 100
            if rng.random() < cfg.mule_kyc_change_share:
                kyc = cutoff - rng.randint(1, 25) * DAY
        elif roles[a] == "shield":
            age, typ, bal = rng.randint(300, 4000), rng.choice(["CURRENT", "CURRENT", "SAVINGS"]), rng.randint(20_000, 400_000) * 100
        else:
            age = rng.randint(3, 45) if rng.random() < cfg.normal_new_share else rng.randint(5, 5000)
            typ = rng.choice(["SAVINGS"] * 5 + ["SALARY"] * 2 + ["CURRENT"])
            bal = rng.randint(1_000, 300_000) * 100
            if rng.random() < 0.03:
                kyc = cutoff - rng.randint(1, 200) * DAY
        opened[a] = cutoff - age * DAY
        if opened[a] > T0:
            bal = 0  # opened inside the window: starts empty
        if kyc is not None and kyc < opened[a]:
            kyc = opened[a]
        opening[a] = bal
        accounts[a] = {"id": a, "type": typ, "openedAt": opened[a], "kycChangedAt": kyc, "opening": bal}

    book = Book(opening, opened, cfg.id_prefix)
    events: list[tuple] = []  # (at, kind, payload) processed in time order so balances are realistic

    # Normal life (whole window incl. after cut-off, but only pre-cut-off is visible).
    shops = shields + rng.sample(normals, k=max(1, len(normals) // 20))
    for a in normals + shields + mules:
        rate = cfg.normal_txns_per_account_day * (1.0 if a in rented or roles[a] != "mule" else cfg.mule_fresh_life_share)
        for d in range(cfg.days):
            if rng.random() < rate:
                at = T0 + d * DAY + rng.randint(8 * 60, 22 * 60) * MIN
                r = rng.random()
                if r < 0.15:
                    events.append((at, "pay", ("EXT-EMPLOYER", a, rng.randint(15_000, 90_000) * 100, "NEFT")))
                elif r < 0.75:
                    events.append((at, "pay", (a, rng.choice(shops), rng.randint(100, 6_000) * 100, "UPI")))
                elif r < 0.9:
                    events.append((at, "pay", (a, rng.choice(normals), rng.randint(500, 20_000) * 100, "IMPS")))
                else:
                    events.append((at, "pay", (a, "EXT-MERCHANT", rng.randint(500, 30_000) * 100, "CARD")))

    # Shops settle the day's takings every evening; some people pass money on within hours.
    for a in shields:
        instant = rng.random() < cfg.shield_instant_share
        for d in range(cfg.days):
            times = [h * 60 + rng.randint(0, 59) for h in range(8, 23)] if instant else [rng.randint(21 * 60, 23 * 60 + 30)]
            for m in times:
                events.append((T0 + d * DAY + m * MIN, "sweep", (a, rng.randint(*cfg.shield_sweep_share))))
    fast = set(rng.sample(normals, k=round(len(normals) * cfg.normal_fast_share)))
    collectors = rng.sample(sorted(set(normals) - fast), k=round(len(normals) * cfg.normal_collector_share))
    fast |= set(collectors)
    for a in collectors:
        for d in range(cfg.days):
            for _ in range(rng.randint(0, 3)):
                at = T0 + d * DAY + rng.randint(8 * 60, 22 * 60) * MIN
                events.append((at, "pay", (rng.choice(normals), a, rng.randint(200, 5_000) * 100, "UPI")))

    # Scam campaigns: chains of mules, hop 1 takes victim money.
    split = cfg.extra or None  # v3 only: mules pass money on in small pieces (configs/v3_split.py)
    free_mules = mules[:]
    rng.shuffle(free_mules)
    campaigns = []
    for c in range(cfg.campaigns):
        if len(free_mules) < 3:
            break
        scam = _pick_scam(rng, cfg)
        hops = rng.randint(*cfg.hops)
        chain = []
        for h in range(hops):
            width = 2 if h == 0 and len(free_mules) > 4 else (rng.randint(*split["split_width"]) if split and h > 0 else 1)
            level = [free_mules.pop() for _ in range(min(width, len(free_mules)))]
            if not level:
                break
            chain.append(level)
        start = T0 + rng.randint(1, cfg.days - 4) * DAY + rng.randint(0, 23) * HOUR
        length = rng.randint(*cfg.campaign_days) * DAY
        campaigns.append({"id": f"K{c + 1:03d}", "scam": scam.name, "chain": chain, "start": start, "end": start + length})
        for v in range(rng.randint(*scam.victims)):
            at = start + rng.randint(0, length // MIN) * MIN
            events.append((at, "victim", (c, _victim_id(cfg, c, v), rng.randint(*scam.amount_rupees) * 100)))

    # Mules wake up after their accounts are open; make sure hop-1 mules exist before the campaign.
    for camp in campaigns:
        for level in camp["chain"]:
            for m in level:
                if opened[m] > camp["start"]:
                    opened[m] = camp["start"] - rng.randint(1, 3) * DAY
                    accounts[m]["openedAt"] = opened[m]
                    if accounts[m]["kycChangedAt"] is not None and accounts[m]["kycChangedAt"] < opened[m]:
                        accounts[m]["kycChangedAt"] = opened[m]

    victim_txns: dict[str, str] = {}
    complaints: list[dict] = []
    future_inflow: dict[str, list[int]] = {}
    reported_n = victims_n = 0
    report_rate = rng.uniform(*cfg.report_rate)
    pending: list[tuple] = []
    events.sort(key=lambda e: (e[0], e[1]))
    import heapq
    heap = [(e[0], i, e[1], e[2]) for i, e in enumerate(events)]
    heapq.heapify(heap)
    seq = len(heap)

    def push(at, kind, payload):
        nonlocal seq
        seq += 1
        heapq.heappush(heap, (at, seq, kind, payload))

    while heap:
        at, _, kind, payload = heapq.heappop(heap)
        if at > end:
            break
        if kind == "pay":
            t = book.pay(*payload[:2], payload[2], at, payload[3])
            if t and t["to"] in fast and rng.random() < 0.8:
                share = rng.randint(50, 95)
                push(at + rng.randint(*cfg.normal_fast_minutes) * MIN, "pay",
                     (t["to"], rng.choice(["EXT-OWNBANK", "EXT-RENT", "EXT-FAMILY"]), t["amount"] * share // 100, "IMPS"))
        elif kind == "sweep":
            a, share = payload
            book.pay(a, "EXT-SETTLEMENT", book.bal[a] * share // 100, at, "NEFT")
        elif kind == "victim":
            c, victim, amount = payload
            camp = campaigns[c]
            mule = rng.choice(camp["chain"][0])
            if at > cutoff:
                # Hidden future: victim money still arriving after the decision moment.
                hour = (at - cutoff) // HOUR
                future_inflow.setdefault(mule, [0] * cfg.after_hours)[min(hour, cfg.after_hours - 1)] += amount
                continue
            t = book.pay(f"EXT-{victim}", mule, amount, at, "UPI")
            if not t:
                continue
            victims_n += 1
            victim_txns[t["id"]] = victim
            if rng.random() < report_rate:
                reported_n += 1
                rep = at + rng.randint(cfg.report_delay_hours[0] * 60, cfg.report_delay_hours[1] * 60) * MIN
                if rep <= cutoff:
                    complaints.append({"id": f"C{len(complaints) + 1:05d}", "victim": victim, "txnId": t["id"], "reportedAt": rep})
            push(at + rng.randint(*cfg.mule_dwell_minutes) * MIN, "hop", (c, 0, mule, amount))
        elif kind == "hop":
            c, h, mule, amount = payload
            camp = campaigns[c]
            fwd = amount * rng.randint(*cfg.mule_forward_share) // 100
            if rng.random() < 0.5:
                book.pay(mule, rng.choice(shields), amount * rng.randint(*cfg.shop_spend_share) // 100, at, "UPI")
            if split and h + 1 < len(camp["chain"]):
                if h == 0:
                    cash = fwd * rng.randint(*split["cashout_leak_l1"]) // 100
                    book.pay(mule, "EXT-ATM", cash, at, "ATM_CASH")
                    fwd -= cash
                i = 0
                while fwd > 0:
                    piece = min(fwd, rng.randint(*split["piece_rupees"]) * 100)
                    amt = piece
                    if rng.random() < split["mixed_share"]:
                        amt = min(piece + rng.randint(*split["mixed_topup_rupees"]) * 100, 999_900)
                    i += 1
                    push(at + i * rng.randint(1, 4) * MIN, "piece", (c, h, mule, rng.choice(camp["chain"][h + 1]), amt))
                    fwd -= piece
            elif h + 1 < len(camp["chain"]):
                nxt = rng.choice(camp["chain"][h + 1])
                t = book.pay(mule, nxt, fwd, at, "IMPS")
                if t:
                    push(at + rng.randint(*cfg.mule_dwell_minutes) * MIN, "hop", (c, h + 1, nxt, t["amount"]))
            else:
                book.pay(mule, rng.choice(EXITS), fwd, at, rng.choice(["ATM_CASH", "CRYPTO", "GOLD"]))
        elif kind == "piece":
            c, h, mule, nxt, amt = payload
            t = book.pay(mule, nxt, amt, at, "UPI")
            if t:
                push(at + rng.randint(*cfg.mule_dwell_minutes) * MIN, "hop", (c, h + 1, nxt, t["amount"]))

    visible = [t for t in book.txns if t["at"] <= cutoff]
    accts = sorted(accounts.values(), key=lambda a: a["id"])
    phones, telecom = make_telecom(cfg.seed, [a["id"] for a in accts], roles, cutoff, cfg.signal_noise)
    world = {"schema": "scalpel-world/1", "name": cfg.name, "seed": cfg.seed, "cutoff": cutoff,
             "accounts": accts, "txns": visible, "complaints": complaints, "phones": phones, "telecom": telecom}
    traced = trace({a["id"]: a["opening"] for a in accts}, visible, victim_txns, as_of=cutoff)
    at_cutoff = {a: v["tainted"] for a, v in traced.items() if v["tainted"] > 0}
    truth = {
        "schema": "scalpel-truth/1", "name": cfg.name, "roles": roles, "victimTxns": victim_txns,
        "campaigns": [{"id": k["id"], "scam": k["scam"], "chain": k["chain"]} for k in campaigns],
        "victimMoneyAtCutoff": at_cutoff,
        "muleDrainPerHour": cfg.mule_drain_per_hour, "drainRatio": cfg.drain_ratio, "afterHours": cfg.after_hours,
        "futureVictimInflow": future_inflow,
        "stats": {"reportRate": reported_n / victims_n if victims_n else 0.0, "victims": victims_n,
                  "victimMoneyPaid": sum(t["amount"] for t in visible if t["id"] in victim_txns)},
    }
    return world, truth


def remaining_victim_money(truth: dict, account: str, hour: int, drain_ratio: float | None = None) -> int:
    """Victim money still in `account` `hour` hours after the decision moment, if nobody acts.
    Mule money drains at muleDrainPerHour; everyone else drains drain_ratio times slower."""
    v0 = truth["victimMoneyAtCutoff"].get(account, 0)
    ratio = truth["drainRatio"] if drain_ratio is None else drain_ratio
    p = truth["muleDrainPerHour"]
    if truth["roles"].get(account) != "mule":
        p = p / ratio
    return int(v0 * (1 - p) ** hour)


def rescue_share(world: dict, truth: dict) -> float:
    """Share of all victim money paid so far that is still sitting in accounts at the decision moment."""
    paid = truth["stats"]["victimMoneyPaid"]
    return sum(truth["victimMoneyAtCutoff"].values()) / paid if paid else 0.0
