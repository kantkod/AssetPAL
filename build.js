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

  // Bundle corpus and config as static assets
  fs.mkdirSync("./public/data", { recursive: true });
  fs.copyFileSync("./results/corpus/corpus.json", "./public/data/corpus.json");
  fs.copyFileSync("./results/corpus/queries.json", "./public/data/queries.json");
  fs.copyFileSync("./default.json", "./public/data/config.json");

  // Generate inline data module for Netlify Function (avoids self-fetch)
  const corpusData = fs.readFileSync("./results/corpus/corpus.json", "utf8");
  const queriesData = fs.readFileSync("./results/corpus/queries.json", "utf8");
  const configData = fs.readFileSync("./default.json", "utf8");
  fs.mkdirSync("./netlify/functions", { recursive: true });
  fs.writeFileSync("./netlify/functions/_data.js",
    `export const corpus = ${corpusData};\n` +
    `export const queries = ${queriesData};\n` +
    `export const config = ${configData};\n`
  );

  console.log("Build complete. Score:", score);
}

build().catch(err => { console.error(err); process.exit(1); });
