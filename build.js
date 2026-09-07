import fs from "fs";
import { runAll } from "./run_all.js";
import { overallScore } from "./scoring.js";

async function build() {
  console.log("Running experiments...");
  const results = await runAll();

  const score = overallScore(results);

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
