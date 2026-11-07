# AssetPAL: exclusion confidence (the fermion idea), pre-registration

7 Nov 2026. Written by Claude for Pontus, before any code. It comes from a conversation about bosons and fermions: adding evidence is boson-like, so copies pile up; a fermion-like rule would let only genuinely different evidence count. This answers the AssetPAL repo's three required questions, then fixes the design, the predictions and the kill criteria. Any change after this point is dated, gives its reason, and is written before any result it could affect.

## The idea in one paragraph

For each candidate answer, order its supporting claims from strongest to weakest. Give each claim a direction (a unit vector). A claim adds its score multiplied by how much *new* direction it brings: the length of the part of its vector that the stronger claims before it don't already cover. An exact copy adds nothing (A ∧ A = 0). A claim pointing somewhere new adds its full score. The answer with the most support wins, and confidence is its share against the runner-up. Everything hinges on what the directions encode.

## The three questions

### 1. What do existing approaches already explain, and what do they not?

**Plainly:** counting only genuinely different evidence is an old idea. Search engines diversify their results this way, and fact-checking methods discount sources that copy each other.

**In detail:**
- **Maximal marginal relevance** (Carbonell and Goldstein, 1998) picks each next result for relevance minus similarity to what is already picked. This is standard practice in retrieval.
- **Determinantal point processes** were first described as *fermion processes* (Macchi, 1975) and brought into machine learning by Kulesza and Taskar (2012). They score a set by the volume its vectors span. The rule above is the greedy form of that volume: each claim's new direction is its share of added volume.
- **Copy detection in truth discovery** (Dong, Berti-Equille and Srivastava, 2009) discounts sources that copy each other.
- **In this repo:**
  - `value_max` already makes exact copies inert, by construction.
  - `independence` already counts distinct witnesses. It fixed the corroboration inversion but rewarded forged source names until signed identity removed them. With signing it is no longer exploitable, but it is less accurate than `dominance`.

So the mechanism is maximal marginal relevance, or a DPP, applied to evidence. It is not new, and claiming novelty for it would be dishonest.

**What existing work leaves unexplained:** whether this geometry can serve as the *confidence rule* that decides between competing answers, and which directions make it work. `independence` failed because names cost nothing to forge. The open question is whether a direction that is harder to fake closes that hole or only moves it. One candidate is the document's wording; another is identity plus wording.

### 2. What does the hypothesis predict beyond those explanations, and what is new?

**Plainly:** the rule should help only where its directions come from something an attacker cannot cheaply vary. Measuring difference by wording should make things worse, because varied wording costs nothing.

**Predictions, fixed now:**

- **H1, identity directions add nothing here.** With directions set by verified identity (one axis per verified source), the rule reduces to "best claim per source, summed". On this corpus the false answer is almost always pushed by a single source, and the true answer by one or two. Prediction: under the strict gate, correct decisions within ±1 percentage point of `PAL_strict_value_max` (32.7%), and wrong value assertions within ±5% of its 2,634.
- **H2, wording directions manufacture witnesses.** The September generator gave attack documents 3 sentence templates and 4 closing phrases, written before this idea existed. With directions set by wording, that variety lets a flood from one source count as several witnesses. Prediction: more wrong value assertions than `value_max` in the same configuration, both unsigned and strict.
- **H3, the corroboration inversion stays fixed.** Every exclusion arm answers at least 239 of 240 `corroborated` cases correctly.
- **H4, the hoped-for win.** Some exclusion arm beats `SCOPED_RERANK_strict` on correct decisions (above 42.3%) *and* makes fewer wrong value assertions (below 2,757). Prediction: no.

**What would be new:** a measurement, not the mechanism. It is the price of a manufactured witness: how much support each extra forged document buys under each choice of direction. That turns "what counts as independent evidence?" into a number that can be compared across direction choices.

### 3. What result would separate the predictions, and what counts as failure?

**Plainly:** if the wording-based version gives more wrong answers than the current best ledger rule, it is refuted as a defence. If the identity-based version only matches the current rule, it adds nothing here. Only beating the simple reranker counts as a win.

| Hypothesis | Measure | Outcome and meaning |
|---|---|---|
| H1 | E-id against `PAL_strict_value_max` | Holds: identity-based exclusion is `value_max` plus witness counting, nothing more on this corpus |
| H2 (**kill test** for exclusion by wording) | Wrong value assertions, E-text against `value_max` in the same configuration | If E-text is higher in both unsigned and strict, exclusion by wording is refuted as a defence against manufactured agreement |
| H3 | `corroborated` family, all arms | Fails if any arm drops below 239 of 240 |
| H4 | Correct decisions and wrong assertions against `SCOPED_RERANK_strict` | Only a yes on both counts is a win, and still development data only |

**True by construction, stated now:**
- An exact duplicate adding nothing is a property of the rule. It is pinned by a unit test, not reported as a finding.
- H3 is nearly by construction: the corroborating witness has a different source and different wording.
- **Not by construction:** H2. The attack wording was written in September, before this rule, so it was neither tuned for exclusion nor against it.

**Data status:** the 7,440-case stress corpus has been examined before (repo `REPAIR_PROTOCOL.md`). Every result here is a development result. A confirmatory test needs the external WD-Ledger corpus (`claude/ASSETPAL-SECOND-CORPUS.md`), where directions could come from editor accounts and editing sessions.

## Design

**New option, off by default:** `confidenceModel: "exclusion"` with `exclusionDirections` set to one of three values:

| Arm | Direction of a claim |
|---|---|
| E-id | One axis per effective identity (the verified source, or the single shared "unverified" identity) |
| E-text | Bag-of-words of the document text: the tokenizer `retrieval.js` already uses, term counts, unit length |
| E-id+text | Both of the above joined, each half scaled by 1/√2 |

