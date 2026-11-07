# Changelog

## Unreleased

- **Exclusion confidence,** behind a flag (`confidenceModel: "exclusion"`, `exclusionDirections`): copies add nothing, and each claim counts only for the new direction it adds. Pre-registered and run on the stress corpus (development data). By identity it equals `value_max` exactly (2,434 correct, 2,634 wrong assertions); by wording it is worse in every configuration (strict: 2,683 wrong); no arm beats `SCOPED_RERANK_strict`. It measures the price of a manufactured witness: 0 by signed identity, 0.39 by wording, 1.00 by unsigned name. See `experiments/exclusion/REPORT.md`.
- 76 tests pass (6 new).

## 0.4.0 (6 Nov 2026)

First tagged release: everything committed up to 30 Sep 2026.

**About the name.** Earlier research notes used "v0.4" for August 2026 working files (a hardened ledger, ablation, scope-poison and degradation runners, and a `WRITEUP.md`). Those files were never committed and could not be recovered. This release contains only what is in this repository. Its September work covers the same threat, forged timestamps and forged source identity, by a different route.

### What's in it
- **One scoring rule** shared by all four surfaces that report a score (`81071a2`).
- **Honest attack variants:** spoofed floods dated at or before query time. PAL's weakness is now measurable, and the failing cells are pinned red (`0f84680`).
- **An honest strong baseline,** `SCOPED_RERANK` (`6ace58b`).
- **The `independence` confidence model,** behind a flag: a negative result (`cb561fc`).
- **Structural invariant tests** (`21b2fc2`).
- **Unforgeable source identity:** signed claim tags, `verifyProvenance` (`827f9cf`).
- **An opt-in strict evidence gate** (`provenancePolicy: "require_verified"`), **experimental `value_max` confidence,** and a fixed-budget stress test of 7,440 cases (`6718475`).

### Results, as the repository reports them
- On the original corpus, signed identity recovers `spoof_past` entirely and `spoof_now` above five clones.
- On the 7,440-case stress test (development data, examined before the changes were made):
  - The strict gate cuts PAL's wrong value assertions from 1,861 to 801.
  - `value_max` fixes all 240 corroboration failures but, combined with the gate, raises wrong assertions to 2,634.
  - **A strict scope-aware reranker makes the most correct decisions:** 42.3%, against 32.7% for PAL's best mode.
  - PAL's strict-dominance mode has the lowest wrong-assertion rate (28.9% of its answers) but answers only 38.5% of value questions.
- PAL's zero-false-assertion record holds only on the original corpus.
- Defaults are unchanged. 70 tests pass.

### Not yet
- No licence.
- One corpus generator; no independent held-out corpus.
