import { TruthLedger } from "./ledger.js";

export const BASELINES = {
  VANILLA_RAG: "VANILLA_RAG",
  MAJORITY_VOTE: "MAJORITY_VOTE",
  RERANK_REL_TIME: "RERANK_REL_TIME",
  PAL_LEDGER: "PAL_LEDGER"
};

function timeBoost(nowTs, docTs){
  const dt = nowTs - docTs;
  return 1/(1+Math.max(0, dt));
}

export function answerWithBaseline(name, cfg, retrievedDocs, query){
  if (name === BASELINES.VANILLA_RAG) {
    // Pick first claim we see in top-k (common naive pattern)
    for (const d of retrievedDocs) {
      const c = (d.claims||[]).find(x => x.domain===query.domain && x.subject===query.subject);
      if (c) return { status:"ANSWER", value:c.value, confidence:0.85, evidence:[d.id] };
    }
    return { status:"NO_ANSWER", value:null, confidence:0.0, evidence:[] };
  }

  if (name === BASELINES.MAJORITY_VOTE) {
    const vals = [];
    const evidence = [];
    for (const d of retrievedDocs) {
      const c = (d.claims||[]).find(x => x.domain===query.domain && x.subject===query.subject);
      if (c){ vals.push(c.value); evidence.push(d.id); }
    }
    if (!vals.length) return { status:"NO_ANSWER", value:null, confidence:0.0, evidence:[] };
    const counts = new Map();
    for (const v of vals) counts.set(v, (counts.get(v)||0)+1);
    let bestV=null, bestC=-1;
    for (const [v,c] of counts) if (c>bestC){ bestC=c; bestV=v; }
    const conf = bestC / vals.length;
    return { status:"ANSWER", value:bestV, confidence:conf, evidence };
  }

  if (name === BASELINES.RERANK_REL_TIME) {
    // Choose claim maximizing reliability * recency
    let best=null;
    for (const d of retrievedDocs) {
      const c = (d.claims||[]).find(x => x.domain===query.domain && x.subject===query.subject);
      if (!c) continue;
      const score = (d.reliability ?? 0.5) * timeBoost(query.nowTs, d.timestamp);
      if (!best || score > best.score) best = { value:c.value, score, docId:d.id };
    }
    if (!best) return { status:"NO_ANSWER", value:null, confidence:0.0, evidence:[] };
    return { status:"ANSWER", value:best.value, confidence:Math.max(0.5, Math.min(0.95, best.score)), evidence:[best.docId] };
  }

  if (name === BASELINES.PAL_LEDGER) {
    // Ingest retrieved claims into ledger, keep contradictions, decide
    const ledger = new TruthLedger(cfg);
    for (const d of retrievedDocs) {
      for (const c of (d.claims||[])) {
        if (c.domain===query.domain && c.subject===query.subject) {
          ledger.upsertClaim({
            ...c,
            reliability: d.reliability ?? c.reliability ?? 0.5,
            timestamp: d.timestamp,
            source: d.source
          });
        }
      }
    }
    const dec = ledger.decide(query.domain, query.subject, query.nowTs, query.scope);
    if (dec.status === "NO_EVIDENCE") return { status:"NO_ANSWER", value:null, confidence:0.0, evidence:[] };

    if (dec.status === "CONFLICT") {
      // Return conflict explicitly
      return {
        status:"CONFLICT",
        value:null,
        confidence:dec.confidence,
        evidence: dec.picks.map(p=>p.docId),
        options: dec.picks.map(p=>({ value:p.value, docId:p.docId, score:p.score }))
      };
    }

    const pick = dec.picks[0];
    const conf = dec.confidence;
    // If confidence too low, refuse
    if (conf < cfg.confidenceThreshold) {
      return { status:"UNCERTAIN", value:null, confidence:conf, evidence:[pick.docId], options:[{value:pick.value, docId:pick.docId, score:pick.score}] };
    }
    return { status:"ANSWER", value:pick.value, confidence:conf, evidence:[pick.docId] };
  }

  throw new Error("Unknown baseline: " + name);
}
