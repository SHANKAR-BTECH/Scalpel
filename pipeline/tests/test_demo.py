from scalpel_sim.demo import STORY_MULE, STORY_NEXT, make_demo
from scalpel_sim.export import FORBIDDEN_KEYS
from scalpel_sim.tracing import rupees
from scalpel_model.features import traced_accounts
from test_tiny import all_keys


def test_demo_is_small_with_three_campaigns_including_the_story():
    world, truth = make_demo()
    assert 180 <= len(world["accounts"]) <= 220
    assert len(truth["campaigns"]) == 3
    assert truth["campaigns"][-1]["id"] == "STORY"


def test_story_mule_holds_the_golden_30000():
    world, truth = make_demo()
    t = traced_accounts(world)
    assert t[STORY_MULE] == rupees(30_000)
    assert t[STORY_NEXT] == rupees(20_000)
    assert truth["victimMoneyAtCutoff"][STORY_MULE] == rupees(30_000)


def test_demo_world_has_no_answers():
    world, _ = make_demo()
    assert not {k.lower() for k in all_keys(world)} & FORBIDDEN_KEYS
