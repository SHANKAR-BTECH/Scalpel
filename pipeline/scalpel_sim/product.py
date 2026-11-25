"""The product world for the website: Bharat Demo Bank and Telco-A, with named people.

Built from the same simulator the research used (make_world), then dressed for a product demo:
names, police hold requests, victims' complaints, the scam calls behind them, and the phones that made
those calls (a SIM box with 47 SIMs, a handset with many SIMs, spoofed caller IDs).

The mule-score model (logistic regression, trained on v1 worlds exactly as in scalpel_model.train) scores it.

Only what the bank and the telecom company can see is written out. The answers (who really is a mule, which
scam ring a victim belongs to) are used only to generate the world and are never exported: the website links
cases itself from shared accounts and shared phones, and never sees a role.

Run: python -m scalpel_sim.product   (writes apps/web/data/world.json)
"""
from __future__ import annotations

import hashlib
import json
import random
from dataclasses import replace
from pathlib import Path

from .config import v1_config
from .export import FORBIDDEN_KEYS
from .world import DAY, HOUR, MIN, make_world

SEED = 2611
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "data" / "world.json"

FIRST = ["Aarav", "Priyanka", "Rohit", "Sunita", "Kiran", "Anil", "Meena", "Deepak", "Kavita", "Suresh", "Neha", "Rahul",
         "Pooja", "Vijay", "Lakshmi", "Arjun", "Fatima", "Joseph", "Harpreet", "Manoj", "Asha", "Ravi", "Geeta", "Imtiaz",
         "Divya", "Sanjay", "Rekha", "Naveen", "Shabana", "Gopal", "Anjali", "Prakash", "Usha", "Farhan", "Swati", "Mohan",
         "Bhavna", "Karthik", "Nirmala", "Tenzin", "Ramesh", "Shalini", "Venkat", "Zoya", "Dinesh", "Hema", "Abdul", "Sarita"]
LAST = ["Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Khan", "Singh", "Das", "Gupta", "Joshi", "Menon", "Rao",
        "Pillai", "Kulkarni", "Banerjee", "Chauhan", "Mishra", "Fernandes", "Yadav", "Bose", "Shetty", "Ansari", "Thomas",
        "Saxena", "Gill", "Hegde", "Pandey", "Mehta", "Sinha"]
SHOP = ["Tailors", "Mobile Store", "Kirana", "Medicals", "Sweets", "Hardware", "Electricals", "Jewellers", "Stationers",
        "Fresh Fruits", "Footwear", "Xerox Centre", "Bakery", "Auto Parts", "Opticals"]
CITIES = [("Indore", "MP"), ("Bhopal", "MP"), ("Pune", "MH"), ("Nagpur", "MH"), ("Lucknow", "UP"), ("Kanpur", "UP"),
          ("Jaipur", "RJ"), ("Bengaluru", "KA"), ("Mysuru", "KA"), ("Kochi", "KL"), ("Chennai", "TN"), ("Hyderabad", "TS"),
          ("Ahmedabad", "GJ"), ("Kolkata", "WB"), ("Patna", "BR"), ("Delhi", "DL"), ("Chandigarh", "CH"), ("Bhubaneswar", "OD")]
OTHER_BANKS = ["Coastal Demo Bank", "Northern Demo Bank", "Union Demo Co-op Bank", "Metro Demo Bank"]
TELCOS = ["Telco-A", "Telco-A", "Telco-B", "Telco-C"]
SCAM_TEXT = {
    "digital_arrest": "Caller said he was from the police and that I was under 'digital arrest'. Told me to pay to clear my name.",
    "investment": "Added to a share-trading group that showed big profits. Paid to buy 'IPO shares', could not withdraw.",
    "kyc_update": "Got a call from my 'bank' saying my KYC had expired. Paid a 'verification fee' to keep the account open.",
    "part_time_job": "Offered a part-time job liking videos. Paid a 'deposit' to unlock bigger tasks.",
}
SCAM_LABEL = {"digital_arrest": "Digital arrest", "investment": "Fake investment", "kyc_update": "Fake KYC update",
              "part_time_job": "Task / part-time job"}


def _ack(rng: random.Random) -> str:
    return "3" + "".join(str(rng.randint(0, 9)) for _ in range(13))  # 14 digits, like an NCRP acknowledgement


