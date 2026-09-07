// Single source of truth for benchmark scoring.
//
// Every surface that reports a score — bench.js, index.js, build.js and the
// Netlify function — imports from here, so the CLI and the deployed site can
// never disagree about the same run.
//
// A summary's effective accuracy is simply correct / total. `scoreResult`
// already credits a correctly-flagged genuine conflict as correct, so no
// per-experiment special case is needed: abstaining when an answer was
// available counts as a miss, and flagging a real conflict counts as a hit.

const PAL_KEYS = ["PAL_LEDGER", "pal_ledger", "PAL"];

export function pickPalSummary(exp) {
  if (!exp) return null;
  for (const k of PAL_KEYS) {
    if (exp[k]) return exp[k];
  }
  return null;
}

// A flat summary has a numeric `total`; the swarm experiment instead nests one
// summary per scenario ({ plain_swarm_0: {...}, ... }).
function isFlatSummary(v) {
  return !!v && typeof v.total === "number";
}

export function effectiveAccuracy(summary) {
  if (!isFlatSummary(summary) || summary.total === 0) return null;
  return (summary.correct || 0) / summary.total;
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Accuracy for one experiment's baseline entry, averaging nested scenarios
// (swarm) so that every experiment contributes equally to the overall score
// regardless of how many scenarios or queries it happens to contain.
export function summaryAccuracy(entry) {
  if (isFlatSummary(entry)) return effectiveAccuracy(entry);
  if (!entry || typeof entry !== "object") return null;

  const nested = Object.values(entry)
    .map(effectiveAccuracy)
    .filter(v => v !== null);
  return nested.length ? average(nested) : null;
}

export function overallScore(results) {
  const experimentAccuracies = [];

  for (const exp of Object.values(results || {})) {
    if (!exp) continue;

    const pal = pickPalSummary(exp);
    if (pal) {
      const acc = summaryAccuracy(pal);
      if (acc !== null) experimentAccuracies.push(acc);
      continue;
    }

    // No PAL entry (e.g. a partial run): fall back to averaging the baselines.
    const baselineAcc = Object.values(exp)
      .map(summaryAccuracy)
      .filter(v => v !== null);
    if (baselineAcc.length) experimentAccuracies.push(average(baselineAcc));
  }

  return average(experimentAccuracies);
}