**Scoring:** per-claim scores as in `value_max` (effective reliability in both factors, recency, scope; no count penalties). Within each value, claims are ordered by score, ties broken by document id. Support = Σ score × residual length, computed by Gram–Schmidt. Confidence = top support ÷ (top + runner-up). Decision rules and thresholds are unchanged: CONFLICT below 0.65, UNCERTAIN below 0.65, as `value_max` uses them. No new constants.

**Configurations:** each arm in three settings, unsigned (default provenance), verified with penalty, and strict (`require_verified`). That makes 9 arms, run beside the existing 9 reference methods on the same shared retrieval of 6 documents.

**Checks before reporting:**
- the frozen corpus hash (`4d063e5d…`);
- the existing baseline parity asserts (PAL_legacy 879 correct and 1,861 wrong; SCOPED_RERANK 1,186 correct);
- all 70 existing tests;
- new unit tests: a copy adds zero, an orthogonal claim adds its full score, and input order doesn't change the decision.

**Reported, not gated:**
- Tables per attack family and per flood size.
- The price of a manufactured witness: for each attack family and arm, the mean residual length of the 2nd, 3rd, … distinct forged claim.
- The original benchmark's overall score, through the shared `scoring.js`.

## Where it lives

When code exists: `ledger.js` (flag-gated), `baselines.js` (passes document text to the ledger), `experiments/exclusion/` (runner and report), new tests. The three answers above go into the commit message. Results go into a report in that folder, and into the README only if worth keeping.

## Results (7 Nov 2026)

Run on branch `exp/exclusion` (from the 0.4.0 release); 76 tests pass (70 existing, 6 new). The corpus hash and every baseline parity number match the repair run. Development data only.

**Every prediction held. The rule beats nothing on this corpus, and its value is the measurement it makes possible.**

| Hypothesis | Prediction | Outcome |
|---|---|---|
| H1: identity directions add nothing here | Holds | **Holds, exactly.** E-id strict: 2,434 correct (32.7 %), 2,634 wrong assertions, identical to `PAL_strict_value_max` |
| H2 (kill test for exclusion by wording) | Holds | **Holds: exclusion by wording is refuted as a defence.** Wrong assertions: unsigned 5,934 vs 5,874; strict 2,683 vs 2,634; also with penalty 4,955 vs 4,506 |
| H3: corroboration inversion stays fixed | Holds | **Holds:** 240 of 240 `corroborated` cases in all 9 arms |
| H4: beats `SCOPED_RERANK_strict` (42.3 %, 2,757 wrong) | No | **No.** Best exclusion arm: 32.7 % |

**All arms (7,440 cases):**

| Arm | Correct | Wrong assertions | Coverage |
|---|---|---|---|
| E-id, unsigned | 1,105 (14.9 %) | 5,878 | 0.937 |
| E-id, penalized | 1,420 (19.1 %) | 4,506 | 0.790 |
| E-id, strict | 2,434 (32.7 %) | 2,634 | 0.671 |
| E-text, unsigned | 1,097 (14.7 %) | 5,934 | 0.943 |
| E-text, penalized | 1,278 (17.2 %) | 4,955 | 0.832 |
| E-text, strict | 2,426 (32.6 %) | 2,683 | 0.676 |
| E-id+text, unsigned | 1,099 (14.8 %) | 5,930 | 0.943 |
| E-id+text, penalized | 1,300 (17.5 %) | 4,904 | 0.828 |
| E-id+text, strict | 2,428 (32.6 %) | 2,679 | 0.676 |
| *Reference:* `PAL_strict_value_max` | 2,434 (32.7 %) | 2,634 | 0.671 |
| *Reference:* `SCOPED_RERANK_strict` | 3,146 (42.3 %) | 2,757 | 0.820 |

**The price of a manufactured witness** (reported, not gated): the mean support each extra forged document adds, as a share of a full independent witness, over 960 attack cases per family:

| Direction | One source, many copies (`plain`, `spoof_clones`, `spoof_varied`, `signed_compromised`) | Forged distinct names (`spoof_multi`), unsigned | Forged distinct names, identity verified |
|---|---|---|---|
| Identity | 0 | **1.00** | 0 |
| Wording | 0.39 | 0.39 | 0.39 |
| Identity + wording | 0.29 | 0.87 | 0.28 |

**Original benchmark, overall score through `scoring.js`:** E-id strict 1.000 (equal to strict `value_max`), E-text strict 0.944, E-id+text strict 0.958. Unsigned, E-id scores 0.792 against `value_max`'s 0.861: forged names become witnesses.

### What it means

- **The fermion rule is only as good as its directions.** By identity, it reduces to `value_max` plus witness counting. By wording, the September generator's 3 templates and 4 phrases buy an attacker 0.39 of a witness per extra forged document, enough to raise wrong assertions in every configuration. By name, without signatures, every forged alias is a full witness.
- **Independence has to come from a channel an attacker cannot vary cheaply.** Here that is signed identity. This matches the PAL definition of independence (different evidence, by grounding), not different words.
- **What the rule adds is the price.** "How much support does one more forged document buy?" becomes a number: 0, 0.29, 0.39 or 1.0 here, depending on what counts as a direction. That number is the honest way to compare defences against manufactured agreement.
- **Next:** on WD-Ledger, directions could come from editor accounts and editing sessions, where real accounts are costly to fake. That is the confirmatory test.

Files: `experiments/exclusion/` (runner, PREREG.md, REPORT.md), `test/exclusion.test.js`, `results/exclusion/summary.json` (regenerated, not committed). Not committed or pushed yet.
