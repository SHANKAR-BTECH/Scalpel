"""Walking skeleton: tiny world -> engine (policies 0, A, B) -> marks.

Run from the repo root:  pipeline/.venv/bin/python -m scalpel_sim.skeleton   (with cwd=pipeline)
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from scalpel_grade.grade import grade_holds
from .export import read_json, write_world
from .tiny import make_tiny

REPO = Path(__file__).resolve().parents[2]


def run_engine(world_dir: Path, policy: str, out: Path, extra: list[str] | None = None) -> dict:
    cmd = ["npx", "-y", "pnpm@10.28.0", "--silent", "--filter", "@scalpel/sim-runner", "run", "world",
           str(world_dir), "--policy", policy, "--out", str(out), *(extra or [])]
    subprocess.run(cmd, cwd=REPO, check=True, capture_output=True, text=True)
    return read_json(out)


def main() -> None:
    root = REPO / "pipeline" / "out" / "tiny"
    world, truth = make_tiny(seed=1)
    write_world(root, world, truth)
    print(f"{'policy':<8}{'freeze ratio':>14}{'money missed':>16}{'innocent held':>16}{'wrongly held':>14}")
    for policy in ["0", "A", "B"]:
        d = run_engine(root / "world", policy, root / "decisions" / f"{policy}.json")
        g = grade_holds(d["rows"], truth)
        fr = g["freezeRatio"] if isinstance(g["freezeRatio"], str) else f"{g['freezeRatio']:.2f}x"
        print(f"{policy:<8}{fr:>14}{g['victimMoneyMissed'] / 100:>16,.0f}{g['innocentHeld'] / 100:>16,.0f}{g['peopleWronglyRestricted']:>14}")


if __name__ == "__main__":
    main()
