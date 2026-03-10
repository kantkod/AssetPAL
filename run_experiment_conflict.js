import { readJson } from "./io.js";
import { makeRunDir, writeSummary } from "./run_utils.js";
import { runConflictCore } from "./experiment_core.js";

export async function runConflict({ cfg: cfgIn, corpus: corpusIn, queries: queriesIn } = {}) {
  const cfg = cfgIn || readJson("./default.json");
  const corpus = corpusIn || readJson("./results/corpus/corpus.json");
  const queries = queriesIn || readJson("./results/corpus/queries.json").conflict;

  const out = runConflictCore(cfg, corpus, queries);

  if (!cfgIn) {
    const runDir = makeRunDir("conflict");
    writeSummary(runDir, "summary.json", out);
  }
  return out;
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g,"/") || "")) {
  runConflict().then(o => console.log(JSON.stringify(o, null, 2)));
}
