import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { generateCorpus } from "../generate_corpus.js";
import { readJson } from "../io.js";
import { runConflictCore, runUpdateCore, runSwarmCore } from "../experiment_core.js";
import { overallScore } from "../scoring.js";

// End-to-end guards on the claims the README makes. The corpus is seeded, so
// these are exact, not approximate.
const cfg = readJson("./default.json");

if (!fs.existsSync("./results/corpus/corpus.json")) await generateCorpus();
const corpus = readJson("./results/corpus/corpus.json");
const queries = readJson("./results/corpus/queries.json");

const conflict = runConflictCore(cfg, corpus, queries.conflict).results;
const update = runUpdateCore(cfg, corpus, queries.update).results;
const swarm = runSwarmCore(cfg, corpus, queries.swarm).results;

test("corpus generation is deterministic in shape", () => {
  assert.equal(corpus.docs.length, 168);
  assert.equal(queries.conflict.length, 48);
  assert.equal(queries.update.length, 192);
  assert.equal(queries.swarm.length, 24);
});

test("conflict: PAL flags every hard conflict and never answers wrong", () => {
  const pal = conflict.PAL_LEDGER;
  assert.equal(pal.conflict_good_rate, 1);
  assert.equal(pal.wrong, 0);
  assert.equal(pal.accuracy, 1);
});

test("conflict: baselines guess instead of flagging", () => {
  assert.equal(conflict.VANILLA_RAG.conflict_good_rate, 1 / 6);
  assert.equal(conflict.MAJORITY_VOTE.conflict_good_rate, 1 / 6);
  assert.equal(conflict.RERANK_REL_TIME.conflict_good_rate, 0.5);
  // Every baseline answers confidently on hard conflicts; none abstain.
  for (const b of ["VANILLA_RAG", "MAJORITY_VOTE", "RERANK_REL_TIME"]) {
    assert.equal(conflict[b].conflict_marked, 0, `${b} should never flag CONFLICT`);
  }
});

test("update: PAL respects scope, baselines over-update", () => {
  const pal = update.PAL_LEDGER;
  assert.equal(pal.accuracy, 1);
  assert.equal(pal.over_update_rate, 0);
  assert.equal(pal.adopted_new_rate, 1);

  for (const b of ["VANILLA_RAG", "MAJORITY_VOTE", "RERANK_REL_TIME"]) {
    assert.equal(update[b].accuracy, 0.625, `${b} accuracy`);
    assert.equal(update[b].over_update_rate, 0.75, `${b} over_update_rate`);
  }
});

test("update: the four baselines are not accidentally identical to PAL", () => {
  // Regression for PR #7: a wildcard-scoped FALSE doc once made all four agree.
  assert.notEqual(update.PAL_LEDGER.accuracy, update.RERANK_REL_TIME.accuracy);
});

test("swarm: PAL never asserts the false claim, in any mode at any size", () => {
  // The integrity invariant. PAL may be jammed into abstaining by a spoofed
  // flood, but it must never be argued into repeating the false value. This is
  // the property the ledger actually guarantees — guard it hardest.
  for (const [scenario, s] of Object.entries(swarm.PAL_LEDGER)) {
    assert.equal(s.wrong_false, 0, `PAL asserted the FALSE claim at ${scenario}`);
    assert.equal(s.wrong, 0, `PAL gave a wrong answer at ${scenario}`);
  }
});

test("swarm: PAL holds 100% against plain and post-dated spoof floods", () => {
  for (const mode of ["plain", "spoof_future"]) {
    for (const size of [0, 2, 5, 10, 20, 40]) {
      assert.equal(swarm.PAL_LEDGER[`${mode}_swarm_${size}`].accuracy, 1,
        `PAL should hold at ${mode}_swarm_${size}`);
    }
  }
});

test("swarm: same-tick and back-dated spoofs degrade PAL into abstention", () => {
  // Documents a KNOWN WEAKNESS, not a desired result. futureTimestampPenalty
  // does not fire when clones are dated at or before nowTs, so only the
  // signature penalty is left — and at small swarm sizes it is too weak to
  // separate the clones from the real update. PAL goes UNCERTAIN/CONFLICT
  // rather than wrong. Update these expectations when the defence improves.
  for (const mode of ["spoof_now", "spoof_past"]) {
    for (const size of [2, 5, 10]) {
      const s = swarm.PAL_LEDGER[`${mode}_swarm_${size}`];
      assert.equal(s.accuracy, 0, `${mode}_swarm_${size} expected to fail today`);
      assert.equal(s.abstain, s.total,
        `${mode}_swarm_${size} should fail by abstaining, not by answering wrong`);
    }
  }
});

test("swarm: PAL recovers at large spoof sizes as the signature penalty bites", () => {
  // Non-monotonic by construction: more clones means a heavier signature
  // penalty, so a big flood is easier to reject than a small one.
  assert.equal(swarm.PAL_LEDGER.spoof_now_swarm_40.accuracy, 1);
  assert.equal(swarm.PAL_LEDGER.spoof_past_swarm_20.accuracy, 1);
  assert.equal(swarm.PAL_LEDGER.spoof_past_swarm_40.accuracy, 1);
});

test("swarm: rerank resists plain flooding but is poisoned by every spoof variant", () => {
  const rr = swarm.RERANK_REL_TIME;
  for (const size of [2, 5, 10, 20, 40]) {
    assert.equal(rr[`plain_swarm_${size}`].accuracy, 1, `rerank plain ${size}`);
    for (const mode of ["spoof_future", "spoof_now", "spoof_past"]) {
      assert.equal(rr[`${mode}_swarm_${size}`].accuracy, 0, `rerank ${mode} ${size}`);
      assert.equal(rr[`${mode}_swarm_${size}`].wrong_false, rr[`${mode}_swarm_${size}`].total,
        `rerank should assert the FALSE claim at ${mode}_swarm_${size}`);
    }
  }
});

test("swarm: vanilla and majority collapse in both modes", () => {
  for (const b of ["VANILLA_RAG", "MAJORITY_VOTE"]) {
    for (const mode of ["plain", "spoof_future", "spoof_now", "spoof_past"]) {
      assert.equal(swarm[b][`${mode}_swarm_0`].accuracy, 1, `${b} ${mode} baseline`);
      assert.equal(swarm[b][`${mode}_swarm_40`].accuracy, 0, `${b} ${mode} at 40`);
    }
  }
});

test("overall score is a valid probability", () => {
  const score = overallScore({ conflict, update, swarm });
  assert.ok(score >= 0 && score <= 1, `score out of range: ${score}`);
});

test("every summary reconciles answered + abstain === total", () => {
  const flat = [
    ...Object.values(conflict),
    ...Object.values(update),
    ...Object.values(swarm).flatMap(b => Object.values(b))
  ];
  for (const s of flat) {
    assert.equal(s.answered + s.abstain, s.total);
    assert.ok(s.accuracy >= 0 && s.accuracy <= 1);
  }
});
