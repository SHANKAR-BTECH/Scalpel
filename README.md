# Scalpel

Hold the right amount, legally, and show the proof. Scalpel is a simulated decision tool for banks handling cyber-fraud holds:
it holds only the money traced to a complaint, checks every hold against the law, tracks its deadlines, and shows its working.

> Simulation with fictional data. Not legal advice.

## Run it

```
cd pipeline
.venv/bin/python -m scalpel_sim.all              # builds worlds, trains, grades, writes apps/web/data/demo.json
.venv/bin/python -m scalpel_grade.demo_export    # only re-export the website data
cd ../apps/web
npx -y pnpm@10.28.0 install
npx next dev                                     # http://localhost:3000
```

On Windows use `.venv\Scripts\python` instead of `.venv/bin/python`.

## Tests

```
npx -y pnpm@10.28.0 -r test                      # engine, sim-runner, web
cd pipeline && .venv/bin/python -m pytest -q     # worlds and grader
cd apps/web && npx next build && npx playwright test --trace off
```

Design and plan: `docs/ARCHITECTURE.md`. Results: `pipeline/RESULTS.md`.
