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

// Spoofed-source swarm variants, by how the attacker dates the forged clones
// relative to the query's "now". The offset matters enormously: a clone dated
// in the future trips futureTimestampPenalty, while one dated at or before now
// does not, and must be caught by the flood's shape instead.
const SPOOF_TIME_OFFSETS = {
  spoof_future: +5, // post-dated — an unforced error by the attacker
  spoof_now: 0,     // same tick as the query
  spoof_past: -1,   // back-dated by one tick, still newer than the real update
  spoof: +5         // legacy alias for spoof_future
};

export function isSpoofMode(mode) {
  return Object.prototype.hasOwnProperty.call(SPOOF_TIME_OFFSETS, mode);
}

export function makeSwarmDocs(baseFalseDoc, swarmSize, mode = "plain", nowTs = null, query = null, baitStrength = 2) {
  const out = [];
  const bait = query
    ? (` ${query.question || ""} ${query.domain || ""} ${query.subject || ""} ${query.scope?.region || ""} ${query.scope?.tier || ""} ${query.scope?.product || ""} `).repeat(baitStrength)
    : "";

  for (let i = 0; i < swarmSize; i++) {
    const spoof = isSpoofMode(mode);
    const spoofTs = (nowTs ?? baseFalseDoc.timestamp) + (SPOOF_TIME_OFFSETS[mode] ?? 0);
    out.push({
      ...baseFalseDoc,
      id: `${baseFalseDoc.id}_${mode.toUpperCase()}_SWARM_${i}`,
      text: `${baseFalseDoc.text}${bait} (${mode} duplicate ${i})`,
      source: spoof ? "PolicyPortal" : baseFalseDoc.source,
      reliability: spoof ? 0.92 + (i % 3) * 0.02 : Math.max(0.4, Math.min(0.7, (baseFalseDoc.reliability ?? 0.6) + ((i % 5) - 2) * 0.01)),
      timestamp: spoof ? spoofTs : baseFalseDoc.timestamp,
      claims: (baseFalseDoc.claims || []).map(c => ({
        ...c,
        source: spoof ? "PolicyPortal" : c.source,
        reliability: spoof ? 0.95 : c.reliability,
        timestamp: spoof ? spoofTs : c.timestamp
      }))
    });
  }
  return out;
}
