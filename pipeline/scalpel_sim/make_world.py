"""python -m scalpel_sim.make_world --version v1 [--seed N] [--out pipeline/out]"""
from __future__ import annotations

import argparse
from pathlib import Path

from .config import v1_config
from .export import write_world
from .world import make_world, rescue_share


def config_for(version: str, seed: int | None = None):
    if version == "v1":
        cfg = v1_config()
    elif version == "v2":
        from .configs.v2 import v2_config
        cfg = v2_config()
    else:
        raise SystemExit(f"unknown version {version}")
    return cfg if seed is None else cfg.with_seed(seed)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--version", default="v1")
    p.add_argument("--seed", type=int)
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "out"))
    a = p.parse_args()
    cfg = config_for(a.version, a.seed)
    world, truth = make_world(cfg)
    folder = Path(a.out) / f"{cfg.name}-s{cfg.seed}"
    write_world(folder, world, truth)
    print(f"{folder}: {len(world['accounts'])} accounts, {len(world['txns'])} payments, "
          f"{len(world['complaints'])} complaints; money left to rescue {rescue_share(world, truth):.0%}")


if __name__ == "__main__":
    main()


def build_all(out: Path) -> list[Path]:
    """v1, the five locked v2 worlds, the same v2 worlds with noisier phone signals, and out/WORLDS.md."""
    from dataclasses import replace
    from . import compare
    from .configs.v2 import V2_SEEDS, v2_config
    folders, rows = [], []
    from .configs.v3_split import V3_SEEDS, v3_config
    noisy = [replace(v2_config(s), name="v2noisy", signal_noise="high") for s in V2_SEEDS]
    v3 = [v3_config(s, n) for n in ("low", "high") for s in V3_SEEDS]
    for cfg in [config_for("v1")] + [v2_config(s) for s in V2_SEEDS] + noisy + v3:
        world, truth = make_world(cfg)
        folder = out / f"{cfg.name}-s{cfg.seed}"
        write_world(folder, world, truth)
        folders.append(folder)
        rows.append(compare.world_row(world, truth))
    compare.write(rows, out / "WORLDS.md")
    return folders
