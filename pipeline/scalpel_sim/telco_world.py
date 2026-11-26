"""Telco-A's own records for the website's SIM trace workbench.

world.json holds only what links Telco-A to the bank (the scam calls, the SIM boxes, the phones on bank accounts).
A real telecom engineer works from much more: the KYC record behind every SIM and the shop (point of sale) that
activated it, the handset model from the IMEI, which handsets a SIM has sat in, towers, recharges, ordinary
customers' traffic both ways, the switch log that shows the caller ID a call carried, the routes and who else uses
them, registered business senders (DLT), citizen spam reports (Chakshu) and police letters on file.

This script builds those records around world.json, seeded, so every lookup on the website reads one file and the
numbers agree everywhere. It adds the two lookalikes as real records too: a delivery company's SIM bank (BIZ-1) with
two-way business traffic, and a hospital's reminder line (SPAM-1).

Nothing here says who is a fraudster. The engineer has to find it.

Run: python -m scalpel_sim.telco_world   (reads apps/web/data/world.json, writes apps/web/data/telco.json)
"""
from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

SEED = 2612
ROOT = Path(__file__).resolve().parents[2]
WORLD = ROOT / "apps" / "web" / "data" / "world.json"
OUT = ROOT / "apps" / "web" / "data" / "telco.json"

DAY = 86_400_000
MIN = 60_000

FIRST = ["Aarav", "Priyanka", "Rohit", "Sunita", "Kiran", "Anil", "Meena", "Deepak", "Neha", "Rahul", "Pooja", "Vijay",
         "Lakshmi", "Arjun", "Fatima", "Manoj", "Ravi", "Geeta", "Divya", "Sanjay", "Rekha", "Naveen", "Gopal", "Anjali",
         "Prakash", "Usha", "Farhan", "Swati", "Mohan", "Bhavna", "Karthik", "Tenzin", "Shalini", "Venkat", "Zoya", "Hema"]
LAST = ["Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Khan", "Singh", "Das", "Gupta", "Joshi", "Menon", "Rao",
        "Kulkarni", "Banerjee", "Mishra", "Yadav", "Bose", "Shetty", "Ansari", "Thomas", "Saxena", "Hegde", "Pandey"]

# Districts with a few towers each. Rig towers come from world.json.
DISTRICTS = [("Gaya", "BR"), ("Nalanda", "BR"), ("Patna", "BR"), ("Pune", "MH"), ("Mumbai Suburban", "MH"),
             ("Bengaluru Urban", "KA"), ("Mysuru", "KA"), ("Lucknow", "UP"), ("Kanpur Nagar", "UP"), ("New Delhi", "DL"),
             ("Kolkata", "WB"), ("Chennai", "TN"), ("Hyderabad", "TS"), ("Jaipur", "RJ"), ("Indore", "MP")]
SHOP_WORDS = ["Mobile Point", "Telecom", "Communication", "Mobile Zone", "Recharge Centre", "Mobiles & Repairs", "Digital"]
SHOP_OWNERS = ["Sai", "Shree Ganesh", "Raj", "New India", "Maa Durga", "Royal", "Star", "City", "Balaji", "Kaveri", "Lucky", "Om"]

# Handset models by the first 8 digits of the IMEI (the type allocation code).
TAC = {
    "00231309": ("Multi-SIM VoIP gateway (32 SIM slots)", "gateway"),
    "00258762": ("Multi-SIM VoIP gateway (16 SIM slots)", "gateway"),
    "00058752": ("Basic dual-SIM feature phone", "phone"),
    "00612077": ("Enterprise SIM bank (32 slots, registered to the operator's enterprise desk)", "gateway"),
    "00150683": ("Android smartphone", "phone"),
    "00790063": ("Android smartphone", "phone"),
}
PHONE_MODELS = ["Android smartphone", "Android smartphone", "Android smartphone", "iPhone", "Basic dual-SIM feature phone"]


def h(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest()[:12], 16)


def norm(n: str) -> str:
    d = "".join(c for c in n if c.isdigit())
    return d[2:] if len(d) == 12 and d.startswith("91") else d


def fmt(d10: str) -> str:
    return f"+91 {d10[:5]} {d10[5:]}"


