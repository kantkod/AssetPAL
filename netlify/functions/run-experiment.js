import { runConflictCore, runUpdateCore, runSwarmCore } from "../../experiment_core.js";
import { corpus, queries, config as defaultConfig } from "./_data.js";
import { overallScore } from "../../scoring.js";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const experiment = url.searchParams.get("experiment") || "all";
    const cfg = defaultConfig;

    let results = {};
    if (experiment === "conflict" || experiment === "all") {
      results.conflict = runConflictCore(cfg, corpus, queries.conflict).results;
    }
    if (experiment === "update" || experiment === "all") {
      results.update = runUpdateCore(cfg, corpus, queries.update).results;
    }
    if (experiment === "swarm" || experiment === "all") {
      results.swarm = runSwarmCore(cfg, corpus, queries.swarm).results;
    }

    const score = overallScore(results);

    return new Response(JSON.stringify({ score, results }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/api/run-experiment" };
