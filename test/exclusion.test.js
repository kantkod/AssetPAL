// Exclusion confidence (the fermion idea), pre-registered 7 Nov 2026.
// These pin properties that hold by construction. They are not findings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TruthLedger, exclusionDirection, residualLength } from "../ledger.js";

const base = JSON.parse(fs.readFileSync(new URL("../default.json", import.meta.url)));
const MODES = ["identity", "text", "identity_text"];

function claim(docId, value, source, text, timestamp = 95, reliability = 0.9) {
  return { domain: "HR", subject: "leave_days", value, timestamp, source, reliability, docId, text };
}
function decide(mode, claims) {
  const ledger = new TruthLedger({ ...base, confidenceModel: "exclusion", exclusionDirections: mode });
  for (const c of claims) ledger.upsertClaim(c);
  const d = ledger.decide("HR", "leave_days", 100, null);
  return { status: d.status, confidence: d.confidence, pick: d.picks[0]?.docId };
}

test("residual: a copy adds nothing, an orthogonal direction adds everything", () => {
  const basis = [];
  const a = exclusionDirection({ source: "X" }, "identity");
  const b = exclusionDirection({ source: "Y" }, "identity");
  assert.equal(residualLength(a, basis), 1);
  assert.equal(residualLength(exclusionDirection({ source: "X" }, "identity"), basis), 0);
  assert.equal(residualLength(b, basis), 1);
});

test("residual: partly overlapping wording adds part of its weight", () => {
  const basis = [];
  residualLength(exclusionDirection({ text: "leave is 25 days" }, "text"), basis);
  const r = residualLength(exclusionDirection({ text: "leave is 30 days" }, "text"), basis);
  assert.ok(r > 0 && r < 1, `expected a partial residual, got ${r}`);
});

test("exact duplicates never change the decision, in every direction mode", () => {
  const claims = [
    claim("d1", "25", "Authority", "Annual leave is 25 days for all staff."),
    claim("d2", "30", "Community", "Staff get 30 days of leave, says the forum.", 97, 0.6),
  ];
  for (const mode of MODES) {
    const once = decide(mode, claims);
    const twice = decide(mode, [...claims, { ...claims[0], docId: "d1" }, { ...claims[1], docId: "d2" }]);
    assert.deepEqual(twice, once, mode);
  }
});

test("input order never changes the decision", () => {
  const claims = [
    claim("d1", "25", "Authority", "Annual leave is 25 days for all staff."),
    claim("d2", "25", "Auditor", "The audit confirms 25 days of annual leave."),
    claim("d3", "30", "Community", "Staff get 30 days of leave, says the forum.", 97, 0.6),
  ];
  for (const mode of MODES) {
    assert.deepEqual(decide(mode, [...claims].reverse()), decide(mode, claims), mode);
  }
});

test("a distinct verified witness raises confidence under identity directions", () => {
  const solo = [claim("d1", "25", "Authority", "a"), claim("d3", "30", "Community", "b", 95, 0.9)];
  const corroborated = [...solo, claim("d2", "25", "Auditor", "c")];
  assert.ok(decide("identity", corroborated).confidence > decide("identity", solo).confidence);
});

test("an unknown direction mode is refused", () => {
  assert.throws(() => decide("colour", [claim("d1", "25", "A", "x"), claim("d2", "30", "B", "y")]), /exclusionDirections/);
});
