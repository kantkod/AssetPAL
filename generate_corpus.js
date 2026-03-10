import { readJson, writeJson, ensureDir } from "./io.js";
import { makeRng, choice, shuffle } from "./rng.js";
import { projectToTorus } from "./torus.js";
import path from "path";

function makeDoc({id, domain, timestamp, source, reliability, text, claims}) {
  return { id, domain, timestamp, source, reliability, text, claims };
}

function claim(domain, subject, value, timestamp, source, reliability, docId){
  return {
    domain, subject, value,
    timestamp, source, reliability,
    docId,
    theta: projectToTorus(domain, subject)
  };
}

export async function generateCorpus(configPath = "./default.json") {
  const cfg = readJson(configPath);
  const rand = makeRng(cfg.seed);

  const corpusDir = "./results/corpus";
  ensureDir(corpusDir);

  const docs = [];
  const domains = cfg.domains;
  let docCounter = 0;

  // Subjects per domain
  const subjectBank = {
    HR: ["refund_window", "parental_leave", "expense_policy"],
    SECURITY: ["password_rotation", "vpn_required", "data_retention"],
    PRICING: ["discount_cap", "invoice_terms", "trial_length"],
    SUPPORT: ["sla_response", "escalation_path", "supported_channels"]
  };

  const sources = ["PolicyPortal","Handbook","Wiki","Email","Confluence","PDFScan"];
  const reliabilityBySource = {
    PolicyPortal: 0.95,
    Handbook: 0.85,
    Wiki: 0.65,
    Confluence: 0.6,
    Email: 0.55,
    PDFScan: 0.45
  };

  // Generate per domain:
  // - canonical truth v1 (timestamp 10)
  // - old truth v0 (timestamp 1)
  // - conflict false (timestamp 12) with high lexical overlap
  // - near-duplicates of false (timestamp 12) (we'll create later per swarm)
  // - distractors
  for (const domain of domains) {
    const subjects = subjectBank[domain] || ["policy_rule"];
    for (const subject of subjects) {
      const trueV0 = `v0_${subject}_A`;
      const trueV1 = `v1_${subject}_B`; // "newer" truth

      // Old truth
      {
        const source = "Handbook";
        const reliability = reliabilityBySource[source];
        const timestamp = 1;
        const id = `${domain}_${subject}_T_v0_${docCounter++}`;
        const c = claim(domain, subject, trueV0, timestamp, source, reliability, id);
        docs.push(makeDoc({
          id, domain, timestamp, source, reliability,
          text: `${domain} policy: ${subject} is ${trueV0}. This is the official older policy.`,
          claims: [c]
        }));
      }
      // New truth
      {
        const source = "PolicyPortal";
        const reliability = reliabilityBySource[source];
        const timestamp = 20;
        const id = `${domain}_${subject}_T_v1_${docCounter++}`;
        const c = claim(domain, subject, trueV1, timestamp, source, reliability, id);
        docs.push(makeDoc({
          id, domain, timestamp, source, reliability,
          text: `${domain} policy update: ${subject} is ${trueV1}. This is the latest official policy.`,
          claims: [c]
        }));
      }

      // Conflicting false (looks authoritative but less reliable)
      {
        const source = "Wiki";
        const reliability = reliabilityBySource[source];
        const timestamp = 18;
        const falseVal = `FALSE_${subject}_X`;
        const id = `${domain}_${subject}_F_conf_${docCounter++}`;
        const c = claim(domain, subject, falseVal, timestamp, source, reliability, id);
        docs.push(makeDoc({
          id, domain, timestamp, source, reliability,
          text: `${domain} policy: ${subject} is ${falseVal}. This page claims it is official and repeats key terms: ${subject}, policy, official, latest.`,
          claims: [c]
        }));
      }

      // Distractors: high overlap text but unrelated subject
      for (let i=0;i<2;i++){
        const source = choice(sources, rand);
        const reliability = reliabilityBySource[source] ?? 0.5;
        const timestamp = 15;
        const id = `${domain}_${subject}_D_${i}_${docCounter++}`;
        docs.push(makeDoc({
          id, domain, timestamp, source, reliability,
          text: `${domain} policy notes mention ${subject} but are actually about unrelated procedures. Many repeated tokens: ${subject} official policy latest update.`,
          claims: [] // no direct claim
        }));
      }
    }
  }

  // Build query sets for experiments. Each query targets one (domain, subject) with expected answer under scenario.
  const queries = {
    conflict: [],
    update: [],
    swarm: []
  };

  // Conflict queries: force conflict by mixing true v1 and false and (optionally) another conflicting doc
  // We'll generate queries that ask for subject value "as of now=20".
  for (const domain of domains) {
    const subjects = subjectBank[domain];
    for (const subject of subjects) {
      queries.conflict.push({
        id: `Q_conf_${domain}_${subject}`,
        domain, subject,
        nowTs: 20,
        question: `What is the ${domain} policy for ${subject}?`,
        expected: `v1_${subject}_B`,
        // conflict expects system to either resolve to v1 or mark conflict if evidence mixed
      });
    }
  }

  // Update queries: t0 before update (now=5) expects v0, t1 after update (now=20) expects v1
  for (const domain of domains) {
    const subjects = subjectBank[domain];
    for (const subject of subjects) {
      queries.update.push({
        id: `Q_upd0_${domain}_${subject}`,
        domain, subject,
        nowTs: 5,
        question: `As of earlier policy, what is ${subject}?`,
        expected: `v0_${subject}_A`,
        phase: "t0"
      });
      queries.update.push({
        id: `Q_upd1_${domain}_${subject}`,
        domain, subject,
        nowTs: 25,
        question: `As of latest policy, what is ${subject}?`,
        expected: `v1_${subject}_B`,
        phase: "t1"
      });
    }
  }

  // Swarm queries: same as conflict but we'll add swarm docs externally during experiment
  for (const domain of domains) {
    const subjects = subjectBank[domain];
    for (const subject of subjects) {
      queries.swarm.push({
        id: `Q_swarm_${domain}_${subject}`,
        domain, subject,
        nowTs: 22,
        question: `What is the ${domain} policy for ${subject}?`,
        expected: `v1_${subject}_B`,
        falseValue: `FALSE_${subject}_X`
      });
    }
  }

  writeJson(path.join(corpusDir, "corpus.json"), { docs });
  writeJson(path.join(corpusDir, "queries.json"), queries);

  return { docs: docs.length, queries };
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g,"/") || "")) {
  generateCorpus().then((out)=>console.log("Generated:", out));
}
