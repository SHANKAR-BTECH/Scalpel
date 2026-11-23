"""Write a world to disk. The answers (truth) go in a separate folder that the
engine runner is never given."""
from __future__ import annotations

import json
from pathlib import Path

# Keys that would leak the answers if they appeared anywhere in world.json.
FORBIDDEN_KEYS = {"role", "roles", "label", "labels", "truth", "ismule", "is_mule", "mule", "shield", "campaign"}


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


def write_world(root: Path, world: dict, truth: dict) -> None:
    root = Path(root)
    _dump(root / "world" / "world.json", world)
    _dump(root / "truth" / "truth.json", truth)


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))