def build(seed: int = SEED) -> dict:
    cfg = replace(v1_config(), name="product", seed=seed, id_prefix="P", n_accounts=1400, campaigns=9,
                  mule_share=0.05, shield_share=0.03, report_rate=(0.65, 0.85), report_delay_hours=(0, 36),
                  hops=(3, 4))
    world, truth = make_world(cfg)
    rng = random.Random(seed * 31 + 7)
    c = world["cutoff"]
    phones = {p["account"]: p for p in world["phones"]}
    used_numbers = {p["msisdn"] for p in world["phones"]}

    def number() -> str:
        while True:
            m = f"+91 0{rng.randint(0, 9999):04d} {rng.randint(0, 99999):05d}"
            if m not in used_numbers:
                used_numbers.add(m)
                return m

    def imei() -> str:
        return "00" + "".join(str(rng.randint(0, 9)) for _ in range(13))

    # ---- scam rings (generation only: never exported) ----
    camps = truth["campaigns"]
    first_hop = {m: i for i, k in enumerate(camps) for m in k["chain"][0]}
    txn_by_id = {t["id"]: t for t in world["txns"]}
    comp_ring = {}
    for comp in world["complaints"]:
        t = txn_by_id.get(comp["txnId"])
        if t and t["to"] in first_hop:
            comp_ring[comp["id"]] = first_hop[t["to"]]

    # Calling rigs. Rig 1 is the big SIM box shared by three rings: "Find the Phone" links them.
    rig_plan = [("simbox", 47, [0, 1, 2]), ("handset", 9, [3, 4]), ("simbox", 18, [5, 6])]
    rigs, rig_of_ring = [], {}
    for n, (kind, sims, rings) in enumerate(rig_plan, start=1):
        rid = f"RIG-{n}"
        state = rng.choice(["JH", "WB", "BR", "RJ", "HR", "AS"])
        rig = {"id": rid, "kind": kind, "imei": imei(), "cell": f"TA-{state}-{rng.randint(100, 999):04d}", "state": state,
               "sims": [{"msisdn": number(), "telco": "Telco-A", "activatedAt": c - rng.randint(3, 40) * DAY,
                         "kycName": f"{rng.choice(FIRST)} {rng.choice(LAST)}"} for _ in range(sims)],
               "route": f"Gateway route TA-GW-{rng.randint(10, 99)}" if kind == "simbox" else None,
               "genuineLinesOnRoute": (rng.choice([0, 0, 2]) if kind == "simbox" else 0)}
        rigs.append(rig)
        for r in rings:
            rig_of_ring[r] = rig
    # Rings without a rig call from one ordinary SIM that was swapped recently.
    solo = {}
    for r in range(len(camps)):
        if r not in rig_of_ring:
            solo[r] = {"msisdn": number(), "telco": "Telco-A", "imei": imei(), "swappedAt": c - rng.randint(10, 60) * HOUR}

    # Two first-hop mule accounts in ring 0 registered SIMs from the big SIM box as their own mobile number.
    rig1 = rigs[0]
    for k, m in enumerate(camps[0]["chain"][0][:2]):
        sim = rig1["sims"][k]
        phones[m]["msisdn"], phones[m]["imei"] = sim["msisdn"], rig1["imei"]
        world["telecom"]["simbox"].append(sim["msisdn"])

    # Innocent people whose numbers get spoofed (shown on the victim's screen; their own phones never called).
    normals = sorted(a for a, r in truth["roles"].items() if r == "normal")
    spoof_owner = rng.choice(normals)
    police_number = phones[spoof_owner]["msisdn"]
    bank_helpline = "+91 1600 22 3344"  # a registered business series: never blockable (R5)

    # ---- people ----
    def person(group: str | None = None):
        city, st = rng.choice(CITIES)
        return {"name": f"{rng.choice(FIRST)} {rng.choice(LAST)}", "city": city, "state": st}

    holders = {}
    for a in world["accounts"]:
        p = person()
        if a["type"] == "CURRENT":
            p["business"] = f"{p['name'].split()[0]} {rng.choice(SHOP)}"
            p["group"] = "small_shop"
        elif a["type"] == "SALARY":
            p["group"] = "salaried"
        else:
            p["group"] = rng.choice(["salaried", "gig_worker", "student", "pensioner", "homemaker", "other"])
        holders[a["id"]] = p

    victims = {}
    calls = []
    for comp in world["complaints"]:
        t = txn_by_id[comp["txnId"]]
        v = person()
        v["phone"] = number()
        v["telco"] = rng.choice(TELCOS)
        v["bank"] = rng.choice(OTHER_BANKS)
        ring = comp_ring.get(comp["id"])
        scam = camps[ring]["scam"] if ring is not None else "investment"
        v["scam"] = scam
        victims[comp["victim"]] = v
        if ring is None:
            continue
        # 1-3 calls in the two hours before the payment
        for _ in range(rng.randint(1, 3)):
            at = t["at"] - rng.randint(5, 120) * MIN
            rig = rig_of_ring.get(ring)
            if rig:
                sim = rng.choice(rig["sims"][2:] if rig is rig1 else rig["sims"])
                real, handset = sim["msisdn"], rig["imei"]
            else:
                real, handset = solo[ring]["msisdn"], solo[ring]["imei"]
            shown = real
            if scam == "digital_arrest":
                shown = police_number
            elif scam == "kyc_update":
                shown = bank_helpline
            calls.append({"id": f"CL{len(calls) + 1:05d}", "at": at, "to": v["phone"], "shownCaller": shown,
                          "realSim": real, "imei": handset, "seconds": rng.randint(90, 2400)})

    # ---- accounts the reported victims' money reached (pro-rata, at least Rs 500), and their statements ----
    # Each account's history before victim money first arrived is folded into its opening balance, so the
    # website gets a short statement that still traces exactly the same.
    victim_txn = {comp["txnId"]: comp["victim"] for comp in world["complaints"]}
    acct_ids = {a["id"] for a in world["accounts"]}
    bal = {a["id"]: a["opening"] for a in world["accounts"]}
    taint: dict[str, int] = {}
    first_at: dict[str, int] = {}
    ordered = sorted(world["txns"], key=lambda t: (t["at"], t["id"]))
    for t in ordered:
        moved = 0
        if t["id"] in victim_txn:
            moved = t["amount"]
        elif t["from"] in acct_ids:
            b = bal[t["from"]]
            if b > 0 and taint.get(t["from"], 0) > 0:
                moved = min(taint[t["from"]], t["amount"] * taint[t["from"]] // b)
                taint[t["from"]] -= moved
        if t["from"] in acct_ids:
            bal[t["from"]] -= t["amount"]
        if t["to"] in acct_ids:
            bal[t["to"]] += t["amount"]
            if moved > 0:
                taint[t["to"]] = taint.get(t["to"], 0) + moved
                if moved >= 50_000 and t["to"] not in first_at:
                    first_at[t["to"]] = t["at"]
    reached = set(first_at)
    # One cut for everyone: the first victim payment. Before it, each reached account's history is folded into its
    # opening balance (no victim money existed yet, so the trace is unchanged); from it on, every txn is kept.
    cut = min(first_at.values())
    opening = {a["id"]: a["opening"] for a in world["accounts"]}
    case_txns = []
    for t in ordered:
        if t["from"] not in reached and t["to"] not in reached:
            continue
        if t["at"] >= cut:
            case_txns.append(t)
            continue
        if t["from"] in reached:
            opening[t["from"]] -= t["amount"]
        if t["to"] in reached:
            opening[t["to"]] += t["amount"]

    # ---- police hold requests: one per account the trail reaches, as a cyber cell would send ----
    inflow: dict[str, int] = {}
    for t in sorted(case_txns, key=lambda t: (t["at"], t["id"])):
        if t["to"] in reached and (t["id"] in victim_txn or t["from"] in reached):
            inflow[t["to"]] = inflow.get(t["to"], 0) + t["amount"]
    last_report = max(comp["reportedAt"] for comp in world["complaints"])
    requests = []
    for n, a in enumerate(sorted(reached)):
        st = rng.choice(["MP", "MH", "KA", "KL", "TS", "GJ", "RJ", "DL", "UP", "WB"])
        recv = min(c - rng.randint(5, 600) * MIN, last_report + rng.randint(30, 180) * MIN)
        whole = rng.random() < 0.12
        defect = rng.random() < 0.08
        requests.append({
            "id": f"PR-{n + 1:04d}", "receivedAt": recv, "basis": "BNSS_106",
            "issuer": {"name": f"{rng.choice(FIRST)} {rng.choice(LAST)}", "rank": rng.choice(["Sub-Inspector", "Inspector"]),
                       "station": f"Cyber Crime PS, {rng.choice([x for x, s in CITIES if s == st] or ['HQ'])}", "state": st},
            "signed": not defect, "signedAt": None if defect else recv - 20 * MIN,
            "ncrpAck": _ack(rng), "amountRequested": None if whole else inflow.get(a, 0),
            "asksWholeAccount": whole, "account": {"id": a, "branchState": holders[a]["state"]},
            "natureDeclared": "criminal", "magistrateIntimatedAt": recv + rng.randint(2, 20) * HOUR,
        })

    # ---- the mule-score model ----
    world["phones"] = list(phones.values())
    from scalpel_model.train import V1_TRAIN_SEEDS, assess, train_models
    from .signals import compute_signals
    models = train_models([make_world(v1_config().with_seed(s)) for s in V1_TRAIN_SEEDS])
    scored = assess(models["logistic"], world)["accounts"]
    signals = compute_signals(world)
    _plain_reasons(models["logistic"], world, signals, scored)

    telecom = world["telecom"]
    phone_rows = []
    for a in sorted(reached | {spoof_owner}):
        p = phones[a]
        m = p["msisdn"]
        swap = next((s["at"] for s in telecom["simSwaps"] if s["msisdn"] == m), None)
        phone_rows.append({"msisdn": m, "imei": p["imei"], "telco": "Telco-A", "account": a, "swappedAt": swap,
                           "forwarding": m in telecom["callForwarding"], "mnrl": m in telecom["mnrl"],
                           "fri": telecom["fri"].get(m, "LOW"), "simboxRoute": m in telecom["simbox"]})

    out = {
        "schema": "scalpel-product-world/1",
        "note": "Fictional. Built by pipeline/scalpel_sim/product.py from the Scalpel simulator. No real people, numbers or banks.",
        "seed": seed, "now": c,
        "bank": {"name": "Bharat Demo Bank", "code": "BDB"}, "telco": {"name": "Telco-A"},
        "accounts": [{**{k: a[k] for k in ("id", "type", "openedAt", "kycChangedAt")}, "opening": opening[a["id"]], "holder": holders[a["id"]],
                      "phone": phones[a["id"]]["msisdn"],
                      "score": (None if a["id"] not in scored else {"muleScore": scored[a["id"]]["muleScore"],
                                                                     "reasons": scored[a["id"]]["reasons"]}),
                      "signals": signals.get(a["id"], [])}
                     for a in world["accounts"] if a["id"] in reached],
        "txns": sorted(case_txns, key=lambda t: (t["at"], t["id"])),
        "complaints": [{"id": comp["id"], "ack": _ack(rng), "victim": comp["victim"], "txnId": comp["txnId"],
                        "reportedAt": comp["reportedAt"], "story": SCAM_TEXT[victims[comp["victim"]]["scam"]],
                        "scamType": SCAM_LABEL[victims[comp["victim"]]["scam"]]} for comp in world["complaints"]],
        "victims": [{"id": k, **{x: v[x] for x in ("name", "city", "state", "phone", "telco", "bank")}} for k, v in sorted(victims.items())],
        "requests": requests,
        "phones": phone_rows,
        "spoofedOwners": [{"msisdn": police_number, "account": spoof_owner, "holder": holders[spoof_owner]}],
        "protectedNumbers": [{"msisdn": bank_helpline, "owner": "Bharat Demo Bank customer helpline (registered 1600 series)"}],
        "rigs": [{k: v for k, v in r.items()} for r in rigs],
        "soloSims": sorted(solo.values(), key=lambda s: s["msisdn"]),
        "calls": sorted(calls, key=lambda x: (x["at"], x["id"])),
    }
    _check_no_answers(out)
    return out


BINARY = {"is_current", "is_salary", "sim_swap", "handset_farm", "call_forwarding", "mnrl", "fri_very_high", "simbox"}


def _plain_reasons(model, world: dict, signals: dict, scored: dict) -> None:
    """Three reasons that agree with the score's direction, phrased from the account's real value.

    reasons.py picks the sentence by the push's direction, which can read wrongly for a yes/no clue (a clue that is
    present but pulls the score down came out as "No call forwarding"). Here a yes/no clue is only used when it is
    present and pushes the same way as the score, so every sentence is true of the account.
    """
    from scalpel_model.features import FEATURES, build_features
    from scalpel_model.reasons import TEXT
    X = build_features(world, signals)
    contrib = model.contributions(X)
    for i, a in enumerate(X.index):
        if a not in scored:
            continue
        up = scored[a]["muleScore"] >= 0.5
        vals = X.iloc[i].to_dict()
        ranked = sorted(zip(FEATURES, contrib[i]), key=lambda fc: -abs(fc[1]))
        out = []
        for f, cval in ranked:
            if (cval > 0) != up or (f in BINARY and vals[f] < 0.5):
                continue
            out.append(TEXT[f][0 if up else 1](vals[f]))
            if len(out) == 3:
                break
        scored[a]["reasons"] = out


def _check_no_answers(obj, path="") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in FORBIDDEN_KEYS:
                raise ValueError(f"answer key {k!r} leaked at {path}")
            _check_no_answers(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _check_no_answers(v, f"{path}[{i}]")


def main() -> None:
    out = build()
    text = json.dumps(out, sort_keys=True, separators=(",", ":"))
    OUT.write_text(text + "\n", encoding="utf-8")
    print(f"{OUT}: {len(out['accounts'])} accounts, {len(out['complaints'])} complaints, {len(out['requests'])} requests, "
          f"{len(out['txns'])} txns, {len(out['calls'])} calls, {len(text) // 1024} KB, sha {hashlib.sha256(text.encode()).hexdigest()[:12]}")


if __name__ == "__main__":
    main()
