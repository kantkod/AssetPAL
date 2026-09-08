import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { generateCorpus } from "../generate_corpus.js";
import { readJson } from "../io.js";
import { runConflictCore, runUpdateCore, runSwarmCore } from "../experiment_core.js";
import { overallScore } from "../scoring.js";
import { signClaim, verifyClaim, effectiveSource, UNVERIFIED } from "../provenance.js";

// Unforgeable source identity — open thread 1, the stated blocker for the swarm
// defence, the private ledger and multi-PAL consensus.
//
// The attack every spoof mode runs is a lie about *identity*: a document that
// says "I am PolicyPortal" when it is not. No content analysis separates that
// from a genuine PolicyPortal update, because the two are the same bytes; the
// corpus proves it, since PolicyPortal legitimately revises its own claims for
// the same scope at a later timestamp. Identity therefore has to be settled out
// of band, which is what the provenance tags do.

const cfg = readJson("./default.json");

if (!fs.existsSync("./results/corpus/corpus.json")) await generateCorpus();
const corpus = readJson("./results/corpus/corpus.json");
const queries = readJson("./results/corpus/queries.json");

function run(over) {
  const c = { ...cfg, ...over };
  return {
    conflict: runConflictCore(c, corpus, queries.conflict).results,
    update: runUpdateCore(c, corpus, queries.update).results,
    swarm: runSwarmCore(c, corpus, queries.swarm).results
  };
}

const falseAssertions = res =>
  Object.values(res.swarm.PAL_LEDGER).reduce((n, s) => n + (s.wrong_false || 0), 0);

const swarmAccuracy = res => {
  const accs = Object.values(res.swarm.PAL_LEDGER).map(s => s.accuracy);
  return accs.reduce((a, b) => a + b, 0) / accs.length;
};

// --- The primitive -----------------------------------------------------------

const genuine = corpus.docs.find(d => (d.claims || []).length > 0).claims[0];

test("every claim the generator emits carries a valid tag", () => {
  const claims = corpus.docs.flatMap(d => d.claims || []);
  assert.ok(claims.length > 0);
  for (const c of claims) {
    assert.ok(verifyClaim(c, cfg.seed), `${c.docId} has no valid provenance tag`);
  }
});

test("a tag does not survive relabelling the source", () => {
  // The spoof attack in one assertion: take a genuine document and rename its
  // source to a trusted one. The tag was computed with the real source's
  // secret, so it no longer verifies.
  const relabelled = { ...genuine, source: "PolicyPortal" };
  assert.ok(genuine.source !== "PolicyPortal");
  assert.equal(verifyClaim(relabelled, cfg.seed), false);
});

test("a tag does not survive editing the claim's content", () => {
  for (const mutation of [
    { value: "FALSE_injected" },
    { timestamp: genuine.timestamp + 5 },
    { scope: { ...genuine.scope, product: "Z" } }
  ]) {
    assert.equal(
      verifyClaim({ ...genuine, ...mutation }, cfg.seed),
      false,
      `mutation ${JSON.stringify(mutation)} should invalidate the tag`
    );
  }
});

test("an attacker cannot mint a tag for a source they do not control", () => {
  // They can sign perfectly well as themselves — signing prevents impersonation,
  // not lying — but the tag then verifies as *them*, which is the point.
  const forged = { ...genuine, source: "PolicyPortal", value: "FALSE_x" };
  forged.sig = signClaim({ ...forged, source: "Wiki" }, cfg.seed);
  assert.equal(verifyClaim(forged, cfg.seed), false);
});

test("unverified claims collapse into one anonymous identity", () => {
  // Witness counting keys on identity, so a thousand forged documents must be
  // one unknown speaker rather than a thousand corroborating ones.
  const on = { ...cfg, verifyProvenance: true };
  const a = { ...genuine, source: "PolicyPortal", value: "FALSE_a" };
  const b = { ...genuine, source: "Handbook", value: "FALSE_b" };
  assert.equal(effectiveSource(a, on), UNVERIFIED);
  assert.equal(effectiveSource(b, on), UNVERIFIED);
  assert.equal(effectiveSource(genuine, on), genuine.source);
});

