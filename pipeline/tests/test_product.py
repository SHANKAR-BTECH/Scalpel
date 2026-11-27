"""The website's product world: built from the simulator, scored by the mule-score model, no answers exported."""
from scalpel_sim.product import build


def test_product_world_has_cases_phones_and_no_answers():
    w = build()  # raises if any answer key (role, mule, campaign...) is in the output
    assert len(w["complaints"]) >= 50
    assert max(len(r["sims"]) for r in w["rigs"]) == 47
    assert all(c["shownCaller"] != c["realSim"] for c in w["calls"] if c["shownCaller"].startswith("+91 1600"))
    assert all(a["opening"] >= 0 for a in w["accounts"])
    scored = [a for a in w["accounts"] if a["score"]]
    assert scored and all(len(a["score"]["reasons"]) <= 3 for a in scored)


def test_every_score_explains_itself_with_five_true_clues():
    w = build()
    scored = [a for a in w["accounts"] if a["score"]]
    for a in scored:
        why = a["score"]["why"]
        assert len(why) == 5
        assert all(isinstance(x["clue"], str) and isinstance(x["push"], float) for x in why)
        assert [abs(x["push"]) for x in why] == sorted((abs(x["push"]) for x in why), reverse=True)
    # a yes/no clue is never phrased as present when it isn't: no account without call forwarding says it is on
    for a in scored:
        if "CALL_FORWARDING_ACTIVE" not in a["signals"]:
            assert not any(x["clue"] == "Call forwarding is switched on" for x in a["score"]["why"])
