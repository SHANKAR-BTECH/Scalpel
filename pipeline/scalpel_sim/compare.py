"""Writes out/WORLDS.md: v1 vs the five v2 worlds side by side, so the difference is visible.

Reads truth (it describes the worlds), so it is a grading-side tool, never used by the engine.
"""
from __future__ import annotations

from pathlib import Path
from statistics import mean

from .signals import compute_signals
from .world import rescue_share


def world_row(world: dict, truth: dict) -> dict:
    s = compute_signals(world)
    roles = truth["roles"]
    mules = [a for a, r in roles.items() if r == "mule"]
    shields = [a for a, r in roles.items() if r == "shield"]
    flagged = [a for a in roles if len(s[a]) >= 2]
    hit = sum(roles[a] == "mule" for a in flagged)
    return {
        "world": f"{world['name']} (seed {world['seed']})", "accounts": len(world["accounts"]), "mules": len(mules),
        "shields": len(shields), "complaints": len(world["complaints"]), "reportRate": truth["stats"]["reportRate"],
        "rescueShare": rescue_share(world, truth), "ruleRecall": hit / len(mules) if mules else 0.0,
        "rulePrecision": hit / len(flagged) if flagged else 0.0,
        "signsPerMule": mean(len(s[a]) for a in mules) if mules else 0.0,
        "signsPerShield": mean(len(s[a]) for a in shields) if shields else 0.0,
    }


def worlds_markdown(rows: list[dict]) -> str:
    head = ("| World | Accounts | Mules | Shields | Complaints seen | Victims who reported | Money left to rescue "
            "| Simple rule catches (mules) | Simple rule right when it flags | Signs per mule | Signs per shield |")
    lines = [head, "|" + "---|" * 11]
    for r in rows:
        lines.append(f"| {r['world']} | {r['accounts']:,} | {r['mules']} | {r['shields']} | {r['complaints']} | "
                     f"{r['reportRate']:.0%} | {r['rescueShare']:.0%} | {r['ruleRecall']:.0%} | {r['rulePrecision']:.0%} | "
                     f"{r['signsPerMule']:.1f} | {r['signsPerShield']:.1f} |")
    return "\n".join(lines) + "\n"


def write(rows: list[dict], path: Path) -> None:
    text = ("# Fake worlds: v1 (build and train) vs v2 (final test, locked before training)\n\n"
            "Simulated, fictional data. \"Simple rule\" = 2 or more warning signs means suspicious (the rule the AI must beat).\n\n"
            + worlds_markdown(rows))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
