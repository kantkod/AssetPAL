# CLAUDE.md — working notes for AssetPAL

A deterministic, LLM-free benchmark testing whether a truth-maintenance ledger
(PAL's shared ledger, `Ls`) beats naive retrieval on three failure modes:
conflicting sources, scoped updates, and adversarial document floods.

Zero runtime dependencies. Node 22. Everything is seeded and reproducible.

## Commands

```bash
npm run gen     # generate the synthetic corpus -> results/corpus/
npm test        # 54 tests; self-bootstraps the corpus if missing
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
| `provenance.js` | Signed claim tags — identity a source can prove, not one it asserts |
| `bench.js` / `index.js` / `build.js` / `netlify/functions/run-experiment.js` | The four surfaces that report a score |
| `test/benchmark.test.js` | End-to-end guards on the numbers the README publishes |
| `test/scoring.test.js` / `test/confidence.test.js` | Scoring rules; the dominance vs independence models |
| `test/invariants.test.js` | Structural guards: one scoring rule, torus inertness, corpus hash, the attack generator's contract |
| `test/provenance.test.js` | Unforgeable identity: the primitive, what it fixes, and what it deliberately does not |

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

- **`spoof_now` / `spoof_past` swarm at sizes 2–10, in the default (unsigned)
  configuration.** PAL drops to 0%. These modes date the forged clones at or
  before `nowTs`, so `futureTimestampPenalty` never fires and only
  `swarmSignaturePenalty` is left — too weak at small flood sizes. **Raising
  `swarmSignaturePenalty` would turn these green and would be fitting a constant
  to the test.**

  A real fix now exists and is measured: `verifyProvenance: true` recovers
  `spoof_past` entirely and `spoof_now` above size 5, by stripping forged
  identity rather than by tuning a penalty. It is **off by default** so the
  default configuration keeps measuring the unsigned threat model, which is what
  most real corpora are. `spoof_now` at sizes 2 and 5 stays red even with
  verification on — that residue is the corroboration inversion below, not the
  forgery.

- **The `independence` confidence model.** Implemented, flag-gated, and *not*
  default. It fixes the corroboration inversion but, on an unsigned corpus, lets
  an attacker manufacture an apparent second witness — 0 false assertions to 48.

  **Forgeable identity was the entire cause, and that is now fixed.** With
  `verifyProvenance: true` the same model asserts the false claim **zero** times.
  The reason it is still not default has therefore changed: it is no longer
  exploitable, merely less accurate than `dominance` (93.1% vs 97.2%). Do not
  re-cite the Sybil argument against it — that objection has been retired.

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

**(1) is done.** `provenance.js` gives claims an identity an attacker cannot
forge, and it is measured in `test/provenance.test.js` and the README. That
unblocks the rest of this list — but note it moved the bottleneck rather than
removing it: the remaining swarm failures are now a *confidence* problem, not an
identity one.

1. **The corroboration inversion — now the top blocker.** `dominance =
   top/(top+second)` still scores agreement and disagreement with the same
   number, and it is the only thing keeping `spoof_now` red at sizes 2 and 5
   *with verification on*. The `independence` model fixes the inversion and is
   no longer Sybil-exploitable, but scores lower overall (93.1% vs 97.2%), so it
   is not a drop-in. What is wanted is a confidence function that rewards
   agreement between *verified distinct* identities without losing the accuracy
   `dominance` has. This is the single highest-value change left.

2. **A swarm defence for the residue.** Sizes 2 and 5 of `spoof_now` are the
   whole remaining gap. Burst detection (many near-identical claims from one
   identity in a narrow window) is the obvious candidate and is now cheap to
   build, because unverified claims already collapse to a single identity.

3. **Decide what "unverified" should cost.** `unverifiedReliability` (0.3) is a
   constant, and constants are how this benchmark gets fooled. Better would be
   to derive the penalty from something observable — how much of the retrieved
   set is unverified, say — rather than fixing it by hand.

4. **The torus decision** — purpose or removal. Unchanged, still inert.

5. **`Li`, the private ledger.** The README's original "next step", and it is
   *also* an independence mechanism: an agent's own accumulated prior is one
   witness that cannot be forged by flooding the shared pool. It now composes
   naturally with provenance — the private ledger supplies a second verified
   identity rather than a second self-declared one.

6. **Sea of Ledgers / multi-PAL consensus.** Owner's longer-term idea. **The
   stated blocker is now cleared**: consensus by summing agreement was rejected
   because it is Sybil-exploitable, and the provenance result shows that hole
   closes once identity is verified. The remaining question is not whether
   summing agreement is safe, but whether it is *accurate* — the independence
   experiment says a naive sum costs about four points of overall score even when
   it cannot be exploited. Anyone starting this should measure that first.

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
