# Trust and confidence repair — development results

30 September 2026. Base revision: `f10f9186fc695477644406c357fb9468d9ae0881`.

## Finding

**Strict evidence eligibility helps. Fixing corroboration alone is not a safety improvement.** The trust gate reduces wrong assertions from 1,861 to 801 on the exposed 7,440-case stress test. The new value-based confidence mode fixes all 240 corroboration failures but, combined with the gate, raises wrong assertions to 2,634. These are development results; the corpus was already examined before implementation. Defaults remain unchanged.

## Changes

- `provenancePolicy: "require_verified"` requires `verifyProvenance: true`. It excludes ineligible claims after shared retrieval and before scoring; no retrieval refill. An entirely ineligible context returns `NO_ANSWER`. Unknown policy names and the invalid switch combination raise errors.
- `confidenceModel: "value_max"` compares distinct values using their strongest eligible claims. It makes exact copies and additional weaker same-value claims inert, rather than letting corroboration become its own rival. It does not accumulate independent witnesses. This mode skips source/signature count penalties and uses effective reliability in both reliability factors. It is experimental.
- Malformed signatures are treated as unverified, including strings whose character count and byte length differ; they no longer throw from `timingSafeEqual`.
- Sixteen regression tests cover captured failures, verification configuration, malformed tags, corroboration, conflicts, multiplicity, ordering, capped reliability, and a signed-liar counterexample. All 70 tests pass. Ten of the initial 15 new tests failed against the unchanged implementation; the malformed-tag regression was added with its defensive fix.
- The frozen generator and runner regenerate the same corpus hash, share exactly six retrieved documents across methods, assert historical baseline counts, and save summaries and query traces under gitignored `results/repair/`.

## What existing work explains, the prediction, and the failure criterion

Identity verification and max aggregation are conventional techniques, not novel truth mechanisms. The defect was combining soft trust penalties with unbounded recency advantage and comparing individual agreeing claims as competitors.

Before coding, the repair predicted that strict mode would reject the captured forgery regardless of freshness, the all-forgery context would yield no answer, and agreeing copies would not lower confidence. It would fail if any captured behavior persisted or duplicate/order changes altered the chosen value or confidence. The implemented tests cover those contracts. Signed false claims were explicitly expected to remain possible.

See [REPAIR_PROTOCOL.md](../../REPAIR_PROTOCOL.md) for the pre-implementation protocol. Its SHA-256 is `e86628b40233e7726828b866c4e11e8d01a5b1867870ff23956fb7689b338542`. There was no threshold tuning and no replacement of the frozen corpus. The strict gate is a policy choice whose invalid-signature rejection is true by construction, not a new empirical discovery.

## Same fixed-budget development cases

240 policy worlds × 31 cases = 7,440 cases, including 7,200 value questions and 240 genuine conflicts. Each attack family has 1,200 cases across sizes 1, 2, 5, 10 and 20. The 6,000 attack cases make this deliberately harsh; the rates do not estimate production performance.

| Configuration | Correct decisions | Value-answer coverage | Wrong value assertions | Wrong / value answers | Wrong at matched 25% coverage |
|---|---:|---:|---:|---:|---:|
| PAL_legacy | 11.8% | 34.7% | 1,861 | 74.4% | 72.9% |
| PAL_legacy_verified | 12.2% | 31.6% | 1,609 | 70.7% | 70.9% |
| PAL_value_max_unsigned | 14.9% | 93.6% | 5,874 | 87.2% | 93.4% |
| PAL_value_max_penalized | 19.1% | 79.0% | 4,506 | 79.2% | 73.1% |
| PAL_strict_dominance | 29.7% | 38.5% | 801 | 28.9% | 38.1% |
| PAL_strict_value_max | 32.7% | 67.1% | 2,634 | 54.6% | 69.8% |
| PAL_strict_independence | 32.9% | 66.2% | 2,560 | 53.7% | 64.8% |
| SCOPED_RERANK | 15.9% | 100.0% | 6,014 | 83.5% | 93.6% |
| SCOPED_RERANK_strict | 42.3% | 82.0% | 2,757 | 46.7% | 56.4% |

Correct decisions include correct CONFLICT responses; unnecessary abstention counts as a miss. Value coverage and assertion risk exclude genuine-conflict questions. Matched coverage retains the most confident native answers; confidence ties receive equal fractional weights independent of correctness. No answers are forced and confidence is not calibrated.

