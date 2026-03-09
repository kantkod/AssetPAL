import { torusWeight, projectToTorus } from "./torus.js";

export class TruthLedger {
  constructor(cfg) {
    this.cfg = cfg;
    this.claims = []; 
    // claim: {domain, subject, value, timestamp, source, reliability, docId, theta, weight}
  }

  upsertClaim(claim) {
    const baseW = Math.max(0.01, Math.min(1.0, claim.reliability ?? 0.5));
    this.claims.push({ ...claim, weight: baseW });
  }

  query(domain, subject, nowTs) {
    const cfg = this.cfg;
    const qTheta = projectToTorus(domain, subject);
    const candidates = this.claims.filter(c => c.domain === domain && c.subject === subject);

    const scored = candidates.map(c => {
      let w = c.weight;

      w *= Math.pow((c.reliability ?? 0.5), cfg.reliabilityWeight);

      const dt = (nowTs - c.timestamp);
      const timeBoost = 1 / (1 + Math.max(0, dt));
      w *= Math.pow(timeBoost, cfg.timeWeight);

      let geoW = 1.0;
      if (cfg.cyEnabled && c.theta) {
        geoW = torusWeight(qTheta, c.theta, cfg.cySigma);
        geoW = Math.pow(geoW, cfg.cyBeta);
        w *= geoW;
      }
      return { ...c, score: w, geoW };
    });

    scored.sort((a,b) => b.score - a.score);
    return scored;
  }

  decide(domain, subject, nowTs) {
    const cfg = this.cfg;
    const scored = this.query(domain, subject, nowTs);
    if (scored.length === 0) return { status:"NO_EVIDENCE", confidence:0, picks:[] };

    const top = scored[0];
    const second = scored[1];

    if (!second) {
      return { status:"SINGLE", confidence: clamp01(top.score), picks:[top] };
    }

    const conflict = (top.value !== second.value);
    const dominance = top.score / (top.score + second.score + 1e-9);

    if (conflict && dominance < (1 - cfg.contradictionThreshold)) {
      return { status:"CONFLICT", confidence: clamp01(dominance), picks:[top, second] };
    }

    return { status:"RESOLVED", confidence: clamp01(dominance), picks:[top] };
  }
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
