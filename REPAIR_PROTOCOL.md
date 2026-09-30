# Repair protocol — 2026-09-30

Base: f10f9186fc695477644406c357fb9468d9ae0881. Written before implementing or running repairs.

## Required pre-simulation answers

1. Plain: identity checking and comparing different answers are established techniques; our existing implementation combines them poorly.
   Detail: existing scope-aware ranking handles updates; HMAC verification establishes benchmark identity, not truth. The current dominance ratio compares individual claims even when they agree. The existing independence model groups values but accumulates source mass and changes the attack behavior. These are standard aggregation and trust-policy choices, not novel physical or epistemic principles.
2. Plain: the new opt-in mode should prevent a forgery from winning solely through freshness and should treat repeated agreement as agreement.
   Detail: introduce provenancePolicy=require_verified, valid only with verifyProvenance=true, excluding unverified evidence from decisioning before any recency score. Introduce confidenceModel=value_max: each distinct value competes using its strongest eligible claim, with no multiplicity penalties or sums. Use effective reliability in both reliability factors in this mode. Identical copies cannot change the maximum and agreeing evidence cannot become a contradictory runner-up. This does not reward purported independence, which verified names alone cannot establish. Defaults and legacy benchmark modes remain available unchanged.
3. Plain: the repair must pass the actual captured failures and invariance tests; signed lies and missing evidence remain allowed failure modes.
   Detail: replay the verified-forgery-with-truth example expecting the truth, the all-forgery example expecting NO_ANSWER, and the agreeing-sources example expecting the true value. Repetition and input order must not alter the decision/confidence. Conflicting strongest values with equal support must still return CONFLICT. Signed false claims can still win: keep a pinned counterexample, not a promise of safety. Reject require_verified without verification rather than silently accepting claims. Run all existing tests, the original benchmark, and the frozen 7,440-case dataset with default, value_max, strict dominance, strict value_max, and strict independence configurations. Report errors, coverage and matched 25% risk; improvements on this exposed dataset are development results only.

## Boundaries

The strict gate's rejection of invalid signatures is true by construction, a specified trust contract rather than a novel result. It costs availability when genuine claims are unsigned or absent from retrieval. It cannot repair false content from a valid signer, forged externally supplied reliability metadata, or compromised keys. The fixture set is development data. A subsequent externally authored evaluation is still required. No threshold tuning or source reliability changes are planned. Soft scope matching is unchanged. Any deviations from this protocol must be documented.
