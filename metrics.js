export function initSummary() {
  return {
    total: 0,
    correct: 0,
    wrong: 0,
    conflict_marked: 0,
    conflict_correct: 0,
    uncertain: 0,
    no_answer: 0,
    wrong_confident: 0,
    wrong_false: 0,
    wrong_v0: 0,
    wrong_v1: 0,
    wrong_other: 0
  };
}

function creditWrong(summary, result) {
  summary.wrong += 1;
  if ((result.confidence ?? 0) >= 0.7) summary.wrong_confident += 1;

  const v = String(result.value || "");
  if (v.startsWith("FALSE_")) summary.wrong_false += 1;
  else if (v.startsWith("v0_")) summary.wrong_v0 += 1;
  else if (v.startsWith("v1_")) summary.wrong_v1 += 1;
  else summary.wrong_other += 1;
}

export function scoreResult(summary, query, result) {
  summary.total += 1;

  const expected = query.expected;

  // A genuine-conflict query is *answered* by flagging CONFLICT — that is the
  // correct behaviour, not an abstention. Any confident value here is a miss.
  if (expected === "CONFLICT") {
    if (result.status === "CONFLICT") {
      summary.conflict_marked += 1;
      summary.conflict_correct += 1;
      summary.correct += 1;
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
    creditWrong(summary, result);
    return;
  }

  // Ordinary value query: flagging CONFLICT is a (defensible) abstention.
  if (result.status === "CONFLICT") {
    summary.conflict_marked += 1;
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
    creditWrong(summary, result);
  }
}

export function finalize(summary) {
  const accuracy = summary.total ? summary.correct / summary.total : 0;
  const answered = summary.correct + summary.wrong;
  const accuracy_answered = answered ? summary.correct / answered : 0;
  const coverage = summary.total ? answered / summary.total : 0;
  // A correctly-flagged genuine conflict is an answer, not an abstention.
  const abstain =
    (summary.conflict_marked - summary.conflict_correct) +
    summary.uncertain +
    summary.no_answer;
  const abstain_rate = summary.total ? abstain / summary.total : 0;

  return {
    ...summary,
    answered,
    accuracy,
    accuracy_answered,
    coverage,
    abstain,
    abstain_rate
  };
}
