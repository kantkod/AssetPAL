import test from "node:test";
import assert from "node:assert/strict";
import { initSummary, scoreResult, finalize } from "../metrics.js";
import { overallScore, effectiveAccuracy, summaryAccuracy } from "../scoring.js";

const conflictQuery = { expected: "CONFLICT" };
const valueQuery = { expected: "v1_refund_window_B" };

test("flagging a genuine conflict counts as correct, not as an abstention", () => {
  const s = initSummary();
  scoreResult(s, conflictQuery, { status: "CONFLICT" });
  const f = finalize(s);

  assert.equal(f.correct, 1);
  assert.equal(f.wrong, 0);
  assert.equal(f.conflict_marked, 1, "still reported as a diagnostic");
  assert.equal(f.abstain, 0, "a correct conflict flag is an answer");
  assert.equal(f.accuracy, 1);
  assert.equal(f.coverage, 1);
});

test("asserting a confident value on a genuine conflict is wrong", () => {
  const s = initSummary();
  scoreResult(s, conflictQuery, { status: "ANSWER", value: "v1_x_B", confidence: 0.9 });
  const f = finalize(s);

  assert.equal(f.correct, 0);
  assert.equal(f.wrong, 1);
  assert.equal(f.wrong_confident, 1);
  assert.equal(f.accuracy, 0);
});

test("flagging a conflict on an ordinary value query is an abstention", () => {
  const s = initSummary();
  scoreResult(s, valueQuery, { status: "CONFLICT" });
  const f = finalize(s);

  assert.equal(f.correct, 0);
  assert.equal(f.wrong, 0);
  assert.equal(f.abstain, 1);
  assert.equal(f.coverage, 0);
});

test("summary totals always reconcile: answered + abstain === total", () => {
  const s = initSummary();
  scoreResult(s, conflictQuery, { status: "CONFLICT" });
  scoreResult(s, conflictQuery, { status: "ANSWER", value: "v0_x_A" });
  scoreResult(s, valueQuery, { status: "ANSWER", value: "v1_refund_window_B" });
  scoreResult(s, valueQuery, { status: "CONFLICT" });
  scoreResult(s, valueQuery, { status: "UNCERTAIN" });
  scoreResult(s, valueQuery, { status: "NO_ANSWER" });
  const f = finalize(s);

  assert.equal(f.total, 6);
  assert.equal(f.answered + f.abstain, f.total);
  assert.equal(f.correct, 2);
  assert.equal(f.wrong, 1);
  assert.equal(f.abstain, 3);
});

test("wrong-type buckets classify by value prefix", () => {
  const s = initSummary();
  scoreResult(s, valueQuery, { status: "ANSWER", value: "FALSE_x_X" });
  scoreResult(s, valueQuery, { status: "ANSWER", value: "v0_x_A" });
  scoreResult(s, valueQuery, { status: "ANSWER", value: "something_else" });

  assert.equal(s.wrong_false, 1);
  assert.equal(s.wrong_v0, 1);
  assert.equal(s.wrong_other, 1);
});

test("effectiveAccuracy rejects non-summaries and empty totals", () => {
  assert.equal(effectiveAccuracy(null), null);
  assert.equal(effectiveAccuracy({ total: 0, correct: 0 }), null);
  assert.equal(effectiveAccuracy({ total: 4, correct: 3 }), 0.75);
});

test("summaryAccuracy averages nested swarm scenarios equally", () => {
  const nested = {
    plain_swarm_0: { total: 10, correct: 10 },
    plain_swarm_2: { total: 10, correct: 0 }
  };
  assert.equal(summaryAccuracy(nested), 0.5);
});

test("overallScore never exceeds 1.0 (regression: conflict double-count)", () => {
  // Mirrors the real shape: PAL answers every conflict query correctly, half by
  // resolving a value and half by flagging CONFLICT.
  const results = {
    conflict: { PAL_LEDGER: { total: 48, correct: 48, conflict_good: 48, conflict_cases: 48 } },
    update: { PAL_LEDGER: { total: 192, correct: 192 } },
    swarm: { PAL_LEDGER: { plain_swarm_0: { total: 24, correct: 24 } } }
  };
  const score = overallScore(results);
  assert.ok(score <= 1, `score must be <= 1, got ${score}`);
  assert.equal(score, 1);
});

test("overallScore weights each experiment equally, not each query", () => {
  const results = {
    conflict: { PAL_LEDGER: { total: 10, correct: 10 } },
    update: { PAL_LEDGER: { total: 1000, correct: 0 } }
  };
  assert.equal(overallScore(results), 0.5);
});
