import { generateCorpus } from "./generate_corpus.js";
import { runConflict } from "./run_experiment_conflict.js";
import { runUpdate } from "./run_experiment_update.js";
import { runSwarm } from "./run_experiment_swarm.js";
import { ensureDir, readJson } from "./io.js";

export async function runAll({ cfg: cfgIn, corpus: corpusIn, queries: queriesIn } = {}) {
  let cfg = cfgIn;
  let corpus = corpusIn;
  let queries = queriesIn;

  if (!corpus || !queries) {
    ensureDir("./results");
    await generateCorpus();
    corpus = readJson("./results/corpus/corpus.json");
    queries = readJson("./results/corpus/queries.json");
  }
  cfg = cfg || readJson("./default.json");

  const a = await runConflict({ cfg, corpus, queries: queries.conflict });
  const b = await runUpdate({ cfg, corpus, queries: queries.update });
  const c = await runSwarm({ cfg, corpus, queries: queries.swarm });
  return { conflict: a.results, update: b.results, swarm: c.results };
}
