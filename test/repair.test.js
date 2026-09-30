import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TruthLedger } from "../ledger.js";
import { answerWithBaseline } from "../baselines.js";
import { signClaim } from "../provenance.js";

const base = JSON.parse(fs.readFileSync(new URL("../default.json", import.meta.url)));
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/heldout-failures.json", import.meta.url)));
const strict = { ...base, verifyProvenance: true, provenancePolicy: "require_verified", confidenceModel: "value_max" };
const scope = { region: "EU", tier: "PRO", product: "A" };

function replay(name, cfg = strict) {
  const { trace, case: c } = fixtures[name];
  const docs = trace.retrieved.map(id => c.docs.find(d => d.id === id));
  return { result: answerWithBaseline("PAL_LEDGER", cfg, docs, c.q), expected: c.q.expected };
}

function claim(value, source, timestamp = 20, reliability = 0.9, valid = true) {
  const c = { domain: "HR", subject: "repair", scope, value, source, timestamp, reliability, docId: source + timestamp };
  c.sig = valid ? signClaim(c, base.seed) : "0".repeat(32);
  return c;
}

function decide(claims, cfg = strict) {
  const ledger = new TruthLedger(cfg);
  for (const c of claims) ledger.upsertClaim(c);
  return ledger.decide("HR", "repair", 25, scope);
}

test("captured verified forgery loses to retrieved authenticated truth", () => {
  const { result, expected } = replay("verified_wrong_support_True");
  assert.equal(result.status, "ANSWER");
  assert.equal(result.value, expected);
});

test("captured all-forgery context returns no answer under strict verification", () => {
  const { result } = replay("verified_wrong_support_False");
  assert.equal(result.status, "NO_ANSWER");
  assert.equal(result.value, null);
});

test("captured corroboration answers correctly without falling below the gate", () => {
  const { result, expected } = replay("corroboration_abstention");
  assert.equal(result.status, "ANSWER");
  assert.equal(result.value, expected);
});

test("strict provenance cannot silently operate with verification switched off", () => {
  assert.throws(() => new TruthLedger({ ...strict, verifyProvenance: false }), /verifyProvenance/);
});

test("unknown provenance policies fail closed instead of silently weakening the gate", () => {
  assert.throws(() => new TruthLedger({ ...strict, provenancePolicy: "require_verifed" }), /provenancePolicy/);
});

test("unsigned genuine material has an explicit availability cost in strict mode", () => {
  const c = claim("true", "Portal");
  delete c.sig;
  assert.equal(decide([c]).status, "NO_EVIDENCE");
});

test("malformed provenance is ineligible rather than crashing strict decisioning", () => {
  for (const sig of [null, 123, "é".repeat(32), "g".repeat(32), "", "a".repeat(31)]) {
    const c = { ...claim("true", "Portal"), sig };
    assert.equal(decide([c]).status, "NO_EVIDENCE");
  }
});

test("equal opposing verified values remain a conflict", () => {
  const d = decide([claim("A", "Portal"), claim("B", "Board")]);
  assert.equal(d.status, "CONFLICT");
  assert.equal(d.picks.length, 2);
});

test("agreement is not a competing runner-up, including against a weaker rival", () => {
  const truth = claim("A", "Portal"), rival = claim("B", "Archive", 1, 0.5);
  const one = decide([truth, rival]);
  const two = decide([truth, claim("A", "Board"), rival]);
  assert.equal(two.status, "RESOLVED");
  assert.equal(two.confidence, one.confidence);
  assert.ok(two.confidence > base.confidenceThreshold);
});

test("exact copies of either side cannot change value support or confidence", () => {
  const a = claim("A", "Portal"), b = claim("B", "Board", 18, 0.8);
  const expected = decide([a, b]);
  for (const n of [2, 5, 40]) {
    const moreA = decide([...Array(n).fill(a), b]);
    const moreB = decide([a, ...Array(n).fill(b)]);
    for (const actual of [moreA, moreB]) {
      assert.equal(actual.status, expected.status);
      assert.equal(actual.confidence, expected.confidence);
      assert.equal(actual.picks[0].value, expected.picks[0].value);
    }
  }
});

test("same-value repetitions at older timestamps do not reduce support", () => {
  const a = claim("A", "Portal"), b = claim("B", "Board", 18, 0.8);
  const expected = decide([a, b]);
  const actual = decide([a, b, ...Array.from({ length: 20 }, (_, i) => claim("A", "Portal", -i))]);
  assert.equal(actual.confidence, expected.confidence);
  assert.equal(actual.status, expected.status);
});

test("value decision is permutation-invariant", () => {
  const a = claim("A", "Portal"), b = claim("B", "Board", 18, 0.8), c = claim("A", "Witness");
  const expected = decide([a, b, c]);
  for (const cs of [[c, b, a], [b, a, c], [b, c, a]]) {
    const d = decide(cs);
    assert.equal(d.status, expected.status);
    assert.equal(d.confidence, expected.confidence);
    assert.equal(d.picks[0].value, expected.picks[0].value);
  }
});

test("value_max with penalized provenance does not retain the declared base weight", () => {
  const cfg = { ...strict, provenancePolicy: "penalize" };
  const score = rel => {
    const l = new TruthLedger(cfg);
    l.upsertClaim(claim("X", "Forged", 20, rel, false));
    return l.query("HR", "repair", 25, scope)[0].score;
  };
  assert.equal(score(0.99), score(0.4));
});

test("strict eligibility is orthogonal to the legacy confidence model", () => {
  const { result, expected } = replay("verified_wrong_support_True", { ...strict, confidenceModel: "dominance" });
  assert.equal(result.status, "ANSWER");
  assert.equal(result.value, expected);
});

test("signed lies remain possible: freshness is not semantic truth", () => {
  const d = decide([claim("true", "Portal", 1), claim("lie", "Compromised", 25, 0.99)]);
  assert.equal(d.status, "RESOLVED");
  assert.equal(d.picks[0].value, "lie");
  assert.ok(d.confidence > base.confidenceThreshold);
});

test("legacy model remains the default until its tradeoffs are explicitly accepted", () => {
  assert.equal(base.confidenceModel, "dominance");
  assert.equal(base.verifyProvenance, false);
  assert.equal(base.provenancePolicy ?? "penalize", "penalize");
});
