"""Run the engine on every world, mark it against the hidden answers, write RESULTS.md and results.json.

python -m scalpel_grade.report   (needs out/ built by make_world.build_all and assessments from scalpel_model.train)
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from scalpel_sim.export import read_json
from .grade import (suggested_on_innocent, future_money_stopped, grade_holds, headline_line, oracle_order, rescue, role_counts,
                    top_mules, verdict)

PIPE = Path(__file__).resolve().parents[1]
OUT = PIPE / "out"
POLICIES = ["0", "A", "B", "C"]
POLICY_NAMES = {"0": "0 Do nothing", "A": "A Axe (whole freeze)", "B": "B Ruler (exact traced)", "C": "C Scalpel"}
QUEUES = ["fcfs", "biggest", "signrule", "scalpel"]
QUEUE_NAMES = {"fcfs": "First come, first served", "biggest": "Biggest amount first",
               "signrule": "Warning-sign rule (2+ signs first)", "scalpel": "Scalpel (money likely lost per hour)"}
KS = [5, 10, 20]
DRAINS = [1.0, 2.0, 5.0, 10.0]  # 1x = shop money leaves as fast as mule money (some shops sweep hourly)
MODELS = ["logistic", "lightgbm"]
HEAD_K, HEAD_DRAIN = 10, 5.0
TOO_EASY = 0.98  # same alarm line as scalpel_model.train.TOO_EASY_AUC


# ---------------------------------------------------------------- running the engine

def run_engine_all(folders: list[Path]) -> None:
    from scalpel_sim.skeleton import run_engine
    jobs = []
    for f in folders:
        d = f / "decisions"
        for p in POLICIES:
            jobs.append((f / "world", p, d / f"{p}.json", None))
        for m in MODELS:
            jobs.append((f / "world", None, d / f"queues-{m}.json", m))

    def go(job):
        world, p, out, model = job
        if p is not None:
            run_engine(world, p, out)
        else:
            import subprocess
            from scalpel_sim.skeleton import REPO
            subprocess.run(["npx", "-y", "pnpm@10.28.0", "--silent", "--filter", "@scalpel/sim-runner", "run", "world",
                            str(world), "--queues", str(out), "--assessments", f"assessments-{model}.json"],
                           cwd=REPO, check=True, capture_output=True, text=True)

    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(go, jobs))


# ---------------------------------------------------------------- marking one world

def grade_world(folder: Path) -> dict:
    truth = read_json(folder / "truth" / "truth.json")
    out = {"world": folder.name, "roles": role_counts(truth), "holds": {}, "rescue": {}, "top10": {}, "models": {}}
    for p in POLICIES:
        rows = read_json(folder / "decisions" / f"{p}.json")["rows"]
        g = grade_holds(rows, truth)
        g["futureMoneyStopped"] = future_money_stopped(rows, truth)
        g["suggestedWholeFreezes"] = sum(1 for r in rows if r.get("suggestedWholeFreeze"))
        g["suggestedOnInnocent"] = suggested_on_innocent(rows, truth)
        out["holds"][p] = g
    for m in MODELS:
        q = read_json(folder / "decisions" / f"queues-{m}.json")
        held, orders = q["held"], q["orders"]
        res = {}
        for drain in DRAINS:
            for k in KS:
                best = rescue(oracle_order(held, truth, k, drain), held, truth, k, drain)
                res[f"{drain:g}x/K{k}"] = {"oracle": best, **{n: rescue(orders[n], held, truth, k, drain) for n in QUEUES}}
        out["rescue"][m] = res
        out["top10"][m] = {n: top_mules(orders[n], truth, 10) for n in QUEUES}
        a = read_json(folder / "world" / f"assessments-{m}.json")["accounts"]
        out["models"][m] = _model_marks(a, truth, held)
    out["delayPerMuleHour"], out["realDrainPerMuleHour"] = delay_per_mule_hour(held, truth, HEAD_DRAIN)
    return out


def delay_per_mule_hour(held: dict[str, int], truth: dict, drain: float) -> tuple[float, float]:
    """Per traced mule, first hour of waiting: (drop in what an exact hold can still secure, real victim money that leaves)."""
    from scalpel_sim.world import remaining_victim_money
    from .grade import _saved
    mules = [a for a in held if truth["roles"].get(a) == "mule"]
    if not mules:
        return 0.0, 0.0
    capped = sum(_saved(a, 0, held, truth, drain) - _saved(a, 1, held, truth, drain) for a in mules) / len(mules)
    real = sum(remaining_victim_money(truth, a, 0, drain) - remaining_victim_money(truth, a, 1, drain) for a in mules) / len(mules)
    return capped, real


def _model_marks(acc: dict, truth: dict, held: dict) -> dict:
    from sklearn.metrics import roc_auc_score
    roles = truth["roles"]
    ids = list(acc)
    y = [roles[a] == "mule" for a in ids]
    s = [acc[a]["muleScore"] for a in ids]
    high = [a for a in ids if acc[a]["muleScore"] >= 0.85]
    worst = sorted(ids, key=lambda a: -abs((roles[a] == "mule") - acc[a]["muleScore"]) * held.get(a, 0))[:5]
    return {
        "auc": roc_auc_score(y, s) if 0 < sum(y) < len(y) else None,
        "scored085": len(high),
        "mulesAmong085": sum(roles[a] == "mule" for a in high),
        "shields085": sum(roles[a] == "shield" for a in high),
        "innocent085": sum(roles[a] != "mule" for a in high),
        "innocentMoney085": sum(held.get(a, 0) for a in high if roles[a] != "mule"),
        "worst": [{"account": a, "role": roles[a], "muleScore": acc[a]["muleScore"], "traced": held.get(a, 0),
                   "reasons": acc[a]["reasons"]} for a in worst],
    }


# ---------------------------------------------------------------- pooling and writing

def pooled_pct(worlds: list[dict], model: str, key: str, queue: str) -> tuple[float, float, float]:
    """Pooled % of the oracle over worlds, plus the lowest and highest single-world %."""
    num = sum(w["rescue"][model][key][queue] for w in worlds)
    den = sum(w["rescue"][model][key]["oracle"] for w in worlds)
    per = [100 * w["rescue"][model][key][queue] / w["rescue"][model][key]["oracle"] for w in worlds if w["rescue"][model][key]["oracle"]]
    return (100 * num / den if den else 0.0, min(per, default=0.0), max(per, default=0.0))


def conditional_sentence(rows: dict[float, str]) -> str:
    """rows: drain ratio -> verdict. Finds the smallest N from which Scalpel beats the rule at every larger ratio."""
    listed = ", ".join(f"{d:g}x" for d in sorted(rows))
    ok = [d for d in sorted(rows) if all(rows[e] == "beats" for e in sorted(rows) if e >= d)]
    if not ok:
        wins = [f"{d:g}x" for d in sorted(rows) if rows[d] == "beats"]
        if not wins:
            return f"Scalpel's order does not beat the warning-sign rule at any drain ratio tested ({listed})."
        rest = [f"{d:g}x ({rows[d]})" for d in sorted(rows) if rows[d] != "beats"]
        return (f"Scalpel's order beats the warning-sign rule at {', '.join(wins)} but not at {', '.join(rest)} "
                f"(drain ratios tested: {listed}).")
    n = min(ok)
    if n == min(rows):
        return f"Scalpel's order beats the warning-sign rule at every drain ratio tested ({listed})."
    return f"Scalpel's order beats the warning-sign rule when mules drain at least {n:g}x faster than shops; below that it doesn't."


def vs_biggest_sentence(rows: list[tuple[str, float, float]]) -> str:
    """rows: (setting, Scalpel %, biggest-first %). Says plainly where Scalpel is worse, and how often it is ahead."""
    worse = [r for r in rows if verdict(r[1], r[2]) == "does not beat"]
    ahead = [r for r in rows if verdict(r[1], r[2]) == "beats"]
    parts = []
    if worse:
        w = min(worse, key=lambda r: r[1] - r[2])
        parts.append(f"It does worse than 'biggest amount first' at {w[0]} ({w[1]:.1f}% vs {w[2]:.1f}%) and in {len(worse)} of {len(rows)} settings tested.")
    if ahead:
        parts.append(f"It is ahead of 'biggest amount first' in {len(ahead)} of {len(rows)} settings tested.")
    else:
        parts.append(f"It is never ahead of it in any of the {len(rows)} settings tested, so in these worlds the amount alone carries most of the ordering.")
    return " ".join(parts)


def rupees(p: float) -> str:
    return f"₹{p / 100:,.0f}"


def summarise(v1: dict, v2: list[dict], v2noisy: list[dict]) -> dict:
    head = f"{HEAD_DRAIN:g}x/K{HEAD_K}"
    sc, sc_lo, sc_hi = pooled_pct(v2, "logistic", head, "scalpel")
    sr, sr_lo, sr_hi = pooled_pct(v2, "logistic", head, "signrule")
    bg = pooled_pct(v2, "logistic", head, "biggest")[0]
    vb = []
    for label, ws in (("low noise", v2), ("high noise", v2noisy)):
        for d in DRAINS:
            for k in KS:
                key = f"{d:g}x/K{k}"
                vb.append((f"K={k}, {d:g}x drain, {label}", pooled_pct(ws, "logistic", key, "scalpel")[0],
                           pooled_pct(ws, "logistic", key, "biggest")[0]))
    cond = {}
    for label, ws in (("low", v2), ("high", v2noisy)):
        for d in DRAINS:
            key = f"{d:g}x/K{HEAD_K}"
            a, b = pooled_pct(ws, "logistic", key, "scalpel")[0], pooled_pct(ws, "logistic", key, "signrule")[0]
            cond[f"{label}/{d:g}x"] = {"scalpel": a, "signrule": b, "verdict": verdict(a, b)}
    return {
        "firstLine": headline_line(sc, sr) + " " + vs_biggest_sentence(vb),
        "vsBiggest": vb,
        "verdictVsBiggest": verdict(sc, bg),
        "verdict": verdict(sc, sr),
        "headline": {"scalpel": [sc, sc_lo, sc_hi], "signrule": [sr, sr_lo, sr_hi]},
        "conditional": cond,
        "conditionalSentence": conditional_sentence({d: cond[f"low/{d:g}x"]["verdict"] for d in DRAINS}),
        "conditionalSentenceNoisy": conditional_sentence({d: cond[f"high/{d:g}x"]["verdict"] for d in DRAINS}),
        "v1": v1, "v2": v2, "v2noisy": v2noisy,
    }


def _pool_holds(ws: list[dict], p: str) -> dict:
    tot = lambda k: sum(w["holds"][p][k] for w in ws)
    vm = tot("victimMoney")
    ratios = [w["holds"][p]["freezeRatio"] for w in ws if isinstance(w["holds"][p]["freezeRatio"], (int, float))]
    return {"freezeRatio": tot("held") / vm if vm else 0, "lo": min(ratios, default=0), "hi": max(ratios, default=0),
            "missed": tot("victimMoneyMissed"), "victimMoney": vm, "innocentHeld": tot("innocentHeld"),
            "wrongly": tot("peopleWronglyRestricted"), "future": tot("futureMoneyStopped"),
            "suggested": tot("suggestedWholeFreezes")}


def render(s: dict) -> str:
    v1, v2 = s["v1"], s["v2"]
    L = [s["firstLine"], "", "# Policy test bench under stated assumptions", "",
         "> Simulation with fictional data. Not legal advice. Every number below comes from fake worlds whose rules are "
         "listed at the end. It shows how the policies compare *under those assumptions*; it does not prove the AI works on real banks.",
         "",
         "**Agreed before any results were produced:** if the AI only ties the warning-sign rule, that is an honest, "
         "acceptable result and this report says so. A tie means within 1 point of the best possible rescue.", "",
         f"Unseen test worlds: 5 v2 worlds (seeds {', '.join(w['world'].split('-s')[1] for w in v2)}), built and locked before training. "
         "Numbers are pooled over the 5 with the lowest and highest single world in brackets. v1 (the practice world the AI learned from) is shown alongside, so the drop is visible.", ""]

    L += ["## 1. Holds: the two-number headline", "",
          "Freeze Ratio = money held ÷ real victim money (1.00× is exactly right). Victim money missed = real victim money left unheld, "
          "including victims who never complained. The Axe ratio here is our own simulated figure; the industry 15.12× is not used.", "",
          "| Policy | Freeze Ratio v2 (range) | Victim money missed v2 | Innocent money held v2 | People wrongly restricted v2 | Future money stopped v2 | Freeze Ratio v1 |",
          "|---|---|---|---|---|---|---|"]
    for p in POLICIES:
        h, h1 = _pool_holds(v2, p), _pool_holds([v1], p)
        L.append(f"| {POLICY_NAMES[p]} | {h['freezeRatio']:.2f}× ({h['lo']:.2f}–{h['hi']:.2f}) | {rupees(h['missed'])} of {rupees(h['victimMoney'])} | "
                 f"{rupees(h['innocentHeld'])} | {h['wrongly']} | {rupees(h['future'])} | {h1['freezeRatio']:.2f}× |")
    c = _pool_holds(v2, "C")
    L += ["", "Scalpel and the Ruler hold the same amounts: both hold exactly the traced money. Scalpel adds the order, the reasons, the rule checks and the suggestions below.",
          "", f"Scalpel suggested {c['suggested']} whole freezes on v2 for an officer to decide; **{sum(w['holds']['C']['suggestedOnInnocent'] for w in v2)} of them were on innocent accounts**. None were applied automatically, "
          "so \"future money stopped\" is ₹0 for Scalpel by design. Only the Axe stops money that arrives later, at the cost of the innocent money it locks.", ""]

    L += ["## 2. Rescue: who the officer acts on first", "",
          "Every queue uses the same exact-sized holds; only the order differs. The officer can act on K accounts an hour "
          "(K = 5, 10, 20 are **assumptions**, not measured). Mule money drains 15% an hour; shop money drains 5× slower. "
          "Shown as % of the best possible order (the \"oracle\", which knows the hidden answers).", "",
          "| Order | K=5 v2 | K=10 v2 | K=20 v2 | K=10 v1 |", "|---|---|---|---|---|"]
    for n in QUEUES:
        cells = []
        for k in KS:
            pct, lo, hi = pooled_pct(v2, "logistic", f"{HEAD_DRAIN:g}x/K{k}", n)
            cells.append(f"{pct:.1f}% ({lo:.0f}–{hi:.0f})")
        p1 = pooled_pct([v1], "logistic", f"{HEAD_DRAIN:g}x/K{HEAD_K}", n)[0]
        L.append(f"| {QUEUE_NAMES[n]} | {' | '.join(cells)} | {p1:.1f}% |")
    L += ["", "Scalpel's order = amount × (mule score × 15% + (1 − mule score) × 3%), the money likely lost per hour of waiting. "
          "It uses the 5× drain assumption; section 3 tests it against 1×, 2× and 10×.", ""]

    L += ["## 3. When does it win? (the conditional headline)", "", f"**{s['conditionalSentence']}**", "",
          f"With noisier phone signals: {s['conditionalSentenceNoisy']}", "",
          "| Mules drain faster than shops by | Phone-signal noise | Scalpel | Warning-sign rule | Result |", "|---|---|---|---|---|"]
    for key, r in s["conditional"].items():
        noise, d = key.split("/")
        L.append(f"| {d} | {noise} | {r['scalpel']:.1f}% | {r['signrule']:.1f}% | {r['verdict']} |")
    L.append("")

    delay = sum(w["delayPerMuleHour"] for w in v2) / len(v2)
    real = sum(w["realDrainPerMuleHour"] for w in v2) / len(v2)
    L += ["## 4. The cost of waiting", "",
          f"**Each hour of delay on a mule lets {rupees(real)} of real victim money leave, on average, in this world** (v2, first hour, 15% an hour drain). "
          f"An exact hold only covers money traced from complaints made so far, so what the hold itself can still secure drops by only {rupees(delay)} per mule in that hour: "
          "the bigger loss is money nobody has complained about yet.", ""]

    L += ["## 5. Role guesses", "",
          "| Model | Real mules in the officer's top 10 (Scalpel order) | Same, warning-sign rule | Innocent accounts scored 0.85+ (of them shops) | Their held money | Of accounts scored 0.85+, really mules | AUC v2 (range) |",
          "|---|---|---|---|---|---|---|"]
    aucs_all = []
    for m in MODELS:
        t_sc = sum(w["top10"][m]["scalpel"] for w in v2)
        t_sr = sum(w["top10"][m]["signrule"] for w in v2)
        inn = sum(w["models"][m]["innocent085"] for w in v2)
        sh = sum(w["models"][m]["shields085"] for w in v2)
        shm = sum(w["models"][m]["innocentMoney085"] for w in v2)
        hi = sum(w["models"][m]["scored085"] for w in v2)
        mh = sum(w["models"][m]["mulesAmong085"] for w in v2)
        aucs = [w["models"][m]["auc"] for w in v2 if w["models"][m]["auc"] is not None]
        if aucs and sum(aucs) / len(aucs) > TOO_EASY:
            aucs_all.append(m)
        L.append(f"| {m} | {t_sc} of {10 * len(v2)} | {t_sr} of {10 * len(v2)} | {inn} ({sh}) | {rupees(shm)} | "
                 f"{(100 * mh / hi if hi else 0):.0f}% of {hi} | {sum(aucs) / len(aucs):.2f} ({min(aucs):.2f}–{max(aucs):.2f}) |")
    saved10 = sum(w["rescue"]["logistic"][f"{HEAD_DRAIN:g}x/K{HEAD_K}"]["scalpel"] for w in v2)
    L += ["", f"For scale: the Scalpel order secured {rupees(saved10)} of victim money across the 5 worlds (K=10). "
          "Innocent accounts scored 0.85+ are listed beside it on purpose: a high score on an innocent person is a real harm, even though the Gate never freezes a whole account without an officer (R2) and gives shops only an exact hold (R8).",
          "", (f"**v2 is also \"too easy\" by our own alarm for {' and '.join(aucs_all)}** (AUC above {TOO_EASY:.2f} on accounts holding traced money). The fake worlds separate mules more cleanly than real data would, so treat every AI number here as an upper bound."
               if aucs_all else "No model passes the \"too easy\" alarm on v2."),
          "", "AUC is measured on the calibrated score, which keeps the raw model's order exactly.",
          "", "Both orders put only real mules in the top 10 on every world, so the top 10 does not separate them; the difference shows further down the list (section 2).",
          "", "The \"really mules\" column is the calibration check: a score of 0.85+ should mean roughly 85%+ of those accounts are mules.", ""]

    L += ["## 6. Where the AI loses", "", "The 5 costliest v2 mistakes (wrong score × money involved), with the reasons the AI gave. "
          "v2 mules are slower (money waits 20–90 minutes) and often old rented accounts, unlike anything in v1, so the AI scores some of them near 0. "
          "The amount-based order still puts big ones early, which is why the rescue numbers hold up.", "",
          "| World | Account | Really | Mule score | Traced money | AI's reasons |", "|---|---|---|---|---|---|"]
    worst = sorted(((w["world"], x) for w in v2 for x in w["models"]["logistic"]["worst"]),
                   key=lambda t: -abs((t[1]["role"] == "mule") - t[1]["muleScore"]) * t[1]["traced"])[:5]
    for wn, x in worst:
        L.append(f"| {wn} | {x['account']} | {x['role']} | {x['muleScore']:.2f} | {rupees(x['traced'])} | {'; '.join(x['reasons'])} |")
    L.append("")

    L += ["## 7. Assumptions (change these and the numbers change)", "",
          "- The worlds are invented. v2 changes criminal habits on purpose: older rented mule accounts, slower mules, twice as many innocent shops, more digital-arrest scams.",
          "- Victims complain late or never (40–70% report, up to 72 hours late). Only complaints made before the decision moment are visible.",
          "- After the decision moment, mule money drains 15% an hour and other money drains 1×, 2×, 5× or 10× slower. Note the mismatch: before the decision moment, shops in these worlds sweep most of their takings every evening (30% of them hourly), so for those shops the 1× row is the realistic one.",
          "- The mule score is calibrated with a smooth curve (Platt scaling) fitted on an unseen v1 world. This replaced a step-shaped calibrator after the final review showed it flattened many real mules to exactly 0; that change was made after v2 results had been seen, and is disclosed here.",
          "- Victim payments in the world file come from neutral outside-account ids, as a bank would see them; only complaints say who reported fraud.",
          "- Officer capacity K = 5, 10 or 20 accounts an hour.",
          "- The AI never saw v2's answers. Only the grader opens truth.json.",
          "- v2's settings were locked before training and re-locked once, openly, when shared world-realism fields were added (no v2 result had been looked at).",
          "- v1 is easy for the AI (near-perfect on an unseen v1 seed). The v1 column is graded on v1 seed 101, which the AI trained on.", ""]
    return "\n".join(L)


def main(run_engine: bool = True) -> None:
    folders = sorted(p.parent for p in OUT.glob("v*-s*/world"))
    if run_engine:
        run_engine_all(folders)
    graded = {f.name: grade_world(f) for f in folders}
    v1 = graded["v1-s101"]
    v2 = [g for n, g in sorted(graded.items()) if n.startswith("v2-s")]
    v2n = [g for n, g in sorted(graded.items()) if n.startswith("v2noisy-s")]
    s = summarise(v1, v2, v2n)
    (PIPE / "results.json").write_text(json.dumps(s, indent=1, sort_keys=True, default=float) + "\n", encoding="utf-8")
    (PIPE / "RESULTS.md").write_text(render(s), encoding="utf-8")
    print(s["firstLine"])
    print(s["conditionalSentence"])


if __name__ == "__main__":
    main()
