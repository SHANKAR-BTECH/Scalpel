from scalpel_sim.compare import world_row, worlds_markdown
from scalpel_sim.config import v1_config
from scalpel_sim.world import make_world


def test_world_row_has_the_honesty_numbers():
    w, t = make_world(v1_config().scaled(0.2))
    r = world_row(w, t)
    for k in ["accounts", "mules", "shields", "complaints", "reportRate", "rescueShare", "ruleRecall", "rulePrecision", "signsPerMule", "signsPerShield"]:
        assert k in r
    md = worlds_markdown([r, r])
    assert md.count("\n|") >= 3
