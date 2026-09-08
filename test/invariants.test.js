import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import crypto from "crypto";
import { generateCorpus } from "../generate_corpus.js";
import { readJson } from "../io.js";
import { runConflictCore, runUpdateCore, runSwarmCore } from "../experiment_core.js";
import { makeSwarmDocs, isSpoofMode } from "../retrieval.js";

// Structural guards for the invariants in CLAUDE.md that the behavioural suite
// cannot see. These do not measure how well PAL performs; they pin properties
// of the harness itself, so that a change which quietly invalidates a published
// result fails here instead of silently rewriting the benchmark.

const cfg = readJson("./default.json");

if (!fs.existsSync("./results/corpus/corpus.json")) await generateCorpus();
const corpus = readJson("./results/corpus/corpus.json");
const queries = readJson("./results/corpus/queries.json");

function runAllCores(c) {
  return {
    conflict: runConflictCore(c, corpus, queries.conflict).results,
    update: runUpdateCore(c, corpus, queries.update).results,
    swarm: runSwarmCore(c, corpus, queries.swarm).results
  };
}

// --- Invariant: one scoring rule -------------------------------------------

// bench.js, index.js, build.js and the Netlify function once carried two
// different formulas and reported 116.7% and 95.45% for the same run. The fix
// was to centralise in scoring.js; this keeps it centralised. A surface that
// grows its own accuracy arithmetic fails here rather than shipping a second
// number to the site.
const SCORE_SURFACES = [
  "bench.js",
  "index.js",
  "build.js",
  "netlify/functions/run-experiment.js"
];

const IMPORTS_SCORING =
  /import\s*\{[^}]*\boverallScore\b[^}]*\}\s*from\s*["'][^"']*scoring\.js["']/;

// A local definition of the score, or raw correct/total arithmetic. Legitimate
// in scoring.js and nowhere else.
const INLINES_SCORE =
  /(function\s+overallScore|const\s+overallScore\s*=)|correct\s*\/\s*[A-Za-z_.[\]]*total/;

test("every reporting surface imports the one scoring rule", () => {
  for (const file of SCORE_SURFACES) {
    const src = fs.readFileSync(file, "utf8");
    assert.ok(
      IMPORTS_SCORING.test(src),
      `${file} must import overallScore from scoring.js`
    );
  }
});

test("no reporting surface inlines its own score calculation", () => {
  for (const file of SCORE_SURFACES) {
    const src = fs.readFileSync(file, "utf8");
    assert.ok(
      !INLINES_SCORE.test(src),
      `${file} computes a score locally; scoring.js is the single source of truth`
    );
  }
});

test("scoring.js is the one place the score arithmetic lives", () => {
  // Guards the guard: if this stops matching, the patterns above have drifted
  // away from the code they are meant to police and would silently pass.
  assert.ok(INLINES_SCORE.test(fs.readFileSync("scoring.js", "utf8")));
});

// --- Known-weak: the CY-lite torus is inert ---------------------------------

test("the torus weight contributes nothing to any result", () => {
  // README lists the torus projection as scoring mechanism 6, but `ledger.query`
  // filters candidates to a single (domain, subject) pair and `theta` is a pure
  // function of exactly that pair — so every surviving candidate scores 1.0 and
  // the term cancels. Pinned so the claim in the docs stays falsifiable.
  //
  // This test failing is GOOD NEWS: it means the torus finally does something,
  // and the README's mechanism list can stop overstating the design. Delete it
  // together with that claim.
  const on = runAllCores({ ...cfg, cyEnabled: true });
  const off = runAllCores({ ...cfg, cyEnabled: false });
  assert.deepEqual(on, off, "cyEnabled changed a result — the torus is live");
});

test("the torus stays inert even at extreme cy parameters", () => {
  // Stronger form: it is not merely that the default sigma is too flat to
  // matter. No setting of the knobs can matter while candidates are pre-filtered
  // to one (domain, subject).
  const base = runAllCores({ ...cfg, cyEnabled: true });
  const sharp = runAllCores({ ...cfg, cyEnabled: true, cySigma: 0.05, cyBeta: 8 });
  assert.deepEqual(base, sharp, "cySigma/cyBeta changed a result");
});

// --- Determinism: the corpus is fixed by its seed ---------------------------

// The behavioural suite asserts the corpus's shape (168 docs, 48/192/24
// queries). Shape survives a changed seed, a reordered generator or an edited
// document body — any of which moves every published number while the counts
// still match. Hash the content instead.
const digest = f =>
  crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const corpusHashes = () => ({
  corpus: digest("./results/corpus/corpus.json"),
  queries: digest("./results/corpus/queries.json")
});

