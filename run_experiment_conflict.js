import { readJson } from "./io.js";
import { retrieveTopK } from "./retrieval.js";
import { BASELINES, answerWithBaseline } from "./baselines.js";
import { initSummary, scoreResult, finalize } from "./metrics.js";
import { makeRunDir, writeSummary } from "./run_utils.js";

export async function runConflict() {
  const cfg = readJson("./configs/default.json");
  const corpus = readJson("./results/corpus/corpus.json");
  const queries = readJson("./results/corpus/queries.json").conflict;

  const baselines = [
    BASELINES.VANILLA_RAG,
    BASELINES.MAJORITY_VOTE,
    BASELINES.RERANK_REL_TIME,
    BASELINES.PAL_LEDGER
  ];

  const runDir = makeRunDir("conflict");

  const results = {};
  for (const b of baselines) {
    const sum = initSummary();
    let conflictGood = 0;
    let conflictTotal = 0;

    for (const q of queries) {
      // Retrieve topK from full corpus (contains both true and false)
      const top = retrieveTopK(corpus.docs, q, cfg.topK, cfg.seed + q.nowTs);

      const r = answerWithBaseline(b, cfg, top, q);

      // Conflict task scoring: if conflicting evidence exists in retrieved set, prefer CONFLICT or correct answer.
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

  const out = { experiment: "conflict", results };
  writeSummary(runDir, "summary.json", out);
  return out;
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g,"/") || "")) {
  runConflict().then(o => console.log(JSON.stringify(o, null, 2)));
}
