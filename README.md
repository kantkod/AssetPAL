# RAG Truth-Maintenance Benchmark

A deterministic benchmark for measuring how well retrieval-augmented systems handle three real failure modes:
**conflicting sources**, **outdated information**, and **adversarial document flooding**.

LLM-free by design. The synthetic corpus has known ground truth, so results are reproducible and don't depend on model sampling.

---

## The problem

Vanilla RAG retrieves the top-k documents and returns the most prominent claim. This works when sources agree and content doesn't change. It breaks in three common real-world patterns:

| Failure mode | What happens | Why it's a problem |
|---|---|---|
| **Conflicting claims** | Two authoritative sources disagree | System picks one confidently instead of flagging the contradiction |
| **Temporal update** | A scoped policy update supersedes an older baseline | System returns stale answer for queries in the update's scope |
| **Adversarial swarm** | Many near-duplicate documents assert a false claim | System is overridden by quantity, not quality |

---

## What this benchmark tests

### Corpus structure

The synthetic corpus covers 4 domains (HR, SECURITY, PRICING, SUPPORT), each with 6 subjects (e.g. `refund_window`, `password_policy`). Per subject, the generator produces:

- **v0 baseline** — universal scope (`*/*/*`), timestamp 1, source Handbook (reliability 0.85)
- **v1 scoped update** — scope EU/PRO/product-A only, timestamp 20, source PolicyPortal (reliability 0.95)
- **FALSE adversarial** — scope EU/PRO/product-A, timestamp 18, source Wiki (reliability 0.65)
- **Hard conflict pair** — two PolicyPortal docs at timestamp 30 with different values for different product scopes
- **Distractors** — domain-relevant docs with no claims on the subject

### Three experiments

**Experiment 1 — Conflict**: Queries are drawn from the hard-conflict zone (EU/PRO, nowTs=35). Both conflicting claims are visible. Expected behavior: flag `CONFLICT` rather than guess.

**Experiment 2 — Update**: Queries span four scope combinations (EU/PRO/A, EU/FREE/A, US/FREE/A, US/PRO/B) at two timestamps — before and after the v1 update. Expected behavior: adopt v1 for EU/PRO/A queries at t1, stay on v0 for all others.

**Experiment 3 — Swarm**: Inject 0, 2, 5, 10, 20, 40 copies of the FALSE document in two modes (plain clones, spoofed-source clones). Expected behavior: accuracy holds as swarm size grows.

### Four baselines

| Baseline | Strategy |
|---|---|
| `VANILLA_RAG` | Return the first claim found in top-k |
| `MAJORITY_VOTE` | Count claim values across retrieved docs, return the plurality |
| `RERANK_REL_TIME` | Score each claim by `reliability × recency`, return the top scorer |
| `PAL_LEDGER` | Weighted ledger with provenance, scope matching, conflict detection, and swarm signature deduplication |

---

## Expected results

### Conflict

| Baseline | accuracy | conflict_good_rate |
|---|---|---|
| VANILLA_RAG | 16.7% | 16.7% |
| MAJORITY_VOTE | 16.7% | 16.7% |
| RERANK_REL_TIME | 50% | 50% |
| **PAL_LEDGER** | **100%** | **100%** |

PAL_LEDGER detects all 24 hard conflicts and returns `CONFLICT` instead of guessing, and resolves all 24 soft conflicts to the correct value. No other baseline ever returns `CONFLICT` at all — they answer confidently every time, and are simply wrong on the hard-conflict half.

### Update

| Baseline | accuracy | adopted_new_rate | over_update_rate |
|---|---|---|---|
| VANILLA_RAG | 62.5% | 25% | 75% |
| MAJORITY_VOTE | 62.5% | 25% | 75% |
| RERANK_REL_TIME | 62.5% | 25% | 75% |
| **PAL_LEDGER** | **100%** | **100%** | **0%** |

RERANK and VANILLA pick the most-recent document regardless of whether the update applies to the query's scope. PAL_LEDGER uses scope matching: EU/PRO/A queries adopt v1, everything else stays on v0.

