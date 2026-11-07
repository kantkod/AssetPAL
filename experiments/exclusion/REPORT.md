# Exclusion confidence: report

Development result on the exposed 2026-09-30 stress corpus. The pre-registration, written before any code, is `PREREG.md` in this folder; regenerate the numbers with `node experiments/exclusion/run.mjs` (about 20 s), which writes `results/exclusion/summary.json`.

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

Files: `experiments/exclusion/` (runner, PREREG.md, REPORT.md), `test/exclusion.test.js`, `results/exclusion/summary.json` (regenerated, not committed).
