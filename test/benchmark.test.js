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

test("swarm: PAL holds 100% at every size, in both plain and spoof mode", () => {
  for (const [scenario, s] of Object.entries(swarm.PAL_LEDGER)) {
    assert.equal(s.accuracy, 1, `PAL should hold at ${scenario}`);
  }
});

test("swarm: rerank resists plain flooding but collapses under source spoofing", () => {
  // This three-tier split is the benchmark's sharpest result — guard it.
  const rr = swarm.RERANK_REL_TIME;
  for (const size of [2, 5, 10, 20, 40]) {
    assert.equal(rr[`plain_swarm_${size}`].accuracy, 1, `rerank plain ${size}`);
    assert.equal(rr[`spoof_swarm_${size}`].accuracy, 0, `rerank spoof ${size}`);
  }
});

test("swarm: vanilla and majority collapse in both modes", () => {
  for (const b of ["VANILLA_RAG", "MAJORITY_VOTE"]) {
    for (const mode of ["plain", "spoof"]) {
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
