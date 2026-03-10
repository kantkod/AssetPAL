import { readJson } from "./io.js";
import { retrieveTopK } from "./retrieval.js";
import { BASELINES, answerWithBaseline } from "./baselines.js";
import { initSummary, scoreResult, finalize } from "./metrics.js";
import { makeRunDir, writeSummary } from "./run_utils.js";

function filterDocsByTime(docs, nowTs) {
  return docs.filter(d => d.timestamp <= nowTs);
}

export async function runUpdate() {
  const cfg = readJson("./default.json");
  const corpus = readJson("./results/corpus/corpus.json");
  const queries = readJson("./results/corpus/queries.json").update;

  const baselines = [
    BASELINES.VANILLA_RAG,
    BASELINES.MAJORITY_VOTE,
    BASELINES.RERANK_REL_TIME,
    BASELINES.PAL_LEDGER
  ];

  const runDir = makeRunDir("update");

  const results = {};
  for (const b of baselines) {
    const sum = initSummary();
    let adoptedNew = 0, newTotal = 0;
    let regressed = 0;

    for (const q of queries) {
      const visibleDocs = filterDocsByTime(corpus.docs, q.nowTs);
      const top = retrieveTopK(visibleDocs, q, cfg.topK, cfg.seed + q.nowTs + 77);
      const r = answerWithBaseline(b, cfg, top, q);

      // adoption/regression measured on t1 only
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

  const out = { experiment: "update", results };
  writeSummary(runDir, "summary.json", out);
  return out;
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g,"/") || "")) {
  runUpdate().then(o => console.log(JSON.stringify(o, null, 2)));
}
