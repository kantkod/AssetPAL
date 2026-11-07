// Exclusion confidence (the fermion idea). Pre-registered 7 Nov 2026 in the
// project doc ASSETPAL-EXCLUSION-PREREG.md, copied here as PREREG.md.
// Development result on the exposed 2026-09-30 stress corpus, not validation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { generateCases } from '../fixed-budget/generate.mjs';
import { retrieveTopK } from '../../retrieval.js';
import { answerWithBaseline } from '../../baselines.js';
import { verifyClaim } from '../../provenance.js';
import { TruthLedger } from '../../ledger.js';
import { runConflictCore, runUpdateCore, runSwarmCore } from '../../experiment_core.js';
import { overallScore } from '../../scoring.js';
import { generateCorpus } from '../../generate_corpus.js';

const cfg = JSON.parse(fs.readFileSync(new URL('../../default.json', import.meta.url)));
const output = new URL('../../results/exclusion/', import.meta.url);
fs.mkdirSync(output, { recursive: true });

const unsigned = {}, penalized = { verifyProvenance: true }, strict = { verifyProvenance: true, provenancePolicy: 'require_verified' };
const reference = [
  { id: 'PAL_legacy', overrides: {} },
  { id: 'PAL_legacy_verified', overrides: penalized },
  { id: 'PAL_value_max_unsigned', overrides: { confidenceModel: 'value_max' } },
  { id: 'PAL_value_max_penalized', overrides: { confidenceModel: 'value_max', ...penalized } },
  { id: 'PAL_strict_dominance', overrides: strict },
  { id: 'PAL_strict_value_max', overrides: { confidenceModel: 'value_max', ...strict } },
  { id: 'PAL_strict_independence', overrides: { confidenceModel: 'independence', ...strict } },
  { id: 'SCOPED_RERANK', base: 'SCOPED_RERANK', overrides: {} },
  { id: 'SCOPED_RERANK_strict', base: 'SCOPED_RERANK', overrides: {}, strictRerank: true }
];
const exclusionArms = [];
for (const [dname, dir] of [['id', 'identity'], ['text', 'text'], ['idtext', 'identity_text']]) {
  for (const [cname, c] of [['unsigned', unsigned], ['penalized', penalized], ['strict', strict]]) {
    exclusionArms.push({ id: `E_${dname}_${cname}`, overrides: { confidenceModel: 'exclusion', exclusionDirections: dir, ...c }, exclusion: true });
  }
}
const methods = [...reference, ...exclusionArms];

const cases = generateCases();
const bytes = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
const corpusHash = crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(corpusHash, '4d063e5d7faa2ce8a73d983a09719bd4fc081fe27ed2027168622839d781aa9d');

const ATTACK = new Set(['plain', 'spoof_clones', 'spoof_varied', 'spoof_multi', 'signed_compromised']);
function falseValueOf(c) {
  // Attack documents carry a value no base document has (generate.mjs).
  for (const d of c.docs) for (const cl of d.claims) {
    if (cl.subject === c.q.subject && cl.value !== c.q.expected && !d.source.startsWith('Handbook_') && !d.source.startsWith('Branch_')) return cl.value;
  }
  return null;
}
function ledgerGroups(m, docs, q) {
  // Mirrors the PAL_LEDGER baseline's ingestion, to read the per-value residuals.
  const ledger = new TruthLedger({ ...cfg, ...m.overrides });
  for (const d of docs) for (const c of d.claims || []) {
    if (c.domain === q.domain && c.subject === q.subject) {
      ledger.upsertClaim({ ...c, reliability: d.reliability ?? c.reliability ?? 0.5, timestamp: d.timestamp, source: d.source, text: d.text });
    }
  }
  return ledger.decide(q.domain, q.subject, q.nowTs, q.scope).groups ?? [];
}

const rows = [], price = {};
for (const c of cases) {
  const retrieved = retrieveTopK(c.docs, c.q, 6, 20260930 + c.world * 8191 + c.size);
  assert.equal(retrieved.length, 6);
  const fv = ATTACK.has(c.family) ? falseValueOf(c) : null;
  for (const m of methods) {
    const docs = m.strictRerank ? retrieved.filter(d => d.claims.some(claim => verifyClaim({ ...claim, timestamp: d.timestamp, source: d.source }, cfg.seed))) : retrieved;
    const result = answerWithBaseline(m.base ?? 'PAL_LEDGER', { ...cfg, ...m.overrides }, docs, c.q);
    const ordinary = c.q.expected !== 'CONFLICT';
    const answered = ordinary && result.status === 'ANSWER';
    const correct = ordinary ? answered && result.value === c.q.expected : result.status === 'CONFLICT';
    rows.push({ world: c.world, family: c.family, size: c.size, method: m.id, ordinary, answered, correct, wrongAssertion: result.status === 'ANSWER' && !correct, status: result.status });
    if (m.exclusion && fv !== null) {
      const g = ledgerGroups(m, docs, c.q).find(x => x.value === String(fv));
      if (g && g.residuals.length > 1) {
        const key = `${m.id}|${c.family}`;
        price[key] ??= { extra: [], first: 0 };
        price[key].first += 1;
        for (const r of g.residuals.slice(1)) price[key].extra.push(r);
      }
    }
  }
}

