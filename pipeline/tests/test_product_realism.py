"""The website's world must survive an expert reading raw rows (step 2 data fixes), without changing the trail."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
W = json.loads((ROOT / "apps/web/data/world.json").read_text())
T = json.loads((ROOT / "apps/web/data/telco.json").read_text())
DAY = 86_400_000


def test_trail_unchanged_by_realism_fixes():
    # Accounts, names, opening balances, every transaction's time/sender/amount and every complaint: as before step 2.
    fp = json.dumps([[a["id"], a["holder"]["name"], a["opening"]] for a in W["accounts"]]
                    + [[t["id"], t["at"], t["from"], t["amount"]] for t in W["txns"]]
                    + [[c["id"], c["txnId"]] for c in W["complaints"]])
    assert hashlib.sha256(fp.encode()).hexdigest()[:16] == "ee6bc74a53d4c6b4"


def test_phone_numbers_are_indian_mobiles():
    text = json.dumps(W) + json.dumps(T)
    nums = set(re.findall(r"\+91 \d{5} \d{5}", text))
    assert nums and all(n[4] in "6789" for n in nums)


def test_cash_out_goes_where_its_channel_says():
    want = {"ATM_CASH": "EXT-ATM", "CRYPTO": "EXT-CRYPTO", "GOLD": "EXT-GOLD", "CARD": "EXT-MERCHANT"}
    for t in W["txns"]:
        if t["channel"] in want:
            assert t["to"] == want[t["channel"]] and t["where"]


def test_no_call_before_its_sim_existed_and_nothing_dated_after_now():
    act = {s["msisdn"]: s["activatedAt"] for r in W["rigs"] for s in r["sims"]}
    assert all(c["at"] >= act[c["realSim"]] for c in W["calls"] if c["realSim"] in act)
    now = W["now"]
    for q in W["requests"]:
        assert q["receivedAt"] <= now and (q["magistrateIntimatedAt"] is None or q["magistrateIntimatedAt"] <= now)


def test_a_grey_zone_where_people_must_look():
    grey = [a for a in W["accounts"] if a["score"] and 0.4 <= a["score"]["muleScore"] <= 0.7]
    assert 10 <= len(grey) <= 15


def test_one_inspector_and_pensions():
    assert sum(q["issuer"]["name"] == "Dinesh Yadav" and q["issuer"]["rank"] == "Inspector" for q in W["requests"]) >= 3
    pens = [a for a in W["accounts"] if a["holder"]["group"] == "pensioner"]
    # Every pensioner whose account is older than the scam gets a monthly pension before it.
    paid = [a for a in pens if a.get("before", {}).get("kind") == "pension"]
    assert len(paid) >= 0.8 * len(pens)