def build() -> dict:
    w = json.loads(WORLD.read_text(encoding="utf-8"))
    rng = random.Random(SEED)
    now = w["now"]
    first_call = min(c["at"] for c in w["calls"])
    used = {norm(p["msisdn"]) for p in w["phones"]} | {norm(v["phone"]) for v in w["victims"]}
    for r in w["rigs"]:
        used |= {norm(s["msisdn"]) for s in r["sims"]}
    for s in w["soloSims"]:
        used.add(norm(s["msisdn"]))

    def new_number(prefix: str = "0") -> str:
        while True:
            d = prefix + "".join(str(rng.randrange(10)) for _ in range(10 - len(prefix)))
            if d[0] == "0":  # an Indian mobile number starts with 6-9 (same mapping as product.py)
                d = "6789"[sum(map(int, d[1:])) % 4] + d[1:]
            if d not in used:
                used.add(d)
                return fmt(d)

    def person() -> str:
        return f"{rng.choice(FIRST)} {rng.choice(LAST)}"

    docs_used: set[int] = set()

    def doc() -> str:
        while True:  # masked Aadhaar-style ID: only the last 4 digits; each person has their own
            k = rng.randrange(1000, 9999)
            if k not in docs_used:
                docs_used.add(k)
                return f"XXXX XXXX {k}"

    # ---- towers ----
    towers: list[dict] = []
    for i, (dist, st) in enumerate(DISTRICTS):
        for k in range(3):
            towers.append({"id": f"TA-{st}-{(h(dist + str(k)) % 900) + 100:04d}", "district": dist, "state": st})
    rig_tower = {}
    for r in w["rigs"]:
        dist = {"TA-BR-0747": "Gaya", "TA-BR-0788": "Nalanda", "TA-BR-0682": "Gaya"}.get(r["cell"], "Patna")
        towers.append({"id": r["cell"], "district": dist, "state": r["state"]})
        rig_tower[r["imei"]] = r["cell"]
    towers.append({"id": "TA-KA-0112", "district": "Bengaluru Urban", "state": "KA"})
    towers.append({"id": "TA-MH-0410", "district": "Pune", "state": "MH"})
    tower_ids = {t["id"] for t in towers}
    towers = [t for i, t in enumerate(towers) if t["id"] not in {x["id"] for x in towers[:i]}]
    by_district: dict[str, list[str]] = {}
    for t in towers:
        by_district.setdefault(t["district"], []).append(t["id"])

    # ---- shops (points of sale) ----
    shops: list[dict] = []
    for i in range(14):
        dist, st = DISTRICTS[i % len(DISTRICTS)]
        shops.append({"pos": f"POS-{st}-{1000 + h('pos' + str(i)) % 9000}", "name": f"{SHOP_OWNERS[i % len(SHOP_OWNERS)]} {SHOP_WORDS[i % len(SHOP_WORDS)]}",
                      "district": dist, "state": st, "verified": True, "agent": person()})
    rogue = [
        {"pos": "POS-BR-4471", "name": "Sai Mobile Point", "district": "Gaya", "state": "BR", "verified": True, "agent": "Mukesh Paswan"},
        {"pos": "POS-BR-5209", "name": "New Star Telecom", "district": "Nalanda", "state": "BR", "verified": False, "agent": "Raju Kumar"},
    ]
    enterprise = {"pos": "ENT-KA-0001", "name": "Telco-A Enterprise Desk, Bengaluru", "district": "Bengaluru Urban", "state": "KA", "verified": True, "agent": "Telco-A staff"}
    genuine_swap_shop = shops[3]
    shops += rogue + [enterprise]

    subs: dict[str, dict] = {}   # key: 10-digit number

    def add_sub(n: str, **kw) -> dict:
        k = norm(n)
        hh = h(k)
        rec = {"msisdn": n, "iccid": f"8991 05{hh % 10**8:08d} {h(k + 'i') % 10**5:05d}", "imsi": f"404 45 {h(k + 's') % 10**10:010d}",
               "plan": "Prepaid", "status": "Active", "forwarding": None, "swaps": [], "recharges": [], "chakshu": 0, "dlt": None, "police": None}
        rec.update(kw)
        subs[k] = rec
        return rec

    attach: list[dict] = []      # which handset each SIM sat in, and when
    cdr: list[dict] = []         # extra call records (world.json's scam calls are added on the website side)
    switch: list[dict] = []      # presented caller ID per call, for calls that carried one other than the SIM's own

    # ---- rigs: SIMs bought in batches at one shop on a few ID documents ----
    rig_docs: dict[str, list[str]] = {}
    rig_shop = {"RIG-1": rogue[0], "RIG-2": rogue[1], "RIG-3": rogue[0]}
    for r in w["rigs"]:
        shop = rig_shop.get(r["id"], rogue[0])
        docs = [doc() for _ in range(max(2, len(r["sims"]) // 9))]
        rig_docs[r["id"]] = docs
        for j, s in enumerate(r["sims"]):
            # a few SIMs came from a clean shop to muddy the picture
            pos = shops[(j * 7) % 14]["pos"] if j % 11 == 5 else shop["pos"]
            add_sub(s["msisdn"], kycName=s["kycName"], kycDoc=docs[j % len(docs)], pos=pos, activatedAt=s["activatedAt"],
                    recharges=[{"at": s["activatedAt"] + DAY * k * 28, "amount": 29900, "pos": shop["pos"], "payRef": f"UPI-{h(r['id'] + str(k)) % 10**6:06d}"} for k in range(3)])
            attach.append({"msisdn": s["msisdn"], "imei": r["imei"], "from": s["activatedAt"] + DAY, "to": None})
        # bulk traffic: the box dials all day from one tower; world.json carries only the calls that reached victims
        rig_calls = [c["at"] for c in w["calls"] if c["imei"] == r["imei"]]
        if rig_calls:
            d0, d1 = min(rig_calls) // DAY, max(rig_calls) // DAY
            busy = 70 if r["kind"] == "simbox" else 14
            for d in range(d0, d1 + 1):
                for _ in range(busy + rng.randrange(busy // 2)):
                    s = r["sims"][rng.randrange(len(r["sims"]))]
                    cdr.append({"id": f"BG{len(cdr)+1:05d}", "at": d * DAY + rng.randrange(DAY), "from": s["msisdn"], "to": new_number(),
                                "seconds": rng.randrange(8, 75) if rng.random() < 0.8 else rng.randrange(75, 400), "imei": r["imei"], "cell": r["cell"]})
        # a trickle of incoming calls (missed call-backs) so "almost none" is measured, not assumed
        for k in range(max(1, len(r["sims"]) // 15)):
            s = r["sims"][k * 3 % len(r["sims"])]
            at = first_call + rng.randrange(40) * DAY + rng.randrange(DAY)
            cdr.append({"id": f"BG{len(cdr)+1:05d}", "at": at, "from": new_number(), "to": s["msisdn"], "seconds": rng.randrange(0, 9), "imei": r["imei"], "cell": r["cell"]})

    # ---- solo SIMs (swapped) ----
    for i, s in enumerate(w["soloSims"]):
        long_owner = i == 1
        owner = person()
        old_imei = f"35{h(s['msisdn']) % 10**13:013d}"
        if long_owner:
            add_sub(s["msisdn"], kycName=owner, kycDoc=doc(), pos=genuine_swap_shop["pos"], activatedAt=now - 9 * 365 * DAY,
                    swaps=[{"at": s["swappedAt"], "pos": rogue[1]["pos"], "reason": "Lost SIM, replacement"}],
                    recharges=[{"at": now - k * 30 * DAY, "amount": 23900, "pos": genuine_swap_shop["pos"], "payRef": f"AUTO-{k}"} for k in range(1, 7)])
            attach.append({"msisdn": s["msisdn"], "imei": old_imei, "from": now - 3 * 365 * DAY, "to": s["swappedAt"]})
            dist = genuine_swap_shop["district"]
            for k in range(40):  # nine years of a normal life: calls both ways, moving between towers
                at = now - rng.randrange(60) * DAY - rng.randrange(DAY)
                if at > s["swappedAt"]:
                    continue
                inc = rng.random() < 0.45
                other = new_number()
                cdr.append({"id": f"BG{len(cdr)+1:05d}", "at": at, "from": other if inc else s["msisdn"], "to": s["msisdn"] if inc else other,
                            "seconds": rng.randrange(20, 600), "imei": old_imei, "cell": rng.choice(by_district[dist])})
        else:
            add_sub(s["msisdn"], kycName=person(), kycDoc=doc(), pos=rogue[1]["pos"], activatedAt=s["swappedAt"] - 12 * DAY,
                    swaps=[{"at": s["swappedAt"], "pos": rogue[1]["pos"], "reason": "Lost SIM, replacement"}])
        attach.append({"msisdn": s["msisdn"], "imei": s["imei"], "from": s["swappedAt"], "to": None})

    # ---- phones on bank accounts (Telco-A) ----
    accounts = {a["id"]: a for a in w["accounts"]}
    rig_imeis = {r["imei"] for r in w["rigs"]}
    fwd_phone = None
    for p in w["phones"]:
        if p["telco"] != "Telco-A":
            continue
        a = accounts.get(p["account"])
        name = a["holder"]["name"] if a else person()
        dist = next((d for d, st in DISTRICTS if a and st == a["holder"]["state"]), rng.choice(DISTRICTS)[0])
        rec = add_sub(p["msisdn"], kycName=name, kycDoc=doc(), pos=rng.choice(shops[:14])["pos"], activatedAt=now - rng.randrange(40, 2500) * DAY,
                      forwarding=("+91 70019 4" + f"{h(p['msisdn']) % 10000:04d}") if p["forwarding"] else None,
                      swaps=[{"at": p["swappedAt"], "pos": rng.choice(shops[:14])["pos"], "reason": "Lost SIM, replacement"}] if p.get("swappedAt") else [])
        if p["imei"] in rig_imeis:  # a bank-account phone is an ordinary handset of its own, not a slot in the box
            p = {**p, "imei": f"86{h(p['msisdn'] + 'own') % 10**13:013d}"}
        attach.append({"msisdn": p["msisdn"], "imei": p["imei"], "from": rec["activatedAt"], "to": None})
        if fwd_phone is None and p["forwarding"] and p["fri"] == "LOW" and ((a or {}).get("score") or {}).get("muleScore", 0) >= 0.9:
            fwd_phone = p
        for k in range(8):
            at = now - rng.randrange(30) * DAY - rng.randrange(DAY)
            inc = rng.random() < 0.4
            other = new_number()
            cdr.append({"id": f"BG{len(cdr)+1:05d}", "at": at, "from": other if inc else p["msisdn"], "to": p["msisdn"] if inc else other,
                        "seconds": rng.randrange(10, 400), "imei": p["imei"], "cell": rng.choice(by_district.get(dist, by_district["Patna"]))})
    if fwd_phone:
        subs[norm(fwd_phone["msisdn"])]["police"] = {
            "from": "Inspector, Cyber Crime Police Station", "ref": f"CCPS/{h('fwd') % 900 + 100}/2026", "at": now - 3 * DAY,
            "text": "Keep this line live and preserve its records. Do not disconnect or alert the subscriber: the number it forwards to is under watch.",
        }

    # ---- BIZ-1: a delivery company's registered SIM bank ----
    biz_imei = "006120774318842"
    biz_sims = []
    for i in range(24):
        n = fmt(f"80471{82011 + i:05d}")
        biz_sims.append(n)
        add_sub(n, kycName="Swift Parcel Logistics Pvt Ltd", kycDoc="Company PAN AAXCS••••K", pos=enterprise["pos"], plan="Enterprise (business connection)",
                activatedAt=now - 400 * DAY + i * DAY, endUser=f"Delivery agent: {person()}", dlt={"header": "SWFTPL", "entity": "Swift Parcel Logistics Pvt Ltd", "type": "Transactional"})
        attach.append({"msisdn": n, "imei": biz_imei, "from": now - 380 * DAY, "to": None})
    customers = [new_number() for _ in range(320)]
    for k in range(2140):
        at = now - rng.randrange(7) * DAY - rng.randrange(9 * 3600_000, 20 * 3600_000)
        inc = rng.random() < 0.08
        sim = biz_sims[k % 24]
        cust = customers[k % len(customers)]
        cdr.append({"id": f"BZ{k+1:05d}", "at": at, "from": cust if inc else sim, "to": sim if inc else cust,
                    "seconds": rng.randrange(25, 140), "imei": biz_imei, "cell": "TA-KA-0112"})

    # ---- SPAM-1: a hospital's reminder line ----
    hosp = "+91 20 4477 0812"  # a Pune landline (STD 020), not a mobile
    add_sub(hosp, kycName="City Care Hospital", kycDoc="Company PAN AAACC••••H", pos=enterprise["pos"], plan="Enterprise PRI line", activatedAt=now - 2200 * DAY,
            chakshu=14, dlt={"header": "CCHPUN", "entity": "City Care Hospital, Pune", "type": "Transactional (SMS reminders)"})
    patients = [new_number() for _ in range(900)]
    for k in range(1260):
        at = now - rng.randrange(7) * DAY - rng.randrange(9 * 3600_000, 18 * 3600_000)
        inc = rng.random() < 0.12
        p = patients[k % len(patients)]
        cdr.append({"id": f"HS{k+1:05d}", "at": at, "from": p if inc else hosp, "to": hosp if inc else p,
                    "seconds": rng.randrange(20, 60) if not inc else rng.randrange(30, 200), "imei": "PRI-TRUNK-PUNE-01", "cell": "TA-MH-0410"})

    # ---- ordinary subscribers so lookups are never only fraud ----
    for k in range(60):
        n = new_number()
        dist, st = rng.choice(DISTRICTS)
        imei = f"35{h(n) % 10**13:013d}"
        add_sub(n, kycName=person(), kycDoc=doc(), pos=rng.choice(shops[:14])["pos"], activatedAt=now - rng.randrange(100, 3000) * DAY)
        attach.append({"msisdn": n, "imei": imei, "from": now - 500 * DAY, "to": None})
        for j in range(10):
            at = now - rng.randrange(40) * DAY - rng.randrange(DAY)
            inc = rng.random() < 0.5
            other = new_number()
            cdr.append({"id": f"BG{len(cdr)+1:05d}", "at": at, "from": other if inc else n, "to": n if inc else other,
                        "seconds": rng.randrange(10, 900), "imei": imei, "cell": rng.choice(by_district[dist])})

    # ---- the switch log: the caller ID each scam call carried, and where it entered ----
    rig_by_imei = {r["imei"]: r for r in w["rigs"]}
    for c in w["calls"]:
        r = rig_by_imei.get(c["imei"])
        switch.append({"call": c["id"], "at": c["at"], "originSim": c["realSim"], "presented": c["shownCaller"],
                       "entry": r["route"] if r and r["route"] else "Local radio network", "imei": c["imei"]})

    # ---- routes ----
    routes = []
    for r in w["rigs"]:
        if not r["route"]:
            continue
        lines = [{"owner": o, "kind": "Registered business trunk"} for o in ["Gaya District Hospital helpline", "Magadh Gramin Bank call centre"][: r["genuineLinesOnRoute"]]]
        routes.append({"id": r["route"], "lines": lines, "devices": [r["imei"]]})

    # ---- cells for world.json's scam calls (the website joins these by call id) ----
    call_cell = {}
    for c in w["calls"]:
        if c["imei"] in rig_tower:
            call_cell[c["id"]] = rig_tower[c["imei"]]
        else:
            call_cell[c["id"]] = rng.choice(by_district["Patna"] + by_district["Nalanda"])

    # ---- the person whose ID was stolen (added last, on its own random stream, so nothing above changes) ----
    # The gang bought most of RIG-3's SIMs on one real person's Aadhaar. That person has had their own SIM on it
    # for six years, from a clean shop, with an ordinary two-way life. A "block every SIM on this ID" sweep cuts
    # them off: the analyst has to spot them, and the server refuses a group action that includes them.
    r2 = random.Random(SEED + 1)
    if "RIG-3" in rig_docs:
        counts: dict[str, int] = {}
        for x in subs.values():
            if x["kycDoc"] in rig_docs["RIG-3"]:
                counts[x["kycDoc"]] = counts.get(x["kycDoc"], 0) + 1
        stolen = max(counts, key=lambda k: counts[k])
        n = "+91 94311 27608"
        assert norm(n) not in used
        imei = f"35{h(n) % 10**13:013d}"
        home = shops[2]
        add_sub(n, kycName="Lakshmi Kumari", kycDoc=stolen, pos=home["pos"], activatedAt=now - 6 * 365 * DAY - 40 * DAY, plan="Postpaid",
                recharges=[{"at": now - k * 30 * DAY, "amount": 39900, "pos": home["pos"], "payRef": f"BILL-{k}"} for k in range(1, 5)])
        attach.append({"msisdn": n, "imei": imei, "from": now - 2 * 365 * DAY, "to": None})
        for k in range(36):
            at = now - r2.randrange(45) * DAY - r2.randrange(DAY)
            inc = r2.random() < 0.5
            other = fmt("9" + "".join(str(r2.randrange(10)) for _ in range(9)))
            cdr.append({"id": f"ID{k+1:05d}", "at": at, "from": other if inc else n, "to": n if inc else other,
                        "seconds": r2.randrange(20, 700), "imei": imei, "cell": r2.choice(by_district[home["district"]])})

    tac = {k: {"model": m, "kind": kind} for k, (m, kind) in TAC.items()}
    return {
        "schema": 1, "seed": SEED, "note": "Telco-A's own records (fictional). Built by pipeline/scalpel_sim/telco_world.py around world.json.",
        "towers": sorted(towers, key=lambda t: t["id"]), "shops": shops, "subscribers": sorted(subs.values(), key=lambda s: s["msisdn"]),
        "attach": attach, "cdr": sorted(cdr, key=lambda c: c["at"]), "switch": switch, "routes": routes, "callCell": call_cell, "tac": tac,
        "phoneModels": PHONE_MODELS,
    }


def main() -> None:
    out = build()
    text = json.dumps(out, sort_keys=True, separators=(",", ":"))
    OUT.write_text(text + "\n", encoding="utf-8")
    print(f"{OUT}: {len(out['subscribers'])} SIMs, {len(out['cdr'])} extra call records, {len(out['shops'])} shops, {len(out['towers'])} towers, {len(text) // 1024} KB")


if __name__ == "__main__":
    main()
