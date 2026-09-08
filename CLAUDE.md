# CLAUDE.md — working notes for AssetPAL

A deterministic, LLM-free benchmark testing whether a truth-maintenance ledger
(PAL's shared ledger, `Ls`) beats naive retrieval on three failure modes:
conflicting sources, scoped updates, and adversarial document floods.

Zero runtime dependencies. Node 22. Everything is seeded and reproducible.

## Commands

```bash
npm run gen     # generate the synthetic corpus -> results/corpus/
npm test        # 41 tests; self-bootstraps the corpus if missing
npm run bench   # full run -> runs/<runId>/ + results.json
npm run build   # static site -> public/ (this is the Netlify build)
npm run inspect # local-only per-query inspector on :3000
```

`results/`, `runs/`, `public/`, `results.json` are all gitignored — regenerate,
never commit them.

## Layout

| File | Role |
|---|---|
| `generate_corpus.js` | Synthetic docs + queries. Seeded; shape is asserted in tests |
| `retrieval.js` | Bag-of-words retrieval, and `makeSwarmDocs` (the attack generator) |
| `ledger.js` | `TruthLedger` — claim scoring and `decide()`. The system under test |
| `baselines.js` | The five baselines, including PAL |
| `experiment_core.js` | The three experiment runners. Pure — no `fs`, so esbuild can bundle it |
| `metrics.js` | Per-query scoring into a summary |
| `scoring.js` | **Single source of truth** for the overall score |
| `bench.js` / `index.js` / `build.js` / `netlify/functions/run-experiment.js` | The four surfaces that report a score |
| `test/benchmark.test.js` | End-to-end guards on the numbers the README publishes |
| `test/scoring.test.js` / `test/confidence.test.js` | Scoring rules; the dominance vs independence models |
| `test/invariants.test.js` | Structural guards: one scoring rule, torus inertness, corpus hash, the attack generator's contract |

## Invariants — do not break these

**One scoring rule.** All four surfaces import `overallScore` from `scoring.js`.
They previously had two different formulas and disagreed with each other
(116.7% vs 95.45%). Never inline a score calculation anywhere.

**Experiments are weighted equally**, not per-query — otherwise the 192-query
update experiment drowns out the 48-query conflict experiment.

**`answered + abstain === total`** for every summary. Tested.

**Flagging `CONFLICT` on a query whose `expected` is `"CONFLICT"` counts as
correct**, not as an abstention. Refusing to guess is the right answer there.
On an ordinary value query it is an abstention, and an unnecessary abstention
counts against you exactly as a wrong answer does.

## Deliberately failing — DO NOT TUNE THESE GREEN

The benchmark used to score PAL at 100% on everything, which meant it had
stopped measuring anything. Several cells are now red **on purpose**, and the
tests pin them so a fix shows up as a deliberate test change.

- **`spoof_now` / `spoof_past` swarm at sizes 2–10.** PAL drops to 0%. These
  modes date the forged clones at or before `nowTs`, so `futureTimestampPenalty`
  never fires and only `swarmSignaturePenalty` is left — too weak at small flood
  sizes. **Raising `swarmSignaturePenalty` would turn these green and would be
  fitting a constant to the test.** A real fix keys on the *shape* of a
  coordinated flood, or on source independence.

- **The `independence` confidence model.** Implemented, flag-gated, and *not*
  default. It correctly fixes a real flaw (see below) but is worse where it
  matters: it lets an attacker manufacture an apparent second witness, taking
  PAL from 0 false assertions to 48. Do not promote it to default without
  solving forgeable identity first.

If a change makes these green, verify *why* before believing it.

## Known-broken / known-weak

- **PAL is least confident when its top two sources agree.** `dominance =
  top/(top+second)` scores corroboration and contradiction with the same number,
  so two agreeing claims land near 0.51 and trip the `UNCERTAIN` gate. This is
  why the cheapest jamming attack is *two* documents, not forty. Unfixed — the
  obvious fix is the `independence` model, which is worse.

- **PAL's zero-false-assertion record is emergent, not designed.** It comes from
  competing clones tying for the top two slots and dragging dominance to ~0.5.
  Change the confidence model and it disappears. Do not describe it as a
  guarantee.

- **The CY-lite torus weight is inert.** `theta` is a pure function of
  `(domain, subject)`, and candidates are filtered to a single such pair, so
  every candidate gets the same weight and it cancels out. Listed as mechanism 6
  in the README but contributes nothing — pinned by two tests in
  `test/invariants.test.js`, including at extreme `cySigma`/`cyBeta`.

  **The filter that matters is `baselines.js:77`, not `ledger.query`.** The
  caller narrows claims to one `(domain, subject)` *before* upserting them, and
  `ledger.query:17` then filters the same way again, redundantly. Widening only
  the `ledger.query` gate changes nothing and looks like the torus is
  permanently dead; both gates have to open before it can do anything. Either
  give it a job (cross-subject interference) or delete it and its `cy*` knobs.

- **Swarm non-monotonicity.** PAL fails at small flood sizes and recovers at
  large ones, because `1/(1 + λ(n−1))` penalises a big flood ~8.8× and a small
  one only 1.2×. Few forged documents beat many. Expected, not a bug.

- **No LICENSE.** Deliberately left for the owner to choose.

## Open threads, in the order I would take them

1. **A notion of source independence an attacker cannot forge.** This is the
   blocker for everything else. `source` is a self-declared string, and spoofing
   it is exactly the attack. Options: signed provenance, channel distinctness
   (independence from *how* a claim arrived), or a learned trust graph where
   historically-correlated sources count as one witness. The trust graph is the
   most tractable here because the corpus can generate correlated sources
   synthetically and you can measure recovery.

2. **A swarm defence built on (1)** — burst detection, or corroboration weighted
   by established independence. Then let `spoof_now` / `spoof_past` go green
   honestly.

3. **The torus decision** — purpose or removal.

4. **`Li`, the private ledger.** The README's original "next step". Worth noting
   it is *also* an independence mechanism: an agent's own accumulated prior is
   one witness that cannot be forged by flooding the shared pool. That makes it a
   natural fit with (1) rather than a separate feature.

5. **Sea of Ledgers / multi-PAL consensus.** Owner's longer-term idea. Blocked on
   (1) for a concrete reason: consensus by *summing agreement* is precisely the
   architecture the `independence` experiment showed to be Sybil-exploitable. If
   N ledgers agreeing raises confidence, the attack reduces to spawning ledgers.

## Conventions

- Run `npm test` before pushing. Prefer adding a pinned test over a prose note
  when you discover a behaviour worth keeping.
- Changing the corpus (the seed, the generator, a document body) moves every
  published number. `test/invariants.test.js` pins its SHA-256 for that reason:
  when the change is deliberate, re-run `npm run bench`, update the README
  tables and update the pinned hashes in the same commit.
- A guard that cannot fail is decorative. When adding one, break the invariant
  on purpose once and confirm the test goes red before trusting it.
- When a result is a negative one, keep the code flag-gated and documented rather
  than reverting it — the finding is the value.
- The README is the public artifact and is expected to be honest about
  weaknesses; several sections exist specifically to withdraw earlier overclaims.
