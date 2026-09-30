import fs from 'node:fs';
import { runConflictCore, runUpdateCore, runSwarmCore } from '../../experiment_core.js';
import { overallScore } from '../../scoring.js';
import { generateCorpus } from '../../generate_corpus.js';

// Run from the repository root. All scoring goes through scoring.js.
if (!fs.existsSync('results/corpus/corpus.json')) await generateCorpus();
const cfg = JSON.parse(fs.readFileSync('default.json'));
const corpus = JSON.parse(fs.readFileSync('results/corpus/corpus.json'));
const queries = JSON.parse(fs.readFileSync('results/corpus/queries.json'));
const methods = {
  legacy: {},
  legacy_verified: { verifyProvenance: true },
  value_max_unsigned: { confidenceModel: 'value_max' },
  strict_dominance: { verifyProvenance: true, provenancePolicy: 'require_verified' },
  strict_value_max: { verifyProvenance: true, provenancePolicy: 'require_verified', confidenceModel: 'value_max' },
  strict_independence: { verifyProvenance: true, provenancePolicy: 'require_verified', confidenceModel: 'independence' }
};
const out = {};
for (const [method, overrides] of Object.entries(methods)) {
  const c = { ...cfg, ...overrides };
  const results = {
    conflict: runConflictCore(c, corpus, queries.conflict).results,
    update: runUpdateCore(c, corpus, queries.update).results,
    swarm: runSwarmCore(c, corpus, queries.swarm).results
  };
  out[method] = { score: overallScore(results), results };
  console.log(method, out[method].score);
}
fs.mkdirSync('results/repair', { recursive: true });
fs.writeFileSync('results/repair/original.json', JSON.stringify(out, null, 2));
