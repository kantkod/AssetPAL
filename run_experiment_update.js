import { readJson } from "./io.js";
import { makeRunDir, writeSummary } from "./run_utils.js";
import { runUpdateCore } from "./experiment_core.js";

export async function runUpdate({ cfg: cfgIn, corpus: corpusIn, queries: queriesIn } = {}) {
  const cfg = cfgIn || readJson("./default.json");
  const corpus = corpusIn || readJson("./results/corpus/corpus.json");
  const queries = queriesIn || readJson("./results/corpus/queries.json").update;

  const out = runUpdateCore(cfg, corpus, queries);

  if (!cfgIn) {
    const runDir = makeRunDir("update");
    writeSummary(runDir, "summary.json", out);
  }
  return out;
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g,"/") || "")) {
  runUpdate().then(o => console.log(JSON.stringify(o, null, 2)));
}
