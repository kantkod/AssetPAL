export function initSummary() {
  return {
    total: 0,
    correct: 0,
    wrong: 0,
    conflict_marked: 0,
    uncertain: 0,
    no_answer: 0,
    wrong_confident: 0
  };
}

export function scoreResult(summary, query, result) {
  summary.total += 1;

  const expected = query.expected;

  if (result.status === "CONFLICT") {
    summary.conflict_marked += 1;
    // count as correct behavior in conflict experiment scoring may differ; handled by experiment-specific logic
    return;
  }
  if (result.status === "UNCERTAIN") {
    summary.uncertain += 1;
    return;
  }
  if (result.status === "NO_ANSWER") {
    summary.no_answer += 1;
    return;
  }

  if (result.value === expected) {
    summary.correct += 1;
  } else {
    summary.wrong += 1;
    if ((result.confidence ?? 0) >= 0.7) summary.wrong_confident += 1;
  }
}

export function finalize(summary) {
  const acc = summary.total ? summary.correct / summary.total : 0;
  return { ...summary, accuracy: acc };
}
