import { readJson } from "./io.js";
import { retrieveTopK, makeSwarmDocs } from "./retrieval.js";
import { BASELINES, answerWithBaseline } from "./baselines.js";
import { initSummary, scoreResult, finalize } from "./metrics.js";
import { makeRunDir, writeSummary } from "./run_utils.js";

export async function runSwarm() {
  const cfg = readJson("./configs/default.json");
  const corpus = readJson("./results/corpus/corpus.json");
  const queries = readJson("./results/corpus/queries.json").swarm;

  const baselines = [
    BASELINES.VANILLA_RAG,
    BASELINES.MAJORITY_VOTE,
    BASELINES.RERANK_REL_TIME,
    BASELINES.PAL_LEDGER
  ];

  const runDir = makeRunDir("swarm");

  // pick template false docs for each query
  function findFalseDoc(domain, subject) {
    return corpus.docs.find(d => d.domain===domain && (d.claims||[]).some(c => c.subject===subject && String(c.value).startsWith("FALSE_")));
  }

  const results = {};
  for (const b of baselines) {
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

  const out = { experiment: "swarm", swarmSizes: cfg.swarmSizes, results };
  writeSummary(runDir, "summary.json", out);
  return out;
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g,"/") || "")) {
  runSwarm().then(o => console.log(JSON.stringify(o, null, 2)));
}
