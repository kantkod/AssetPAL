import fs from "fs";
import { runAll } from "./src/run_all.js";

function overallScore(results){
  // Use PAL_LEDGER performance primarily; fall back to average correct/total across all if missing.
  let total=0, correct=0;
  for (const expName of Object.keys(results)){
    const exp = results[expName];
    if (!exp) continue;
    // exp is a map baselineName -> summary
    const pal = exp["PAL_LEDGER"] || exp["pal_ledger"] || exp["PAL"] || null;
    const use = pal || null;
    if (use && typeof use.total==="number"){
      total += use.total;
      correct += use.correct || 0;
    } else {
      for (const b of Object.keys(exp)){
        const s = exp[b];
        if (s && typeof s.total==="number"){
          total += s.total;
          correct += s.correct || 0;
        }
      }
    }
  }
  return total>0 ? correct/total : 0;
}

(async () => {
  const results = await runAll();
  const out = { score: overallScore(results), results };
  // Write a machine-readable file for any UI runner that expects a single JSON artifact.
  fs.writeFileSync("./results.json", JSON.stringify(out));
  // IMPORTANT: print ONLY JSON to stdout (some UIs require this)
  console.log(JSON.stringify(out));
})();
