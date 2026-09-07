import { torusWeight, projectToTorus } from "./torus.js";

export class TruthLedger {
  constructor(cfg) {
    this.cfg = cfg;
    this.claims = [];
  }

  upsertClaim(claim) {
    const baseW = Math.max(0.01, Math.min(1.0, claim.reliability ?? 0.5));
    this.claims.push({ ...claim, weight: baseW });
  }

  query(domain, subject, nowTs, queryScope = null) {
    const cfg = this.cfg;
    const qTheta = projectToTorus(domain, subject);
    const candidates = this.claims.filter(c => c.domain === domain && c.subject === subject);

    const sourceUniqueSigs = new Map();
    const signatureCounts = new Map();
    for (const c of candidates) {
      const sourceKey = c.source ?? "unknown";
      const sigKey = `${sourceKey}|${c.timestamp}|${String(c.value)}`;
      signatureCounts.set(sigKey, (signatureCounts.get(sigKey) || 0) + 1);
      if (!sourceUniqueSigs.has(sourceKey)) sourceUniqueSigs.set(sourceKey, new Set());
      sourceUniqueSigs.get(sourceKey).add(sigKey);
    }

    const scored = candidates.map(c => {
      let w = c.weight;

      w *= Math.pow((c.reliability ?? 0.5), cfg.reliabilityWeight);

      const dt = nowTs - c.timestamp;
      const timeBoost = 1 / (1 + Math.max(0, dt));
      w *= Math.pow(timeBoost, cfg.timeWeight);
      if (c.timestamp > nowTs) {
        w *= (cfg.futureTimestampPenalty ?? 0.1);
      }

      if (cfg.cyEnabled && c.theta) {
        let geoW = torusWeight(qTheta, c.theta, cfg.cySigma);
        geoW = Math.pow(geoW, cfg.cyBeta);
        w *= geoW;
      }

      const scopeWeight = scopeMatchWeight(c.scope, queryScope, cfg);
      w *= scopeWeight;

      const maxSameSourceInfluence = cfg.maxSameSourceInfluence ?? 3;
      const sourceCount = sourceUniqueSigs.get(c.source ?? "unknown")?.size || 1;
      const sourcePenalty = Math.min(1, maxSameSourceInfluence / sourceCount);
      w *= sourcePenalty;

      const sigCount = signatureCounts.get(`${c.source ?? "unknown"}|${c.timestamp}|${String(c.value)}`) || 1;
      const swarmSignaturePenalty = cfg.swarmSignaturePenalty ?? 0.2;
      const signaturePenalty = 1 / (1 + Math.max(0, sigCount - 1) * swarmSignaturePenalty);
      w *= signaturePenalty;

      return { ...c, score: w };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  decide(domain, subject, nowTs, queryScope = null) {
    const cfg = this.cfg;
    const scored = this.query(domain, subject, nowTs, queryScope);
    if (scored.length === 0) return { status: "NO_EVIDENCE", confidence: 0, picks: [] };

    const top = scored[0];
    const second = scored[1];

    if (!second) {
      const stableConf = clamp01(0.55 + 0.45 * (top.reliability ?? 0.5));
      return { status: "SINGLE", confidence: stableConf, picks: [top] };
    }

    const conflict = top.value !== second.value;
    const dominance = top.score / (top.score + second.score + 1e-9);

    if (conflict && dominance < (1 - cfg.contradictionThreshold)) {
      return { status: "CONFLICT", confidence: clamp01(dominance), picks: [top, second] };
    }

    return { status: "RESOLVED", confidence: clamp01(dominance), picks: [top] };
  }
}

export function scopeMatchWeight(claimScope, queryScope, cfg) {
  if (!queryScope || Object.keys(queryScope).length === 0) return cfg.scopeUnknownPenalty ?? 0.6;
  if (!claimScope) return cfg.scopeUnknownPenalty ?? 0.6;

  const dims = ["region", "tier", "product"];
  let known = 0;
  let exact = 0;
  let wild = 0;
  for (const k of dims) {
    const qv = queryScope[k];
    const cv = claimScope[k];
    if (qv == null || qv === "") continue;
    known += 1;
    if (cv === qv) exact += 1;
    else if (cv === "*" || cv == null) wild += 1;
    // else: mismatch — counts against
  }

  if (!known) return cfg.scopeUnknownPenalty ?? 0.6;
  const matched = exact + wild;
  if (matched < known) return cfg.scopeMismatchPenalty ?? 0.05;  // any dim mismatched
  if (wild > 0) return cfg.scopeWildcardPenalty ?? 0.75;         // all matched, some via wildcard
  return 1.0;                                                      // all dims matched exactly
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