### Swarm resistance (accuracy at swarm sizes 0–40)

Plain mode — clones keep their own low-reliability Wiki source:

| Baseline | size=0 | size=2 | size=5 | size=10 | size=20 | size=40 |
|---|---|---|---|---|---|---|
| VANILLA_RAG | 100% | 0% | 0% | 0% | 0% | 0% |
| MAJORITY_VOTE | 100% | 0% | 0% | 0% | 0% | 0% |
| RERANK_REL_TIME | 100% | 100% | 100% | 100% | 100% | 100% |
| **PAL_LEDGER** | **100%** | **100%** | **100%** | **100%** | **100%** | **100%** |

Spoof mode — clones masquerade as high-reliability PolicyPortal with future timestamps:

| Baseline | size=0 | size=2 | size=5 | size=10 | size=20 | size=40 |
|---|---|---|---|---|---|---|
| VANILLA_RAG | 100% | 0% | 0% | 0% | 0% | 0% |
| MAJORITY_VOTE | 100% | 0% | 0% | 0% | 0% | 0% |
| RERANK_REL_TIME | 100% | 0% | 0% | 0% | 0% | 0% |
| **PAL_LEDGER** | **100%** | **100%** | **100%** | **100%** | **100%** | **100%** |

This splits three ways, and the split is the sharpest result in the benchmark:

- **VANILLA_RAG / MAJORITY_VOTE** fail at *any* swarm size in *either* mode. Both are counting-based, so quantity beats quality immediately.
- **RERANK_REL_TIME** fully resists plain flooding — weighting by `reliability × recency` is enough when the clones are low-reliability Wiki docs. It collapses completely the moment the clones *spoof a trusted source*, because its ranking signal is exactly the thing being forged.
- **PAL_LEDGER** resists both, because signature deduplication and the future-timestamp penalty key on the *shape* of the flood — identical `(source, timestamp, value)` tuples — rather than on the trustworthiness the flood claims for itself.

The headline is therefore narrower and stronger than "PAL survives document floods": reranking already survives naive floods. **PAL is the only baseline that survives source spoofing.**

---

## How it works — PAL_LEDGER

Each retrieved document's claims are ingested into a `TruthLedger`. For each candidate claim, a score is computed as the product of:

1. **Reliability weight** — `reliability ^ reliabilityWeight`
2. **Temporal weight** — `(1 / (1 + Δt)) ^ timeWeight` — newer claims score higher
3. **Scope match weight** — three-way:
   - Exact match on all queried dimensions → `1.0`
   - All dimensions matched but some via wildcard (`*`) → `scopeWildcardPenalty` (default 0.75)
   - Any dimension mismatched → `scopeMismatchPenalty` (default 0.05)
