// Development comparison on the exposed 2026-09-30 corpus, not fresh validation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { generateCases } from './generate.mjs';
import { retrieveTopK } from '../../retrieval.js';
import { answerWithBaseline } from '../../baselines.js';
import { verifyClaim } from '../../provenance.js';

const cfg = JSON.parse(fs.readFileSync(new URL('../../default.json', import.meta.url)));
const output = new URL('../../results/repair/', import.meta.url);
fs.mkdirSync(output, { recursive: true });
const methods = [
  { id: 'PAL_legacy', overrides: {} },
  { id: 'PAL_legacy_verified', overrides: { verifyProvenance: true } },
  { id: 'PAL_value_max_unsigned', overrides: { confidenceModel: 'value_max' } },
  { id: 'PAL_value_max_penalized', overrides: { confidenceModel: 'value_max', verifyProvenance: true } },
  { id: 'PAL_strict_dominance', overrides: { verifyProvenance: true, provenancePolicy: 'require_verified' } },
  { id: 'PAL_strict_value_max', overrides: { confidenceModel: 'value_max', verifyProvenance: true, provenancePolicy: 'require_verified' } },
  { id: 'PAL_strict_independence', overrides: { confidenceModel: 'independence', verifyProvenance: true, provenancePolicy: 'require_verified' } },
  { id: 'SCOPED_RERANK', base: 'SCOPED_RERANK', overrides: {} },
  { id: 'SCOPED_RERANK_strict', base: 'SCOPED_RERANK', overrides: {}, strictRerank: true }
];

const cases = generateCases();
const bytes = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
const corpusHash = crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(corpusHash, '4d063e5d7faa2ce8a73d983a09719bd4fc081fe27ed2027168622839d781aa9d');
fs.writeFileSync(new URL('cases.jsonl', output), bytes);
const fd = fs.openSync(new URL('traces.jsonl', output), 'w');
const rows = [];
for (const c of cases) {
  // The gate is downstream of shared retrieval; no refill or privileged slots.
  const retrieved = retrieveTopK(c.docs, c.q, 6, 20260930 + c.world * 8191 + c.size);
  assert.equal(retrieved.length, 6);
  const ids = new Set(retrieved.map(d => d.id));
  const supportRetained = c.q.expected === 'CONFLICT' ? c.support.every(id => ids.has(id)) : c.support.some(id => ids.has(id));
  for (const m of methods) {
    const docs = m.strictRerank ? retrieved.filter(d => d.claims.some(claim => verifyClaim({ ...claim, timestamp: d.timestamp, source: d.source }, cfg.seed))) : retrieved;
    const result = answerWithBaseline(m.base ?? 'PAL_LEDGER', { ...cfg, ...m.overrides }, docs, c.q);
    const ordinary = c.q.expected !== 'CONFLICT';
    const answered = ordinary && result.status === 'ANSWER';
    const correct = ordinary ? answered && result.value === c.q.expected : result.status === 'CONFLICT';
    const r = { world: c.world, query: c.q.id, family: c.family, size: c.size, method: m.id, ordinary, answered, correct, wrongAssertion: result.status === 'ANSWER' && !correct, confidence: result.confidence, supportRetained, status: result.status };
    rows.push(r);
    fs.writeSync(fd, JSON.stringify({ ...r, retrieved: [...ids], decision: result }) + '\n');
  }
}
fs.closeSync(fd);

function summarize(rs) {
  const ordinary = rs.filter(r => r.ordinary), answers = ordinary.filter(r => r.answered);
  const wrong = answers.filter(r => r.wrongAssertion).length;
  return { n: rs.length, correct: rs.filter(r => r.correct).length, accuracy: rs.filter(r => r.correct).length / rs.length,
    ordinary: ordinary.length, valueAnswers: answers.length, coverage: ordinary.length ? answers.length / ordinary.length : null,
    wrongAssertions: wrong, risk: answers.length ? wrong / answers.length : null,
    conflictCorrect: rs.filter(r => !r.ordinary && r.correct).length,
    noAnswer: rs.filter(r => r.status === 'NO_ANSWER').length };
}
function selectiveRisk(rs, coverage) {
  const n = rs.filter(r => r.ordinary).length, target = n * coverage;
  const answers = rs.filter(r => r.answered).sort((a,b) => b.confidence - a.confidence);
  if (answers.length < target) return null;
  let selected = 0, errors = 0;
  for (let i = 0; i < answers.length && selected < target;) {
    let j = i + 1;
    while (j < answers.length && answers[j].confidence === answers[i].confidence) j++;
    const take = Math.min(j-i, target-selected);
    errors += take / (j-i) * answers.slice(i,j).filter(r => r.wrongAssertion).length;
    selected += take; i = j;
  }
  return errors / target;
}
const summary = {};
for (const m of methods) {
  const rs = rows.filter(r => r.method === m.id);
  summary[m.id] = { ...summarize(rs), riskAt25: selectiveRisk(rs, .25),
    byFamily: Object.fromEntries([...new Set(rs.map(r=>r.family))].map(f => [f, summarize(rs.filter(r=>r.family===f))])) };
}
// Baseline parity protects against accidentally changing the corpus or scoring.
assert.equal(summary.PAL_legacy.correct, 879);
assert.equal(summary.PAL_legacy.wrongAssertions, 1861);
assert.equal(summary.PAL_legacy_verified.wrongAssertions, 1609);
assert.equal(summary.SCOPED_RERANK.correct, 1186);
const metadata = { executedAt: new Date().toISOString(), node: process.version, corpusHash,
  protocolHash: crypto.createHash('sha256').update(fs.readFileSync(new URL('../../REPAIR_PROTOCOL.md', import.meta.url))).digest('hex'),
  methods, cases: cases.length, worlds: 240, traces: rows.length,
  developmentOnly: true, originalEvaluationRevision: 'f10f9186fc695477644406c357fb9468d9ae0881' };
metadata.implementationHashes = Object.fromEntries(['ledger.js', 'provenance.js', 'baselines.js'].map(path =>
  [path, crypto.createHash('sha256').update(fs.readFileSync(new URL('../../' + path, import.meta.url))).digest('hex')]
));
fs.writeFileSync(new URL('summary.json', output), JSON.stringify({ metadata, summary }, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k,{byFamily,...v}]) => [k,v])), null, 2));
