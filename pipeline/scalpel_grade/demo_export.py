"""Demo export: the ONLY bridge from the hidden answers to the website.

   python -m scalpel_grade.demo_export      (run inside pipeline/, after python -m scalpel_sim.all)

Writes apps/web/data/demo.json with totals, hour-by-hour series and curves only: no roles, no per-account answers.
Account ids appear only in the memo cases (the engine's own output, no answers) and the "worst mistakes" table
(already public in RESULTS.md).
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from scalpel_sim.export import read_json
from scalpel_sim.world import remaining_victim_money

from .grade import _saved, grade_holds, oracle_order, rescue

PIPE = Path(__file__).resolve().parents[1]
REPO = PIPE.parent
OUT = REPO / "apps" / "web" / "data" / "demo.json"
HOURS = 72
K = 10
MEMO_ACCOUNTS = ("D09001", "D00191")
HEADLINE_POLICIES = {"none": "0", "axe": "A", "ruler": "B", "scalpel": "C"}
ORDER_NAMES = ("fcfs", "biggest", "signrule", "scalpel", "oracle")


def LANES(q: dict) -> dict[str, tuple[str, list[str]]]:
    """Replay lanes: (decisions file, action order). Axe and biggest share one order, so lane 2 vs 3 differs
    only in hold size; biggest and Scalpel hold the same amounts, so lane 3 vs 4 differs only in order."""
    return {
        "none": ("0", q["orders"]["biggest"]),
        "axe": ("A", q["orders"]["biggest"]),
        "biggest": ("C", q["orders"]["biggest"]),
        "scalpel": ("C", q["orders"]["scalpel"]),
    }


def rescue_curve(order: list[str], held: dict[str, int], truth: dict, k: int, drain_ratio: float | None = None) -> list[int]:
    """Cumulative victim money secured after each action (index i is acted on at hour i // k)."""
    out, s = [], 0
    for i, a in enumerate(order):
        s += _saved(a, i // k, held, truth, drain_ratio)
        out.append(s)
    return out


def _acted_hour(order: list[str], k: int) -> dict[str, int]:
    return {a: i // k for i, a in enumerate(order)}


def _lane_holds(rows: list[dict]) -> dict[str, int]:
    return {r["account"]: r["held"] for r in rows if r["held"] > 0}


def replay_series(rows: list[dict], order: list[str], truth: dict, k: int = K, hours: int = HOURS) -> dict[str, list[int]]:
    """Hour by hour (0..hours) after the decision moment, for one lane.

    victimMoneyGonePaise: victim money that has left for good (neither held nor still sitting in the account).
    securedPaise: victim money held so far = sum over acted accounts of min(hold, victim money still there when acted on).
    innocentLockedPaise: money held beyond the real victim money in those accounts (same measure as grade_holds).
    peopleRestricted / shopsHurt: non-mule accounts (all / shields only) holding more than their victim money.
    """
    held = _lane_holds(rows)
    when = _acted_hour([a for a in order if a in held] + [a for a in held if a not in order], k)
    real = truth["victimMoneyAtCutoff"]
    roles = truth["roles"]
    out = {"securedPaise": [], "victimMoneyGonePaise": [], "innocentLockedPaise": [], "peopleRestricted": [], "shopsHurt": []}
    for h in range(hours + 1):
        acted = [a for a, t in when.items() if t <= h]
        sec = {a: _saved(a, when[a], held, truth, None) for a in acted}
        out["securedPaise"].append(sum(sec.values()))
        # gone = victim money that has left the bank for good: neither held nor still sitting in the account
        out["victimMoneyGonePaise"].append(sum(v - sec.get(a, 0) - max(0, remaining_victim_money(truth, a, h) - sec.get(a, 0))
                                               for a, v in real.items()))
        out["innocentLockedPaise"].append(sum(max(0, held[a] - real.get(a, 0)) for a in acted))
        wrong = [a for a in acted if roles.get(a) != "mule" and held[a] > real.get(a, 0)]
        out["peopleRestricted"].append(len(wrong))
        out["shopsHurt"].append(sum(1 for a in wrong if roles.get(a) == "shield"))
    return out


def missed_buckets(rows: list[dict], order: list[str], truth: dict, k: int = K, hours: int = HOURS) -> dict[str, int]:
    """Where every rupee of victim money (at the decision moment) ended up by hour `hours`, for one lane.

    Fixed precedence per account: secured first; then money of victims who never complained (by the decision
    moment); then reported money that drained away before the officer reached the account; the rest is reported
    money in accounts that were never reached within `hours`, or never traced. Sums exactly to the total."""
    held = _lane_holds(rows)
    traced = {r["account"]: r["traced"] for r in rows}
    when = _acted_hour([a for a in order if a in held] + [a for a in held if a not in order], k)
    b = {"securedPaise": 0, "neverComplainedPaise": 0, "reportedGoneBeforeHoldPaise": 0, "reportedNotReachedOrNotTracedPaise": 0}
    for a, v in truth["victimMoneyAtCutoff"].items():
        acted = a in when and when[a] <= hours
        sec = _saved(a, when[a], held, truth, None) if acted else 0
        reported = min(traced.get(a, 0), v)
        rest = v - sec
        never = min(rest, v - reported)
        rest -= never
        if acted:
            b["reportedGoneBeforeHoldPaise"] += rest
        else:
            b["reportedNotReachedOrNotTracedPaise"] += rest
        b["securedPaise"] += sec
        b["neverComplainedPaise"] += never
    return b


def _sample(n: int, points: int = 120) -> list[int]:
    """Indexes to keep for a chart: about `points` evenly spaced, always including the first and last."""
    if n <= points:
        return list(range(n))
    step = (n - 1) / (points - 1)
    return sorted({round(i * step) for i in range(points)})


def order_curves(worlds: list[Path], ks=(5, 10, 20), model: str = "logistic") -> dict:
    """Per K: for each order, % of the best possible final rescue after each action, mean/min/max over worlds."""
    out: dict = {}
    for k in ks:
        per: dict[str, list[list[float]]] = {n: [] for n in ORDER_NAMES}
        for w in worlds:
            truth = read_json(w / "truth" / "truth.json")
            q = read_json(w / "decisions" / f"queues-{model}.json")
            orders = dict(q["orders"])
            orders["oracle"] = oracle_order(q["held"], truth, k)
            best = rescue(orders["oracle"], q["held"], truth, k) or 1
            for n in ORDER_NAMES:
                per[n].append([100 * x / best for x in rescue_curve(orders[n], q["held"], truth, k)])
        n_max = max(len(c) for cs in per.values() for c in cs)
        out[str(k)] = {}
        for n, cs in per.items():
            padded = [c + [c[-1] if c else 0.0] * (n_max - len(c)) for c in cs]
            cols = list(zip(*padded))
            keep = _sample(len(cols))
            out[str(k)][n] = {"x": [i + 1 for i in keep], "mean": [round(sum(cols[i]) / len(cols[i]), 2) for i in keep],
                              "min": [round(min(cols[i]), 2) for i in keep], "max": [round(max(cols[i]), 2) for i in keep]}
    return out


def timeline_30d(world: dict, truth: dict) -> list[dict]:
    """Per day of the 30-day window: victim money paid (all victims) and complaints made (by the decision moment)."""
    cutoff = world["cutoff"]
    day0 = cutoff - 30 * 86_400_000
    victim_txn = set(truth["victimTxns"])
    days = [{"day": d + 1, "victimPaidPaise": 0, "complaints": 0} for d in range(30)]
    for t in world["txns"]:
        if t["id"] in victim_txn and day0 <= t["at"] <= cutoff:
            days[min(29, (t["at"] - day0) // 86_400_000)]["victimPaidPaise"] += t["amount"]
    for c in world["complaints"]:
        if day0 <= c["reportedAt"] <= cutoff:
            days[min(29, (c["reportedAt"] - day0) // 86_400_000)]["complaints"] += 1
    return days


def _git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "unknown"


def write_memo(pipe: Path = PIPE) -> Path:
    """Ask the TypeScript engine (via the sim-runner) for the memo cases. Reads the world folder only."""
    import subprocess
    out = pipe / "demo" / "decisions" / "memo.json"
    subprocess.run(["npx", "-y", "pnpm@10.28.0", "--silent", "--filter", "@scalpel/sim-runner", "run", "world",
                    str(pipe / "demo" / "world"), "--memo", str(out), "--accounts", ",".join(MEMO_ACCOUNTS)],
                   cwd=REPO, check=True, capture_output=True, text=True)
    return out


def build_demo(pipe: Path = PIPE) -> dict:
    demo = pipe / "demo"
    truth = read_json(demo / "truth" / "truth.json")
    world = read_json(demo / "world" / "world.json")
    q = read_json(demo / "decisions" / "queues-logistic.json")
    rows = {p: read_json(demo / "decisions" / f"{p}.json")["rows"] for p in ("0", "A", "B", "C")}
    memo = read_json(demo / "decisions" / "memo.json")
    results = read_json(pipe / "results.json")

    headline = {}
    for key, p in HEADLINE_POLICIES.items():
        g = grade_holds(rows[p], truth)
        headline[key] = {
            "freezeRatio": g["freezeRatio"] if isinstance(g["freezeRatio"], (int, float)) else None,
            "heldPaise": g["held"], "victimMoneyPaise": g["victimMoney"], "victimMoneyMissedPaise": g["victimMoneyMissed"],
            "innocentHeldPaise": g["innocentHeld"], "peopleWronglyRestricted": g["peopleWronglyRestricted"], "accountsHeld": g["accountsHeld"],
        }
    v2 = results["v2"]
    v2_head = {key: {
        "freezeRatio": sum(w["holds"][p]["held"] for w in v2) / max(1, sum(w["holds"][p]["victimMoney"] for w in v2)),
        "victimMoneyMissedPaise": sum(w["holds"][p]["victimMoneyMissed"] for w in v2),
        "victimMoneyPaise": sum(w["holds"][p]["victimMoney"] for w in v2),
        "innocentHeldPaise": sum(w["holds"][p]["innocentHeld"] for w in v2),
        "peopleWronglyRestricted": sum(w["holds"][p]["peopleWronglyRestricted"] for w in v2),
    } for key, p in HEADLINE_POLICIES.items()}

    lanes = {}
    for lane, (p, order) in LANES(q).items():
        lanes[lane] = {**replay_series(rows[p], order, truth, K, HOURS), "buckets": missed_buckets(rows[p], order, truth, K, HOURS)}

    worlds = sorted((pipe / "out").glob("v2-s*"))
    worst = sorted(((w["world"], x) for w in v2 for x in w["models"]["logistic"]["worst"]),
                   key=lambda t: -abs((t[1]["role"] == "mule") - t[1]["muleScore"]) * t[1]["traced"])[:5]

    return {
        "schema": "scalpel-demo/3",
        "label": "simulated",
        "world": {"name": "demo", "accounts": len(world["accounts"]), "complaints": len(world["complaints"]),
                  "victims": truth["stats"]["victims"], "reportRate": truth["stats"]["reportRate"],
                  "muleDrainPerHour": truth["muleDrainPerHour"], "drainRatio": truth["drainRatio"]},
        "headline": headline,
        "headlineV2": v2_head,
        "replay": {"k": K, "hours": HOURS, "timeline": timeline_30d(world, truth), "lanes": lanes},
        "order": {"source": "5 unseen v2 worlds (seeds 201-205), mule-score model: logistic regression",
                  "byK": order_curves(worlds) if worlds else {}, "caption": [results["firstLine"]], "v3": _v3(results.get("v3"))},
        "worst": [{"world": w, "account": x["account"], "reallyMule": x["role"] == "mule", "muleScore": x["muleScore"],
                   "tracedPaise": x["traced"], "reasons": x["reasons"]} for w, x in worst],
        "memo": {"policyId": memo["policyId"], "policyStatus": memo["policyStatus"], "sources": memo["sources"],
                 "cases": [c for c in memo["cases"] if c["account"] in MEMO_ACCOUNTS]},
        "provenance": {"commit": _git_commit(), "demoSha256": "", "policyId": memo["policyId"],
                       "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
    }


def _v3(v3: dict | None) -> dict | None:
    if not v3:
        return None
    return {"verdict": v3["verdict"], "sentence": v3["sentence"], "marginPoints": round(v3["marginPoints"], 2),
            "passMarkPoints": v3["passMarkPoints"], "headline": {k: round(v, 2) for k, v in v3["headline"].items()},
            "high": {k: {n: [round(x, 2) for x in t] for n, t in row.items()} for k, row in v3["table"]["high"].items()},
            "lock": "pipeline/configs/v3_split.lock"}


def export_demo(out: Path = OUT) -> Path:
    write_memo()
    d = build_demo()
    body = json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    d["provenance"]["demoSha256"] = hashlib.sha256(body.encode()).hexdigest()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return out


if __name__ == "__main__":
    print(f"demo.json -> {export_demo()}")
