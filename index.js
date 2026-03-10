import fs from "fs";
import { runAll } from "./run_all.js";

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

(async () => {
  const results = await runAll();
  const out = { score: overallScore(results), results };
  fs.writeFileSync("./results.json", JSON.stringify(out));
  console.log(JSON.stringify(out));
})();
