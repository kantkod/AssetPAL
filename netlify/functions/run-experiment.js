import { runAll } from "../../run_all.js";
import { runConflict } from "../../run_experiment_conflict.js";
import { runUpdate } from "../../run_experiment_update.js";
import { runSwarm } from "../../run_experiment_swarm.js";

export default async (req) => {
  const url = new URL(req.url);
  const experiment = url.searchParams.get("experiment") || "all";

  // Fetch pre-built corpus from static assets
  const baseUrl = url.origin;
  const [corpusRes, queriesRes, configRes] = await Promise.all([
    fetch(`${baseUrl}/data/corpus.json`),
    fetch(`${baseUrl}/data/queries.json`),
    fetch(`${baseUrl}/data/config.json`)
  ]);
  const corpus = await corpusRes.json();
  const queries = await queriesRes.json();
  const cfg = await configRes.json();

  let results;
  if (experiment === "conflict") {
    const r = await runConflict({ cfg, corpus, queries: queries.conflict });
    results = { conflict: r.results };
  } else if (experiment === "update") {
    const r = await runUpdate({ cfg, corpus, queries: queries.update });
    results = { update: r.results };
  } else if (experiment === "swarm") {
    const r = await runSwarm({ cfg, corpus, queries: queries.swarm });
    results = { swarm: r.results };
  } else {
    results = await runAll({ cfg, corpus, queries });
  }

  // Compute score
  let total = 0, correct = 0;
  for (const expName of Object.keys(results)) {
    const exp = results[expName];
    if (!exp) continue;
    const pal = exp["PAL_LEDGER"] || null;
    if (pal && typeof pal.total === "number") {
      total += pal.total;
      correct += pal.correct || 0;
    } else {
      for (const b of Object.keys(exp)) {
        const s = exp[b];
        if (s && typeof s.total === "number") {
          total += s.total;
          correct += s.correct || 0;
        }
      }
    }
  }
  const score = total > 0 ? correct / total : 0;

  return new Response(JSON.stringify({ score, results }), {
    headers: { "Content-Type": "application/json" }
  });
};

export const config = { path: "/api/run-experiment" };
