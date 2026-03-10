import { retrieveTopK, makeSwarmDocs } from "./retrieval.js";
import { BASELINES, answerWithBaseline } from "./baselines.js";
import { initSummary, scoreResult, finalize } from "./metrics.js";

const BASELINE_LIST = [
  BASELINES.VANILLA_RAG,
  BASELINES.MAJORITY_VOTE,
  BASELINES.RERANK_REL_TIME,
  BASELINES.PAL_LEDGER
];

export function runConflictCore(cfg, corpus, queries) {
  const results = {};
  for (const b of BASELINE_LIST) {
    const sum = initSummary();
    let conflictGood = 0;
    let conflictTotal = 0;

    for (const q of queries) {
      const top = retrieveTopK(corpus.docs, q, cfg.topK, cfg.seed + q.nowTs);
      const r = answerWithBaseline(b, cfg, top, q);

      const hasTrue = top.some(d => (d.claims||[]).some(c => c.subject===q.subject && c.value===q.expected));
      const hasFalse = top.some(d => (d.claims||[]).some(c => c.subject===q.subject && c.value?.startsWith("FALSE_")));
      const isConflict = hasTrue && hasFalse;

      if (isConflict) {
        conflictTotal++;
        if (r.status === "CONFLICT" || r.value === q.expected) conflictGood++;
      }

      scoreResult(sum, q, r);
    }

    results[b] = {
      ...finalize(sum),
      conflict_cases: conflictTotal,
      conflict_good: conflictGood,
      conflict_good_rate: conflictTotal ? conflictGood / conflictTotal : 0
    };
  }

  return { experiment: "conflict", results };
}

function filterDocsByTime(docs, nowTs) {
  return docs.filter(d => d.timestamp <= nowTs);
}

export function runUpdateCore(cfg, corpus, queries) {
  const results = {};
  for (const b of BASELINE_LIST) {
    const sum = initSummary();
    let adoptedNew = 0, newTotal = 0;
    let regressed = 0;

    for (const q of queries) {
      const visibleDocs = filterDocsByTime(corpus.docs, q.nowTs);
      const top = retrieveTopK(visibleDocs, q, cfg.topK, cfg.seed + q.nowTs + 77);
      const r = answerWithBaseline(b, cfg, top, q);

      if (q.phase === "t1") {
        newTotal++;
        if (r.value === q.expected) adoptedNew++;
        if (r.value && r.value.startsWith("v0_")) regressed++;
      }

      scoreResult(sum, q, r);
    }

    results[b] = {
      ...finalize(sum),
      adopted_new: adoptedNew,
      t1_total: newTotal,
      adopted_new_rate: newTotal ? adoptedNew/newTotal : 0,
      regression_rate: newTotal ? regressed/newTotal : 0
    };
  }

  return { experiment: "update", results };
}

export function runSwarmCore(cfg, corpus, queries) {
  function findFalseDoc(domain, subject) {
    return corpus.docs.find(d => d.domain===domain && (d.claims||[]).some(c => c.subject===subject && String(c.value).startsWith("FALSE_")));
  }

  const results = {};
  for (const b of BASELINE_LIST) {
    results[b] = {};
    for (const swarmSize of cfg.swarmSizes) {
      const sum = initSummary();

      for (const q of queries) {
        const falseDoc = findFalseDoc(q.domain, q.subject);
        const swarm = (falseDoc ? makeSwarmDocs(falseDoc, swarmSize) : []);
        const docsWithSwarm = corpus.docs.concat(swarm);

        const top = retrieveTopK(docsWithSwarm, q, cfg.topK, cfg.seed + swarmSize + q.nowTs);
        const r = answerWithBaseline(b, cfg, top, q);

        scoreResult(sum, q, r);
      }

      results[b][`swarm_${swarmSize}`] = finalize(sum);
    }
  }

  return { experiment: "swarm", swarmSizes: cfg.swarmSizes, results };
}
