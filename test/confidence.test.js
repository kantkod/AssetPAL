import test from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../io.js";
import { TruthLedger } from "../ledger.js";

const base = readJson("./default.json");
const scope = { region: "EU", tier: "PRO", product: "A" };

function ledgerWith(model, claims) {
  const L = new TruthLedger({ ...base, confidenceModel: model });
  for (const c of claims) L.upsertClaim({ domain: "HR", subject: "x", scope, ...c });
  return L.decide("HR", "x", 22, scope);
}

// A weak stale rival, so `decide` actually compares two values rather than
// short-circuiting to SINGLE.
const weakRival = { value: "v0_x", source: "OldWiki", timestamp: 5, reliability: 0.5 };

// Two independent, equally-weighted sources saying the SAME thing.
const corroborating = [
  { value: "v1_x", source: "PolicyPortal", timestamp: 20, reliability: 0.9 },
  { value: "v1_x", source: "Handbook",     timestamp: 20, reliability: 0.9 },
  weakRival
];

test("dominance model: corroboration is scored as if it were doubt", () => {
  // The known flaw. Two sources agreeing produce dominance ~0.5, which the
  // confidence gate reads as "no clear winner" — so the ledger is least
  // confident exactly when its best sources agree.
  const d = ledgerWith("dominance", corroborating);
  assert.equal(d.status, "RESOLVED");
  assert.ok(d.confidence < 0.55,
    `expected the inversion (confidence ~0.5), got ${d.confidence}`);
  assert.ok(d.confidence < base.confidenceThreshold,
    "agreement drops it below the answer threshold, forcing UNCERTAIN");
});

test("independence model: corroboration raises confidence, as it should", () => {
  const d = ledgerWith("independence", corroborating);
  assert.equal(d.status, "RESOLVED");
  assert.ok(d.confidence > 0.9,
    `two agreeing witnesses should be near-certain, got ${d.confidence}`);
});

test("independence model amplifies a spoofed witness (why it is not default)", () => {
  // NEGATIVE RESULT, pinned deliberately. The attacker asserts a false claim
  // from a real low-trust source AND from a forged high-trust one. Summing mass
  // across sources treats the forgery as a second independent witness, so
  // confidence in the lie goes UP relative to the dominance model.
  const spoofed = [
    { value: "FALSE_x", source: "Wiki",         timestamp: 22, reliability: 0.65 },
    { value: "FALSE_x", source: "PolicyPortal", timestamp: 22, reliability: 0.95 },
    { value: "v1_x",    source: "PolicyPortal", timestamp: 20, reliability: 0.95 }
  ];
  const dom = ledgerWith("dominance", spoofed);
  const ind = ledgerWith("independence", spoofed);

  assert.ok(String(ind.picks[0].value).startsWith("FALSE_"));
  assert.ok(ind.confidence > dom.confidence,
    `independence should be MORE confident in the lie (${ind.confidence} vs ${dom.confidence})`);
});

test("independence model: one source repeating itself is not corroboration", () => {
  // The part that does work: diminishing returns within a source.
  const repeated = ledgerWith("independence", [
    { value: "v1_x", source: "PolicyPortal", timestamp: 20, reliability: 0.9 },
    { value: "v1_x", source: "PolicyPortal", timestamp: 20, reliability: 0.9 },
    { value: "v1_x", source: "PolicyPortal", timestamp: 20, reliability: 0.9 },
    weakRival
  ]);
  const twoSources = ledgerWith("independence", corroborating);
  assert.ok(twoSources.confidence > repeated.confidence,
    "two distinct sources must outweigh one source repeating itself");
});

test("default config selects the dominance model", () => {
  assert.equal(base.confidenceModel, "dominance",
    "independence is a documented negative result and must not be the default");
});