// Content of the seed-42 corpus every published number in the README was
// measured against. Node 22. Changed once since: claims now carry provenance
// tags (`sig`), which altered the corpus bytes without altering any result.
const PINNED = {
  corpus: "cdb320438db32f2151a93d3ab0d4f85cd9b0dd3cb94da0c6c5fe65a6405abbfd",
  queries: "11429ccba5ab8135f2477f9c1645b47c167a930f291f662b7dcb2be2b30b4483"
};

test("corpus generation is reproducible across runs", async () => {
  // Generate twice and compare the two fresh outputs, rather than comparing
  // against whatever happens to be on disk — otherwise a corpus left behind by
  // an unrelated run fails this test for the wrong reason.
  await generateCorpus();
  const first = corpusHashes();
  await generateCorpus();
  assert.deepEqual(corpusHashes(), first);
});

test("the corpus still matches the one the README was measured against", async () => {
  // Reproducibility alone would happily pin a *different* corpus: change the
  // seed and the generator is still perfectly deterministic. This is the guard
  // that catches the published results silently going stale.
  //
  // If you changed the corpus on purpose, re-run `npm run bench`, update the
  // README tables, and update these hashes in the same commit.
  await generateCorpus();
  assert.deepEqual(corpusHashes(), PINNED);
});

// --- The attack generator's contract ----------------------------------------

// Every swarm finding rests on how makeSwarmDocs dates and labels the clones.
// If a spoof mode quietly stopped forging the source, PAL would look robust for
// the wrong reason. The behavioural tests would eventually catch that, but only
// as a confusing accuracy shift several layers away from the cause.

const baseFalseDoc = {
  id: "HR_refund_window_FALSE",
  domain: "HR",
  subject: "refund_window",
  source: "Wiki",
  reliability: 0.65,
  timestamp: 18,
  text: "refund window is 90 days",
  claims: [{ subject: "refund_window", value: "V_FALSE", source: "Wiki", reliability: 0.65, timestamp: 18 }]
};

test("plain swarm clones keep the attacker's own low-reliability source", () => {
  const docs = makeSwarmDocs(baseFalseDoc, 3, "plain", 35, null, 2);
  assert.equal(docs.length, 3);
  for (const d of docs) {
    assert.equal(d.source, "Wiki");
    assert.equal(d.timestamp, 18, "plain mode must not re-date the clones");
    assert.ok(d.reliability <= 0.7, "plain clones must stay low-reliability");
    assert.equal(d.claims[0].source, "Wiki");
  }
});

test("spoof modes forge a high-reliability source on the doc and its claims", () => {
  for (const mode of ["spoof_future", "spoof_now", "spoof_past"]) {
    const docs = makeSwarmDocs(baseFalseDoc, 2, mode, 35, null, 2);
    for (const d of docs) {
      assert.equal(d.source, "PolicyPortal", `${mode} must forge the source`);
      assert.ok(d.reliability >= 0.92, `${mode} must forge high reliability`);
      assert.equal(d.claims[0].source, "PolicyPortal");
      assert.equal(d.claims[0].reliability, 0.95);
    }
  }
});

test("spoof timestamp offsets are exactly what the swarm findings assume", () => {
  // These three offsets are the whole reason spoof_future is survivable and
  // spoof_now / spoof_past are not: only spoof_future trips
  // futureTimestampPenalty. Changing an offset changes which cells are red.
  const nowTs = 35;
  const at = mode => makeSwarmDocs(baseFalseDoc, 1, mode, nowTs, null, 2)[0].timestamp;

  assert.equal(at("spoof_future"), nowTs + 5, "post-dated: trips the future penalty");
  assert.equal(at("spoof_now"), nowTs, "same tick: no future penalty");
  assert.equal(at("spoof_past"), nowTs - 1, "back-dated: no future penalty");
  assert.equal(at("spoof"), nowTs + 5, "legacy alias must track spoof_future");
});

test("only spoof modes are treated as spoofing", () => {
  assert.equal(isSpoofMode("plain"), false);
  assert.equal(isSpoofMode("nonsense"), false);
  for (const mode of ["spoof", "spoof_future", "spoof_now", "spoof_past"]) {
    assert.equal(isSpoofMode(mode), true, `${mode} must count as a spoof`);
  }
});

test("all spoofed clones of one flood share a signature", () => {
  // swarmSignaturePenalty keys on (source, timestamp, value). It is the only
  // defence left once the clones are dated at or before nowTs, so the clones
  // must actually collide on that key for it to have anything to bite on.
  const docs = makeSwarmDocs(baseFalseDoc, 5, "spoof_now", 35, null, 2);
  const sigs = new Set(
    docs.map(d => `${d.claims[0].source}|${d.claims[0].timestamp}|${d.claims[0].value}`)
  );
  assert.equal(sigs.size, 1, "clones must collide on the signature key");

  // ...while remaining distinct documents, so retrieval sees a flood rather
  // than one repeated id.
  assert.equal(new Set(docs.map(d => d.id)).size, 5);
});
