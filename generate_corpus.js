import { readJson, writeJson, ensureDir } from "./io.js";
import { makeRng, choice, shuffle } from "./rng.js";
import { projectToTorus } from "./torus.js";
import path from "path";

function makeDoc({ id, domain, timestamp, source, reliability, text, claims }) {
  return { id, domain, timestamp, source, reliability, text, claims };
}

function claim(domain, subject, value, timestamp, source, reliability, docId, scope) {
  return {
    domain,
    subject,
    value,
    timestamp,
    source,
    reliability,
    docId,
    scope,
    theta: projectToTorus(domain, subject)
  };
}

function scope(region, tier, product, validFrom, validTo) {
  return { region, tier, product, validFrom, validTo };
}

export async function generateCorpus(configPath = "./default.json") {
  const cfg = readJson(configPath);
  const rand = makeRng(cfg.seed);

  const corpusDir = "./results/corpus";
  ensureDir(corpusDir);

  const docs = [];
  const domains = cfg.domains;
  let docCounter = 0;

  const subjectBank = {
    HR: ["refund_window", "parental_leave", "expense_policy"],
    SECURITY: ["password_rotation", "vpn_required", "data_retention"],
    PRICING: ["discount_cap", "invoice_terms", "trial_length"],
    SUPPORT: ["sla_response", "escalation_path", "supported_channels"]
  };

  const scopeCombos = [
    { region: "EU", tier: "FREE", product: "A" },
    { region: "EU", tier: "PRO", product: "A" },
    { region: "US", tier: "FREE", product: "A" },
    { region: "US", tier: "PRO", product: "B" }
  ];

  const sources = ["PolicyPortal", "Handbook", "Wiki", "Email", "Confluence", "PDFScan"];
  const reliabilityBySource = {
    PolicyPortal: 0.95,
    Handbook: 0.85,
    Wiki: 0.65,
    Confluence: 0.6,
    Email: 0.55,
    PDFScan: 0.45
  };

  for (const domain of domains) {
    const subjects = subjectBank[domain] || ["policy_rule"];
    for (const subject of subjects) {
      const trueV0 = `v0_${subject}_A`;
      const trueV1 = `v1_${subject}_B`;
      const targetedScope = scope("EU", "PRO", "A", 20, 9999);

      {
        const source = "Handbook";
        const reliability = reliabilityBySource[source];
        const timestamp = 1;
        const id = `${domain}_${subject}_T_v0_${docCounter++}`;
        const c = claim(domain, subject, trueV0, timestamp, source, reliability, id, scope("*", "*", "*", 1, 9999));
        docs.push(makeDoc({
          id,
          domain,
          timestamp,
          source,
          reliability,
          text: `${domain} policy baseline: ${subject} is ${trueV0} for all regions and tiers.`,
          claims: [c]
        }));
      }

      {
        const source = "PolicyPortal";
        const reliability = reliabilityBySource[source];
        const timestamp = 20;
        const id = `${domain}_${subject}_T_v1_scoped_${docCounter++}`;
        const c = claim(domain, subject, trueV1, timestamp, source, reliability, id, targetedScope);
        docs.push(makeDoc({
          id,
          domain,
          timestamp,
          source,
          reliability,
          text: `${domain} scoped policy update: ${subject} is ${trueV1} for EU PRO product A only.`,
          claims: [c]
        }));
      }

      {
        const source = "Wiki";
        const reliability = reliabilityBySource[source];
        const timestamp = 18;
        const falseVal = `FALSE_${subject}_X`;
        const id = `${domain}_${subject}_F_conf_${docCounter++}`;
        const c = claim(domain, subject, falseVal, timestamp, source, reliability, id, scope("EU", "PRO", "A", 18, 9999));
        docs.push(makeDoc({
          id,
          domain,
          timestamp,
          source,
          reliability,
          text: `${domain} policy note claims ${subject} is ${falseVal} and sounds official.`,
          claims: [c]
        }));
      }

      {
        const timestamp = 30;
        const reliability = 0.92;
        const source = "PolicyPortal";
        const valA = `HC_${subject}_A`;
        const valB = `HC_${subject}_B`;

        const idA = `${domain}_${subject}_HC_A_${docCounter++}`;
        const idB = `${domain}_${subject}_HC_B_${docCounter++}`;
        const cA = claim(domain, subject, valA, timestamp, source, reliability, idA, scope("EU", "PRO", "A", 30, 9999));
        const cB = claim(domain, subject, valB, timestamp, source, reliability, idB, scope("EU", "PRO", "B", 30, 9999));

        docs.push(makeDoc({
          id: idA,
          domain,
          timestamp,
          source,
          reliability,
          text: `${domain} emergency bulletin: ${subject} is ${valA} for EU PRO product A (official).`,
          claims: [cA]
        }));
        docs.push(makeDoc({
          id: idB,
          domain,
          timestamp,
          source,
          reliability,
          text: `${domain} emergency bulletin: ${subject} is ${valB} for EU PRO product B (official).`,
          claims: [cB]
        }));
      }

      for (let i = 0; i < 2; i++) {
        const source = choice(sources, rand);
        const reliability = reliabilityBySource[source] ?? 0.5;
        const timestamp = 15;
        const id = `${domain}_${subject}_D_${i}_${docCounter++}`;
        docs.push(makeDoc({
          id,
          domain,
          timestamp,
          source,
          reliability,
          text: `${domain} notes mention ${subject} repeatedly but provide no binding claim.`,
          claims: []
        }));
      }
    }
  }

  const queries = { conflict: [], update: [], swarm: [] };

  for (const domain of domains) {
    const subjects = subjectBank[domain];
    for (const subject of subjects) {
      queries.conflict.push({
        id: `Q_conf_soft_${domain}_${subject}`,
        domain,
        subject,
        nowTs: 20,
        question: `What is the ${domain} policy for ${subject}?`,
        expected: `v1_${subject}_B`,
        scope: { region: "EU", tier: "PRO", product: "A" }
      });

      queries.conflict.push({
        id: `Q_conf_hard_${domain}_${subject}`,
        domain,
        subject,
        nowTs: 35,
        question: `What is the emergency ${domain} policy for ${subject} in EU PRO?`,
        expected: "CONFLICT",
        hardConflict: true,
        scope: { region: "EU", tier: "PRO" }
      });

      for (const sc of shuffle([...scopeCombos], rand)) {
        const t0Expected = `v0_${subject}_A`;
        const t1Expected = (sc.region === "EU" && sc.tier === "PRO" && sc.product === "A") ? `v1_${subject}_B` : `v0_${subject}_A`;

        queries.update.push({
          id: `Q_upd0_${domain}_${subject}_${sc.region}_${sc.tier}_${sc.product}`,
          domain,
          subject,
          nowTs: 5,
          question: `As of earlier policy, what is ${subject} for ${sc.region} ${sc.tier} product ${sc.product}?`,
          expected: t0Expected,
          phase: "t0",
          scope: { ...sc }
        });

        queries.update.push({
          id: `Q_upd1_${domain}_${subject}_${sc.region}_${sc.tier}_${sc.product}`,
          domain,
          subject,
          nowTs: 25,
          question: `As of latest policy, what is ${subject} for ${sc.region} ${sc.tier} product ${sc.product}?`,
          expected: t1Expected,
          phase: "t1",
          scope: { ...sc },
          updateApplies: t1Expected.startsWith("v1_")
        });
      }

      queries.swarm.push({
        id: `Q_swarm_${domain}_${subject}`,
        domain,
        subject,
        nowTs: 22,
        question: `What is the ${domain} policy for ${subject} for EU PRO product A?`,
        expected: `v1_${subject}_B`,
        falseValue: `FALSE_${subject}_X`,
        scope: { region: "EU", tier: "PRO", product: "A" }
      });
    }
  }

  writeJson(path.join(corpusDir, "corpus.json"), { docs });
  writeJson(path.join(corpusDir, "queries.json"), queries);

  return { docs: docs.length, queryCounts: Object.fromEntries(Object.entries(queries).map(([k, v]) => [k, v.length])) };
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  generateCorpus().then((out) => console.log("Generated:", out));
}
