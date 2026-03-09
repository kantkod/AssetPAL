import { generateCorpus } from "./generate_corpus.js";
import { runConflict } from "./run_experiment_conflict.js";
import { runUpdate } from "./run_experiment_update.js";
import { runSwarm } from "./run_experiment_swarm.js";
import { ensureDir } from "./io.js";

export async function runAll() {
  ensureDir("./results");
  await generateCorpus();
  const a = await runConflict();
  const b = await runUpdate();
  const c = await runSwarm();
  return { conflict: a.results, update: b.results, swarm: c.results };
}