function summarize(rs) {
  const ordinary = rs.filter(r => r.ordinary), answers = ordinary.filter(r => r.answered);
  const wrong = answers.filter(r => r.wrongAssertion).length;
  return { n: rs.length, correct: rs.filter(r => r.correct).length, accuracy: rs.filter(r => r.correct).length / rs.length,
    valueAnswers: answers.length, coverage: ordinary.length ? answers.length / ordinary.length : null,
    wrongAssertions: wrong, risk: answers.length ? wrong / answers.length : null,
    noAnswer: rs.filter(r => r.status === 'NO_ANSWER').length };
}
const summary = {};
for (const m of methods) {
  const rs = rows.filter(r => r.method === m.id);
  summary[m.id] = { ...summarize(rs), byFamily: Object.fromEntries([...new Set(rs.map(r => r.family))].map(f => [f, summarize(rs.filter(r => r.family === f))])) };
}
// Baseline parity: the same numbers the repair run asserts.
assert.equal(summary.PAL_legacy.correct, 879);
assert.equal(summary.PAL_legacy.wrongAssertions, 1861);
assert.equal(summary.PAL_legacy_verified.wrongAssertions, 1609);
assert.equal(summary.SCOPED_RERANK.correct, 1186);

// Pre-registered gates.
const S = summary, sv = S.PAL_strict_value_max, sr = S.SCOPED_RERANK_strict;
const gates = {
  H1: { E_id_strict_accuracy: S.E_id_strict.accuracy, value_max_accuracy: sv.accuracy, E_id_strict_wrong: S.E_id_strict.wrongAssertions, value_max_wrong: sv.wrongAssertions,
        holds: Math.abs(S.E_id_strict.accuracy - sv.accuracy) <= 0.01 && Math.abs(S.E_id_strict.wrongAssertions - sv.wrongAssertions) <= 0.05 * sv.wrongAssertions },
  H2: { unsigned: { E_text: S.E_text_unsigned.wrongAssertions, value_max: S.PAL_value_max_unsigned.wrongAssertions },
        strict: { E_text: S.E_text_strict.wrongAssertions, value_max: sv.wrongAssertions },
        holds: S.E_text_unsigned.wrongAssertions > S.PAL_value_max_unsigned.wrongAssertions && S.E_text_strict.wrongAssertions > sv.wrongAssertions },
  H3: { corroborated: Object.fromEntries(exclusionArms.map(m => [m.id, S[m.id].byFamily.corroborated.correct])),
        holds: exclusionArms.every(m => S[m.id].byFamily.corroborated.correct >= 239) },
  H4: { winners: exclusionArms.filter(m => S[m.id].accuracy > sr.accuracy && S[m.id].wrongAssertions < sr.wrongAssertions).map(m => m.id),
        rerank_accuracy: sr.accuracy, rerank_wrong: sr.wrongAssertions }
};
gates.H4.holds = gates.H4.winners.length > 0;
const witnessPrice = Object.fromEntries(Object.entries(price).map(([k, v]) => [k, { cases: v.first, extraClaims: v.extra.length,
  meanResidual: v.extra.length ? v.extra.reduce((a, b) => a + b, 0) / v.extra.length : null }]));

// Reported: the original benchmark's overall score, through the shared scoring rule.
await generateCorpus();
const corpus = JSON.parse(fs.readFileSync(new URL('../../results/corpus/corpus.json', import.meta.url)));
const queries = JSON.parse(fs.readFileSync(new URL('../../results/corpus/queries.json', import.meta.url)));
const original = {};
for (const m of [reference[0], reference[2], reference[5], ...exclusionArms]) {
  const c2 = { ...cfg, ...m.overrides };
  const results = { conflict: runConflictCore(c2, corpus, queries.conflict).results, update: runUpdateCore(c2, corpus, queries.update).results, swarm: runSwarmCore(c2, corpus, queries.swarm).results };
  original[m.id] = overallScore(results);
}

const metadata = { executedAt: new Date().toISOString(), node: process.version, corpusHash, cases: cases.length, developmentOnly: true,
  prereg: crypto.createHash('sha256').update(fs.readFileSync(new URL('PREREG.md', import.meta.url))).digest('hex'),
  implementationHashes: Object.fromEntries(['ledger.js', 'baselines.js', 'retrieval.js'].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(new URL('../../' + p, import.meta.url))).digest('hex')])) };
fs.writeFileSync(new URL('summary.json', output), JSON.stringify({ metadata, gates, witnessPrice, original, summary }, null, 2));
const brief = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { accuracy: +v.accuracy.toFixed(4), correct: v.correct, wrong: v.wrongAssertions, coverage: +(v.coverage ?? 0).toFixed(3), noAnswer: v.noAnswer }]));
console.log(JSON.stringify({ gates, brief, witnessPrice, original }, null, 1));
