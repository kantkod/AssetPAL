import { makeRng } from "./rng.js";

function tokenize(s){
  return (s||"").toLowerCase().replace(/[^a-z0-9_\s]/g," ").split(/\s+/).filter(Boolean);
}
function overlapScore(qTokens, dTokens){
  const set = new Set(dTokens);
  let hit=0;
  for (const t of qTokens) if (set.has(t)) hit++;
  return hit / Math.max(1, qTokens.length);
}

export function retrieveTopK(docs, query, topK=6, seed=1){
  const rand = makeRng(seed);
  const qTokens = tokenize(query.question + " " + query.domain + " " + query.subject);

  const scored = docs
    .filter(d => d.domain === query.domain) // strong domain constraint (like metadata filter)
    .map(d => {
      const dTokens = tokenize(d.text);
      const o = overlapScore(qTokens, dTokens);
      // small stochasticity to mimic ANN retrieval noise
      const noise = (rand() - 0.5) * 0.02;
      const score = o + noise;
      return { doc: d, score };
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0, topK);

  return scored.map(s => s.doc);
}

export function makeSwarmDocs(baseFalseDoc, swarmSize){
  // Create near-duplicate docs with same false claim and similar text.
  const out = [];
  for (let i=0;i<swarmSize;i++){
    out.push({
      ...baseFalseDoc,
      id: baseFalseDoc.id + `_SWARM_${i}`,
      text: baseFalseDoc.text + ` (duplicate ${i})`,
      // slightly vary reliability but keep mediocre
      reliability: Math.max(0.4, Math.min(0.7, (baseFalseDoc.reliability ?? 0.6) + ((i%5)-2)*0.01))
    });
  }
  return out;
}
