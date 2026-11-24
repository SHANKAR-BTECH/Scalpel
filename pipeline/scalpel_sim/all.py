"""One command for the whole of phase 2:  python -m scalpel_sim.all   (run inside pipeline/)

1. builds the fake worlds (v1, five locked v2 worlds, the same v2 worlds with noisier phone signals) into out/
2. builds the demo world into demo/
3. trains the AI on v1 and writes its assessments into every world folder (it never sees v2's answers)
4. runs the TypeScript engine on every world (holds 0/A/B/C and the officer's to-do orders)
5. marks everything against the hidden answers and writes RESULTS.md and results.json
"""
from __future__ import annotations

from pathlib import Path

PIPE = Path(__file__).resolve().parents[1]


def main() -> None:
    from scalpel_grade import report
    from scalpel_model.train import TOO_EASY_AUC, V1_TRAIN_SEEDS, train_models, write_assessments
    from .config import v1_config
    from .demo import make_demo
    from .export import write_world
    from .make_world import build_all
    from .world import make_world

    out = PIPE / "out"
    print("1/5 building fake worlds ...")
    build_all(out)
    print("2/5 building the demo world ...")
    write_world(PIPE / "demo", *make_demo())
    print("3/5 training on v1 ...")
    models = train_models([make_world(v1_config().with_seed(s)) for s in V1_TRAIN_SEEDS])
    for name, m in models.items():
        flag = "  (TOO EASY alarm: see RESULTS.md section 7)" if m.holdout_auc > TOO_EASY_AUC else ""
        print(f"    {name}: AUC on unseen world {m.holdout_world} = {m.holdout_auc:.3f}{flag}")
    write_assessments(out, models)
    write_assessments(PIPE, models)  # pipeline/demo/world
    print("4/5 running the engine on every world ...")
    folders = sorted(p.parent for p in out.glob("v*-s*/world"))
    report.run_engine_all(folders + [PIPE / "demo"])
    print("5/5 marking ...")
    report.main(run_engine=False)


if __name__ == "__main__":
    main()
