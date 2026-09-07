import fs from "fs";
import { generateCorpus } from "./generate_corpus.js";
import { readJson } from "./io.js";
import { runConflict } from "./run_experiment_conflict.js";
import { runUpdate } from "./run_experiment_update.js";
import { runSwarm } from "./run_experiment_swarm.js";
import { createRunStore } from "./run_store.js";
import { overallScore } from "./scoring.js";

async function ensureCorpus() {
  const corpusPath = "./results/corpus/corpus.json";
  const queriesPath = "./results/corpus/queries.json";
  if (!fs.existsSync(corpusPath) || !fs.existsSync(queriesPath)) {
    await generateCorpus();
  }
}

async function runBench() {
  const cfg = readJson("./default.json");
  await ensureCorpus();

  const corpus = readJson("./results/corpus/corpus.json");
  const queries = readJson("./results/corpus/queries.json");

  const conflict = await runConflict({ cfg, corpus, queries: queries.conflict });
  const update = await runUpdate({ cfg, corpus, queries: queries.update });
  const swarm = await runSwarm({ cfg, corpus, queries: queries.swarm });

  const results = {
    conflict: conflict.results,
    update: update.results,
    swarm: swarm.results
  };

  const summaryObj = {
    score: overallScore(results),
    results
  };

  const perQuery = [...conflict.perQuery, ...update.perQuery, ...swarm.perQuery];

  const runStore = createRunStore();
  runStore.writeJson("summary.json", summaryObj);
  runStore.writeJson("per_query.json", perQuery);
  runStore.writeJson("config.json", cfg);
  runStore.writeJson("meta.json", {
    timestamp: runStore.timestamp,
    nodeVersion: process.version,
    gitSha: runStore.gitSha
  });
  runStore.finalize();

  fs.writeFileSync("./results.json", JSON.stringify(summaryObj));
  console.log(JSON.stringify({ ...summaryObj, runId: runStore.runId }));
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  runBench();
}

export { runBench };
