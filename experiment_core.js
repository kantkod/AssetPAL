import { retrieveTopK, makeSwarmDocs } from "./retrieval.js";
import { BASELINES, answerWithBaseline } from "./baselines.js";
import { initSummary, scoreResult, finalize } from "./metrics.js";

const BASELINE_LIST = [
  BASELINES.VANILLA_RAG,
  BASELINES.MAJORITY_VOTE,
  BASELINES.RERANK_REL_TIME,
  BASELINES.PAL_LEDGER
];

function debugEnabledFor(cfg, experimentName, q) {
  return cfg?.debugQueryId && cfg.debugExperiment === experimentName && cfg.debugQueryId === q.id;
}

function claimValueForDoc(doc, q) {
  const claim = (doc.claims || []).find(c => c.domain === q.domain && c.subject === q.subject);
  return claim?.value;
}

function printDebugTrace({ cfg, experimentName, q, top, baseline, result, swarmMode, swarmSize }) {
  const shouldDebug = debugEnabledFor(cfg, experimentName, q);
  if (!shouldDebug) return;

  if (experimentName === "swarm") {
    if (swarmMode !== cfg.debugSwarmMode || swarmSize !== cfg.debugSwarmSize) return;
  }

  const docs = top.map(d => ({
    id: d.id,
    source: d.source,
    timestamp: d.timestamp,
    reliability: d.reliability,
    claimValue: claimValueForDoc(d, q)
  }));

  console.log("[DEBUG QUERY]", {
    experiment: experimentName,
    baseline,
    swarmMode,
    swarmSize,
    id: q.id,
    question: q.question,
    expected: q.expected,
    domain: q.domain,
    subject: q.subject,
    nowTs: q.nowTs,
    scope: q.scope
  });

  if (cfg.debugPrintDocs) {
    console.log("[DEBUG TOPK]", JSON.stringify(docs, null, 2));
  }

  console.log("[DEBUG BASELINE RESULT]", {
    baseline,
    status: result.status,
    value: result.value,
    confidence: result.confidence,
    evidence: result.evidence
  });
}

export function runConflictCore(cfg, corpus, queries) {
  const results = {};
  for (const b of BASELINE_LIST) {
    const sum = initSummary();
    let conflictGood = 0;
    let conflictTotal = 0;

    for (const q of queries) {
      const top = retrieveTopK(corpus.docs, q, cfg.topK, cfg.seed + q.nowTs);
      const r = answerWithBaseline(b, cfg, top, q);

      printDebugTrace({ cfg, experimentName: "conflict", q, top, baseline: b, result: r });

      const hasTrue = top.some(d => (d.claims || []).some(c => c.subject === q.subject && c.value === q.expected));
      const hasFalse = top.some(d => (d.claims || []).some(c => c.subject === q.subject && c.value?.startsWith("FALSE_")));
      const isConflict = q.hardConflict || (hasTrue && hasFalse);

      if (isConflict) {
        conflictTotal++;
        if (q.hardConflict) {
          if (r.status === "CONFLICT") conflictGood++;
        } else if (r.status === "CONFLICT" || r.value === q.expected) {
          conflictGood++;
        }
      }

      if (q.hardConflict) {
        const scored = {
          ...r,
          value: r.status === "CONFLICT" ? "CONFLICT" : r.value
        };
        scoreResult(sum, q, scored);
      } else {
        scoreResult(sum, q, r);
      }
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
    let adoptedNew = 0;
    let newTotal = 0;
    let regressed = 0;
    let overUpdate = 0;
    let underUpdate = 0;

    for (const q of queries) {
      const visibleDocs = filterDocsByTime(corpus.docs, q.nowTs);
      const top = retrieveTopK(visibleDocs, q, cfg.topK, cfg.seed + q.nowTs + 77);
      const r = answerWithBaseline(b, cfg, top, q);

      printDebugTrace({ cfg, experimentName: "update", q, top, baseline: b, result: r });

      if (q.phase === "t1") {
        newTotal++;
        if (r.value === q.expected) adoptedNew++;
        if (r.value && r.value.startsWith("v0_") && String(q.expected).startsWith("v1_")) regressed++;

        const expectedIsV1 = String(q.expected).startsWith("v1_");
        const gotV1 = String(r.value || "").startsWith("v1_");
        const gotV0 = String(r.value || "").startsWith("v0_");

        if (!expectedIsV1 && gotV1) overUpdate++;
        if (expectedIsV1 && gotV0) underUpdate++;
      }

      scoreResult(sum, q, r);
    }

    results[b] = {
      ...finalize(sum),
      adopted_new: adoptedNew,
      t1_total: newTotal,
      adopted_new_rate: newTotal ? adoptedNew / newTotal : 0,
      regression_rate: newTotal ? regressed / newTotal : 0,
      over_update: overUpdate,
      under_update: underUpdate,
      over_update_rate: newTotal ? overUpdate / newTotal : 0,
      under_update_rate: newTotal ? underUpdate / newTotal : 0
    };
  }

  return { experiment: "update", results };
}

function getSwarmModes(cfg) {
  if (Array.isArray(cfg.swarmModes) && cfg.swarmModes.length) return cfg.swarmModes;
  if (cfg.swarmMode) return [cfg.swarmMode];
  return ["plain"];
}

export function runSwarmCore(cfg, corpus, queries) {
  function findFalseDoc(docs, domain, subject) {
    return docs.find(
      d => d.domain === domain && (d.claims || []).some(c => c.subject === subject && String(c.value).startsWith("FALSE_"))
    );
  }

  const swarmModes = getSwarmModes(cfg);
  const results = {};
  for (const b of BASELINE_LIST) {
    results[b] = {};
    for (const swarmMode of swarmModes) {
      for (const swarmSize of cfg.swarmSizes) {
        const sum = initSummary();

        for (const q of queries) {
          const visibleDocs = filterDocsByTime(corpus.docs, q.nowTs);
          const falseDoc = findFalseDoc(visibleDocs, q.domain, q.subject);
          const swarm = falseDoc
            ? makeSwarmDocs(falseDoc, swarmSize, swarmMode, q.nowTs, q, cfg.baitStrength)
            : [];
          const docsWithSwarm = visibleDocs.concat(swarm);

          const top = retrieveTopK(docsWithSwarm, q, cfg.topK, cfg.seed + swarmSize + q.nowTs);
          const r = answerWithBaseline(b, cfg, top, q);

          printDebugTrace({
            cfg,
            experimentName: "swarm",
            q,
            top,
            baseline: b,
            result: r,
            swarmMode,
            swarmSize
          });

          scoreResult(sum, q, r);
        }

        results[b][`${swarmMode}_swarm_${swarmSize}`] = finalize(sum);
      }
    }
  }

  return { experiment: "swarm", swarmSizes: cfg.swarmSizes, swarmModes, results };
}
