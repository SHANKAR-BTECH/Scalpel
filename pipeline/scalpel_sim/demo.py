"""The demo world for phase 3 screens and the "same 30 days, three ways" replay.

About 200 accounts, two generated scam campaigns, plus the phase 1 golden story dropped in by hand:
three victims pay one mule ₹80,000; it passes ₹25,000 on and cashes ₹37,500 out, leaving ₹30,000 of victim money.
"""
from __future__ import annotations

from dataclasses import replace

from .config import v1_config
from .tracing import rupees, trace
from .world import HOUR, MIN, make_world

STORY_MULE, STORY_NEXT = "D09001", "D09002"


def make_demo(seed: int = 7) -> tuple[dict, dict]:
    cfg = replace(v1_config(), name="demo", seed=seed, id_prefix="D", n_accounts=198, campaigns=2,
                  mule_share=0.06, shield_share=0.04)
    world, truth = make_world(cfg)
    c = world["cutoff"]
    start = c - 8 * HOUR
    world["accounts"] += [
        {"id": STORY_MULE, "type": "SAVINGS", "openedAt": c - 12 * 86_400_000, "kycChangedAt": c - 5 * 86_400_000, "opening": rupees(20_000)},
        {"id": STORY_NEXT, "type": "SAVINGS", "openedAt": c - 9 * 86_400_000, "kycChangedAt": None, "opening": 0},
    ]
    story = [("DSV1", "EXT-VICTIM-A", STORY_MULE, 60_000), ("DSV2", "EXT-VICTIM-B", STORY_MULE, 15_000),
             ("DSV3", "EXT-VICTIM-C", STORY_MULE, 5_000), ("DSH1", STORY_MULE, STORY_NEXT, 25_000),
             ("DSX1", STORY_MULE, "EXT-ATM", 37_500)]
    txns = [{"id": i, "at": start + n * 7 * MIN, "from": f, "to": t, "amount": rupees(r), "channel": "UPI" if n < 3 else "IMPS"}
            for n, (i, f, t, r) in enumerate(story)]
    world["txns"] = sorted(world["txns"] + txns, key=lambda t: (t["at"], t["id"]))
    world["complaints"] += [{"id": f"DSC{n}", "victim": f"VICTIM-{v}", "txnId": f"DSV{n}", "reportedAt": start + 2 * HOUR}
                            for n, v in ((1, "A"), (2, "B"), (3, "C"))]
    world["phones"] += [{"account": STORY_MULE, "msisdn": "+91 09999 00001", "imei": "000000000000001"},
                        {"account": STORY_NEXT, "msisdn": "+91 09999 00002", "imei": "000000000000002"}]
    world["telecom"]["simSwaps"].append({"msisdn": "+91 09999 00001", "at": c - 30 * HOUR})
    world["accounts"].sort(key=lambda a: a["id"])

    truth["roles"].update({STORY_MULE: "mule", STORY_NEXT: "mule"})
    truth["victimTxns"].update({"DSV1": "VICTIM-A", "DSV2": "VICTIM-B", "DSV3": "VICTIM-C"})
    truth["campaigns"].append({"id": "STORY", "scam": "digital_arrest", "chain": [[STORY_MULE], [STORY_NEXT]]})
    every = trace({a["id"]: a["opening"] for a in world["accounts"]}, world["txns"], truth["victimTxns"], as_of=c)
    truth["victimMoneyAtCutoff"] = {a: v["tainted"] for a, v in every.items() if v["tainted"] > 0}
    return world, truth


def main() -> None:
    from pathlib import Path
    from .export import write_world
    root = Path(__file__).resolve().parents[1] / "demo"
    world, truth = make_demo()
    write_world(root, world, truth)
    print(f"demo world -> {root}: {len(world['accounts'])} accounts, {len(truth['campaigns'])} campaigns")


if __name__ == "__main__":
    main()
