import fs from "fs";
import { runAll } from "./run_all.js";

async function build() {
  console.log("Running experiments...");
  const results = await runAll();

  // Compute overall score
  let total = 0, correct = 0;
  for (const expName of Object.keys(results)) {
    const exp = results[expName];
    if (!exp) continue;
    const pal = exp["PAL_LEDGER"] || null;
    const use = pal || null;
    if (use && typeof use.total === "number") {
      total += use.total;
      correct += use.correct || 0;
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
  const out = { score, results };

  // Write results.json for reference
  fs.writeFileSync("./results.json", JSON.stringify(out));

  // Copy public directory
  fs.mkdirSync("./public", { recursive: true });

  // Read the HTML template and inject results
  const html = fs.readFileSync("./site/index.html", "utf8");
  const finalHtml = html.replace(
    "/*__RESULTS_PLACEHOLDER__*/",
    `window.__RESULTS__ = ${JSON.stringify(out)};`
  );
  fs.writeFileSync("./public/index.html", finalHtml);

  console.log("Build complete. Score:", score);
}

build().catch(err => { console.error(err); process.exit(1); });
