import fs from "fs";
import { runAll } from "./run_all.js";
import { overallScore } from "./scoring.js";

(async () => {
  const results = await runAll();
  const out = { score: overallScore(results), results };
  fs.writeFileSync("./results.json", JSON.stringify(out));
  console.log(JSON.stringify(out));
})();