**The strong baseline matters:** the strict scope-aware reranker achieves 42.3% correctness, higher than strict value_max PAL at 32.7%, and lower assertion risk. The existing independence model with strict verification also slightly outperforms value_max here. Max aggregation is retained for its tested copy invariance, not because it wins the benchmark.

## Separating the effects

| Scenario | Legacy PAL correct | Strict dominance correct | Strict value_max correct | Strict value_max wrong assertions |
|---|---:|---:|---:|---:|
| clean_current | 153 / 240 | 153 / 240 | 153 / 240 | 0 |
| clean_outscope | 64 / 240 | 64 / 240 | 64 / 240 | 32 |
| before_update | 240 / 240 | 240 / 240 | 240 / 240 | 0 |
| hard_conflict | 240 / 240 | 240 / 240 | 240 / 240 | 0 |
| corroborated | 0 / 240 | 0 / 240 | 240 / 240 | 0 |
| stale_distractor | 153 / 240 | 153 / 240 | 153 / 240 | 0 |
| plain | 29 / 1200 | 29 / 1200 | 15 / 1200 | 1065 |
| spoof_clones | 0 / 1200 | 443 / 1200 | 443 / 1200 | 111 |
| spoof_varied | 0 / 1200 | 436 / 1200 | 436 / 1200 | 127 |
| spoof_multi | 0 / 1200 | 450 / 1200 | 450 / 1200 | 105 |
| signed_compromised | 0 / 1200 | 0 / 1200 | 0 / 1200 | 1194 |

- The strict gate removes forged documents, but remaining old or out-of-scope signed evidence can still yield wrong answers when the authoritative update is absent. There are 1,297 all-ineligible contexts returning NO_ANSWER across the forged-source families.
- The 240 clean corroboration failures are repaired by value_max. The genuine-conflict detection count remains 240 / 240.
- A signed compromised source yields 1,194 wrong assertions under strict value_max, versus 238 with dominance. Authenticating a speaker does not establish truth or policy authority.
- Low-trust signed floods also become more harmful when duplicate ties no longer force uncertainty. It would be misleading to claim this model is safer merely because it fixes the confidence inversion.
- Strict dominance gives the more conservative development result: 38.5% coverage, 801 wrong assertions, and 38.1% error at matched 25% coverage. Strict value_max raises coverage to 67.1% but raises that matched error to 69.8%.

## Original benchmark

| Configuration | Original overall score |
|---|---:|
| Default dominance | 90.3% |
| Legacy provenance penalty + dominance | 97.2% |
| value_max, unsigned | 86.1% |
| Strict verification + dominance | 100.0% |
| Strict verification + value_max | 100.0% |
| Strict verification + independence | 100.0% |

These use the shared `scoring.js` formula. All 54 existing tests retain their expected outcomes; no original corpus, thresholds or expected failing cells were changed. A perfect score on that synthetic corpus is not external validation, and the development stress test above retains serious failures.

## Limits and next decision

Both changes are opt-in. The default remains suitable for reproducing the historical unsigned experiment, not a claim that its failure modes are solved. Strict mode is only appropriate where the caller intends to require authenticated evidence and accepts lost coverage for unsigned genuine material.

The cryptographic benchmark uses deterministic seed-derived HMAC secrets. It models signature validity, not deployment key management. Reliability remains externally supplied and is not covered by the claim digest. Soft scope weighting and recency dominance among validly signed claims remain unresolved. These repairs do not infer which signers may issue binding policy updates.

Before promoting value_max, the next design question is how source authority and authenticated supersession constrain competing signed claims. That requires explicit policy metadata or a justified abstention rule; another tuned recency constant would not establish truth. A separate externally authored evaluation is still required after development.

## Reproduce

From the repository root with Node installed (this run: v24.19.0):

```bash
npm test
npm run bench:repair
npm run bench:repair:original
```

The fixed-budget runner writes `cases.jsonl`, `traces.jsonl`, and `summary.json` under `results/repair/`. The original comparator adds `original.json`. Generated outputs are gitignored. The report records the results without committing transient runs.

Frozen corpus SHA-256: `4d063e5d7faa2ce8a73d983a09719bd4fc081fe27ed2027168622839d781aa9d`.

Replay fixtures in `test/fixtures/heldout-failures.json` are the exact four captured specimens from the first evaluation. They contain synthetic data only. The former evaluation remains untouched.
