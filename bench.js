import fs from "fs";
import { generateCorpus } from "./generate_corpus.js";
import { readJson } from "./io.js";
import { runConflict } from "./run_experiment_conflict.js";
import { runUpdate } from "./run_experiment_update.js";
import { runSwarm } from "./run_experiment_swarm.js";
import { createRunStore } from "./run_store.js";

function pickPalSummary(exp) {
  return exp["PAL_LEDGER"] || exp["pal_ledger"] || exp["PAL"] || null;
}

function effectiveAccuracy(experimentName, summary) {
  if (!summary || typeof summary.total !== "number" || summary.total === 0) return null;

  if (experimentName === "conflict") {
    const effectiveCorrect = (summary.correct || 0) + (summary.conflict_good || 0);
    return effectiveCorrect / summary.total;
  }

  const answered = summary.answered ?? ((summary.correct || 0) + (summary.wrong || 0));
  const accuracyAnswered = summary.accuracy_answered ?? (answered ? (summary.correct || 0) / answered : 0);
  const coverage = summary.coverage ?? (summary.total ? answered / summary.total : 0);
  return accuracyAnswered * coverage;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function overallScore(results) {
  const experimentAccuracies = [];

  for (const expName of Object.keys(results)) {
    const exp = results[expName];
    if (!exp) continue;

    if (expName === "swarm") {
      const pal = pickPalSummary(exp);
      const target = pal || Object.values(exp)[0];
      if (!target) continue;

      const scenarioAcc = Object.values(target)
        .map(summary => effectiveAccuracy("swarm", summary))
        .filter(v => v !== null);
      if (scenarioAcc.length) experimentAccuracies.push(average(scenarioAcc));
      continue;
    }

    const palSummary = pickPalSummary(exp);
    if (palSummary) {
      const acc = effectiveAccuracy(expName, palSummary);
      if (acc !== null) experimentAccuracies.push(acc);
      continue;
    }

    const baselineAcc = Object.values(exp)
      .map(summary => effectiveAccuracy(expName, summary))
      .filter(v => v !== null);
    if (baselineAcc.length) experimentAccuracies.push(average(baselineAcc));
  }

  return average(experimentAccuracies);
}

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
