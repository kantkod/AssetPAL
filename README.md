# PAL RAG Truth Bench (Replit-ready)

This is a **friction-free** Node.js project you can import into Replit and run with one click.

It creates a **synthetic RAG corpus** designed to break vanilla RAG:
- conflicting policies
- timestamped updates
- adversarial near-duplicate swarms

Then it runs **3 experiments**:
1) Conflict handling (should say "conflict/uncertain", not pick one confidently)
2) Temporal updates (should adopt new truth after update injection)
3) Near-duplicate swarm resistance (should not get hijacked by quantity)

⚠️ Important: This project is **LLM-free** on purpose. It evaluates the *truth-maintenance mechanics* (ledger + gating) with deterministic claim extraction.

---

## How to run in Replit

1. Create a new Replit → **Import from ZIP**  
2. Upload the ZIP you downloaded from ChatGPT
3. Press **Run**

Or use commands in Replit Shell:

```bash
npm run gen
npm run run:all
```

---

## Files

- `src/generate_corpus.js` — generates corpus + queries into `results/corpus/`
- `src/run_experiment_conflict.js` — Experiment 1
- `src/run_experiment_update.js` — Experiment 2
- `src/run_experiment_swarm.js` — Experiment 3
- `src/baselines.js` — strong baselines and PAL-ledger baseline
- `src/ledger.js` — Li + CY-lite gating + contradiction tracking
- `src/retrieval.js` — simple bag-of-words retriever + swarm effects
- `src/metrics.js` — scoring metrics, JSON output
- `configs/default.json` — parameters (top_k, gating strength, etc)

---

## What to look for

Open `results/runs/latest/summary.json`

The key comparisons:
- `PAL_LEDGER` should beat `VANILLA_RAG` and `MAJORITY_VOTE` on:
  - conflict cases (lower "wrong_confident")
  - update cases (higher "adopted_new")
  - swarm cases (higher accuracy as swarm size increases)

If PAL baseline loses: adjust in `configs/default.json`:
- `cySigma`, `cyBeta` (context gating)
- `reliabilityWeight`, `timeWeight` (truth maintenance)
- `retriever.topK`


## If you see “Results Parsing Error” in a runner UI
Some runners require the program to print **only JSON**. This project prints only JSON to stdout and also writes `results.json` at the project root.
Open `results/runs/latest/summary.json` for human-readable results.