4. **Source deduplication** — penalises when more than `maxSameSourceInfluence` *unique signatures* come from the same source (clone floods don't inflate the count)
5. **Swarm signature penalty** — collapses the weight of identical `(source, timestamp, value)` signatures
6. **CY-lite torus projection** — locality weight based on angular distance in (domain, subject) space

The top two scoring claims are compared. If they have different values and neither dominates by more than `contradictionThreshold`, the system returns `CONFLICT`. Otherwise it returns `RESOLVED` with the top claim.

---

## Scope matching detail

The key mechanism that fixes the update experiment: a scoped query (e.g. `{region: "EU", tier: "PRO", product: "A"}`) assigns different weights to:
- A claim scoped exactly to EU/PRO/A → `1.0`
- A claim with wildcard scope `*/*/*` → `scopeWildcardPenalty` (0.75)
- A claim scoped to EU/PRO/B → `scopeMismatchPenalty` (0.05)

This means a scoped policy update is preferred over a wildcard baseline for matching queries, not just because it's newer — also because it's more specific. For queries outside the update scope (e.g. US/PRO/B), the wildcard baseline at 0.75 easily beats the mismatched update at 0.05.

---

## How to run

```bash
# Install dependencies
npm install

# Generate the synthetic corpus (writes to results/corpus/)
npm run gen

# Run all three experiments
npm run bench

# Or run experiments individually
npm run run:conflict
npm run run:update
npm run run:swarm

# Run the test suite
npm test
```

`npm run bench` writes `runs/<runId>/{summary,per_query,config,meta}.json`, updates `runs/latest.json`, and writes `results.json` at the project root.

### Inspecting a run

```bash
npm run inspect   # serves site/inspect.html on :3000
```

The inspector is a **local dev tool only** — it reads `runs/`, which is gitignored, and is deliberately not copied into the Netlify build. Per-query traces run to ~7 MB, which is not something the public demo should download. Use it in a devcontainer/Codespace after `npm run bench`.

### Scoring

One scoring rule, defined once in `scoring.js`, is shared by the CLI (`bench.js`, `index.js`), the static build (`build.js`) and the Netlify function — so the terminal and the deployed site can never report different numbers for the same run.

- A summary's accuracy is `correct / total`.
- Flagging `CONFLICT` on a query whose expected answer *is* `CONFLICT` counts as **correct**, not as an abstention. This is the whole point of the conflict experiment: refusing to guess is the right answer.
- Flagging `CONFLICT` on an ordinary value query counts as an abstention, and an unnecessary abstention counts against you exactly as a wrong answer does.
- The overall score averages the three experiments **equally**, so the 192-query update experiment does not drown out the 48-query conflict experiment. Swarm scenarios are averaged among themselves first.

---

## Tuning

All parameters live in `default.json`:

| Parameter | Default | Effect |
|---|---|---|
| `topK` | 6 | Documents retrieved per query |
| `timeWeight` | 1.2 | Power applied to temporal recency boost |
| `reliabilityWeight` | 1.0 | Power applied to source reliability |
| `contradictionThreshold` | 0.35 | Conflict flagged when dominance < 1 − threshold |
| `scopeMismatchPenalty` | 0.05 | Weight for claims that don't match the query scope |
| `scopeWildcardPenalty` | 0.75 | Weight for claims that match via wildcard (`*`) |
| `scopeUnknownPenalty` | 0.6 | Weight when query has no scope metadata |
| `swarmSignaturePenalty` | 0.2 | Per-clone weight reduction for identical signatures |
| `maxSameSourceInfluence` | 3 | Max effective claims from the same source |

---

## Architecture note

This benchmark tests one specific claim from the PAL dual-ledger architecture: that a **shared ledger (Ls)** with provenance, reliability tracking, scope matching, and conflict detection outperforms naive retrieval for truth maintenance.

What's implemented here is purely Ls — a shared claims pool with weighted resolution. The architecture also specifies a private ledger (Li) where an agent maintains internal confidence in claims it has seen before, only surfacing them after internal validation. That's the natural next step: the system would accumulate a private prior over claims across sessions, and use that prior to gate what gets returned to the user.

---

## Limitations

- **PAL currently scores 100% on all three experiments, so the benchmark is saturated.** It cleanly separates PAL from the baselines, but it no longer measures headroom — there is nothing left for a tuning change to improve, and a regression is the only thing it can now detect. The next useful step is adversarial cases PAL *doesn't* already pass: conflicting sources of equal reliability and equal timestamp, updates that partially overlap in scope, or swarms that vary their signatures to defeat the dedup key.
- Retrieval is bag-of-words (Jaccard overlap). A real deployment would use dense embeddings, which interact differently with scope boundaries.
- Source reliability is hand-assigned in the corpus generator. In production it would be learned or externally provided.
- The swarm experiment gives the swarm a retrieval advantage by construction (bait tokens) and then compensates by widening topK to `topK + swarmSize`, so retrieval is not itself under test — the resolution layer is.
- The benchmark covers three specific failure modes. It is not a general RAG eval.
- No LICENSE file yet. Add one before making the repo public.
