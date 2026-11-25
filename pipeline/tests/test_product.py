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
