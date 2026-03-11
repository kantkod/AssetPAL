import { makeRng } from "./rng.js";

function tokenize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/).filter(Boolean);
}
function overlapScore(qTokens, dTokens) {
  const set = new Set(dTokens);
  let hit = 0;
  for (const t of qTokens) if (set.has(t)) hit++;
  return hit / Math.max(1, qTokens.length);
}

export function retrieveTopK(docs, query, topK = 6, seed = 1) {
  const rand = makeRng(seed);
  const qTokens = tokenize(`${query.question} ${query.domain} ${query.subject}`);
  const subjectTokens = new Set(tokenize(query.subject));

  const scored = docs
    .filter(d => d.domain === query.domain)
    .map(d => {
      const dTokens = tokenize(d.text);
      const o = overlapScore(qTokens, dTokens);
      const subjectHit = dTokens.some(t => subjectTokens.has(t)) ? 0.3 : 0;
      const noise = (rand() - 0.5) * 0.02;
      const score = o + subjectHit + noise;
      return { doc: d, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(s => s.doc);
}

export function makeSwarmDocs(baseFalseDoc, swarmSize, mode = "plain", nowTs = null, query = null, baitStrength = 2) {
  const out = [];
  const bait = query
    ? (` ${query.question || ""} ${query.domain || ""} ${query.subject || ""} ${query.scope?.region || ""} ${query.scope?.tier || ""} ${query.scope?.product || ""} `).repeat(baitStrength)
    : "";

  for (let i = 0; i < swarmSize; i++) {
    const spoof = mode === "spoof";
    out.push({
      ...baseFalseDoc,
      id: `${baseFalseDoc.id}_${mode.toUpperCase()}_SWARM_${i}`,
      text: `${baseFalseDoc.text}${bait} (${mode} duplicate ${i})`,
      source: spoof ? "PolicyPortal" : baseFalseDoc.source,
      reliability: spoof ? 0.92 + (i % 3) * 0.02 : Math.max(0.4, Math.min(0.7, (baseFalseDoc.reliability ?? 0.6) + ((i % 5) - 2) * 0.01)),
      timestamp: spoof ? ((nowTs ?? baseFalseDoc.timestamp) + 5) : baseFalseDoc.timestamp,
      claims: (baseFalseDoc.claims || []).map(c => ({
        ...c,
        source: spoof ? "PolicyPortal" : c.source,
        reliability: spoof ? 0.95 : c.reliability,
        timestamp: spoof ? ((nowTs ?? c.timestamp) + 5) : c.timestamp
      }))
    });
  }
  return out;
}