test("verification off leaves identity exactly as declared", () => {
  const off = { ...cfg, verifyProvenance: false };
  const forged = { ...genuine, source: "PolicyPortal", value: "FALSE_x" };
  assert.equal(effectiveSource(forged, off), "PolicyPortal");
});

// --- What it buys ------------------------------------------------------------

const domOff = run({ confidenceModel: "dominance", verifyProvenance: false });
const domOn = run({ confidenceModel: "dominance", verifyProvenance: true });
const indOff = run({ confidenceModel: "independence", verifyProvenance: false });
const indOn = run({ confidenceModel: "independence", verifyProvenance: true });

test("provenance verification is genuinely opt-in", () => {
  // The mechanism must not perturb the published baseline when switched off,
  // or every number in the README silently becomes a different measurement.
  assert.equal(overallScore(domOff).toFixed(4), "0.9028");
});

test("verification closes most of the spoof-swarm gap", () => {
  assert.ok(
    swarmAccuracy(domOn) > swarmAccuracy(domOff),
    "signing should raise swarm accuracy"
  );
  assert.equal(overallScore(domOn).toFixed(4), "0.9722");
  // spoof_past is fully recovered: back-dated forgeries lose the reputation
  // they were forging, and nothing else was propping them up.
  for (const n of cfg.swarmSizes) {
    assert.equal(
      domOn.swarm.PAL_LEDGER[`spoof_past_swarm_${n}`].accuracy, 1,
      `spoof_past size ${n} should be fully recovered`
    );
  }
});

test("verification does NOT fully fix spoof_now at small flood sizes", () => {
  // Still red at 2 and 5, and deliberately so. Stripping the forged reputation
  // is necessary but not sufficient: `dominance` compares only the top two
  // claims, so once the clones are demoted the margin over the real update is
  // still too thin to clear confidenceThreshold, and PAL abstains. This is the
  // documented corroboration inversion, not a provenance failure — the two
  // weaknesses are separable and only one of them is fixed here.
  assert.equal(domOn.swarm.PAL_LEDGER.spoof_now_swarm_2.accuracy, 0);
  assert.equal(domOn.swarm.PAL_LEDGER.spoof_now_swarm_5.accuracy, 0);
  assert.equal(domOn.swarm.PAL_LEDGER.spoof_now_swarm_10.accuracy, 1);
});

test("PAL still never asserts the false claim, under any configuration", () => {
  // The integrity invariant has to survive the new mechanism in all four
  // combinations — including the one that used to break it.
  assert.equal(falseAssertions(domOff), 0);
  assert.equal(falseAssertions(domOn), 0);
  assert.equal(falseAssertions(indOn), 0);
});

// --- The negative result, resolved and replaced ------------------------------

test("forgeable identity was the whole cause of the sybil hole", () => {
  // The independence model asserted the false claim 48 times because it summed
  // evidence across self-declared sources, so a forgery counted as a second
  // independent witness. With identity verified, the forgery is not a witness
  // at all and the count goes to zero. This confirms the diagnosis recorded in
  // CLAUDE.md: independence was never wrong in principle, it was resting on a
  // field the attacker controls.
  assert.equal(falseAssertions(indOff), 48);
  assert.equal(falseAssertions(indOn), 0);
});

test("independence is still not the default — but for a new reason", () => {
  // It is no longer exploitable. It is simply worse: dominance scores higher
  // both overall and on the swarm experiment even after both are given
  // unforgeable identity. The old reason to reject it has been removed, so the
  // honest justification has to be restated rather than inherited.
  assert.ok(
    overallScore(domOn) > overallScore(indOn),
    `dominance ${overallScore(domOn)} should still beat independence ${overallScore(indOn)}`
  );
  assert.ok(swarmAccuracy(domOn) > swarmAccuracy(indOn));
  assert.equal(cfg.confidenceModel ?? "dominance", "dominance");
});

test("the shipped default remains the unsigned threat model", () => {
  // Deliberate: most real corpora are unsigned, so the default configuration
  // keeps measuring that world and the red cells stay red. Provenance is a
  // measured mitigation, not a silent upgrade to the headline number.
  assert.equal(cfg.verifyProvenance, false);
});
