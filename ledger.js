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

    return (cfg.confidenceModel ?? "dominance") === "dominance"
      ? decideByDominance(cfg, scored)
      : decideByIndependence(cfg, scored);
  }
}

// Legacy model: compare the top two individual claims.
//
// Its flaw is that `dominance` scores corroboration and contradiction with the
// same number. When the top two claims carry the *same* value they support each
// other, yet dominance still lands near 0.5 and reads as low confidence — so the
// ledger is least sure exactly when its best sources agree.
function decideByDominance(cfg, scored) {
  const top = scored[0];
  const second = scored[1];

  if (!second) {
    return { status: "SINGLE", confidence: singleConfidence(top), picks: [top] };
  }

  const conflict = top.value !== second.value;
  const dominance = top.score / (top.score + second.score + 1e-9);

  if (conflict && dominance < (1 - cfg.contradictionThreshold)) {
    return { status: "CONFLICT", confidence: clamp01(dominance), picks: [top, second] };
  }

  return { status: "RESOLVED", confidence: clamp01(dominance), picks: [top] };
}

// Independence model: compare *values*, not individual claims.
//
// Support for a value is accumulated per source with diminishing returns, so a
// second independent source corroborating a claim adds real mass while the same
// source repeating itself adds very little. Confidence is then the winning
// value's mass against its best rival's — agreement raises it, contradiction
// lowers it, and the two are no longer the same measurement.
//
// NOT THE DEFAULT — this model is kept for research, and it is a documented
// negative result. It fixes the corroboration inversion above but opens a worse
// hole: summing mass across sources means an attacker who spoofs a trusted
// source manufactures an *apparent second independent witness* for the false
// claim. On the swarm experiment it takes PAL from 0 false assertions to 48,
// and in isolation it raises confidence in a spoofed claim from 0.68 to 0.85.
// Independence cannot be inferred from a self-declared `source` field, because
// that field is precisely what the attacker forges. Any future version needs
// independence established out-of-band (distinct observation channels, signed
// provenance) rather than assumed from the label.
function decideByIndependence(cfg, scored) {
  const rho = cfg.sameSourceCorrelation ?? 0.25;

  const groups = new Map();
  for (const c of scored) {
    const key = String(c.value);
    if (!groups.has(key)) groups.set(key, { value: c.value, claims: [] });
    groups.get(key).claims.push(c);
  }

  for (const g of groups.values()) {
    // Collapse exact duplicates first: one source asserting the same thing at
    // the same timestamp is one piece of evidence however many copies exist.
    const bySource = new Map();
    for (const c of g.claims) {
      const src = c.source ?? "unknown";
      if (!bySource.has(src)) bySource.set(src, new Map());
      const sigs = bySource.get(src);
      const sig = `${c.timestamp}|${String(c.value)}`;
      if (!sigs.has(sig) || sigs.get(sig) < c.score) sigs.set(sig, c.score);
    }

    let mass = 0;
    for (const sigs of bySource.values()) {
      const vals = [...sigs.values()].sort((a, b) => b - a);
      // Repeated assertions from one source are correlated, not corroborating.
      for (let i = 0; i < vals.length; i++) mass += vals[i] * Math.pow(rho, i);
    }

    g.mass = mass;
    g.witnesses = bySource.size;
    g.claims.sort((a, b) => b.score - a.score);
  }

  const ranked = [...groups.values()].sort((a, b) => b.mass - a.mass);
  const win = ranked[0];
  const rival = ranked[1];

  if (!rival) {
    return {
      status: "SINGLE",
      confidence: singleConfidence(win.claims[0]),
      picks: [win.claims[0]],
      witnesses: win.witnesses
    };
  }

  const confidence = clamp01(win.mass / (win.mass + rival.mass + 1e-9));

  if (confidence < (1 - cfg.contradictionThreshold)) {
    return {
      status: "CONFLICT",
      confidence,
      picks: [win.claims[0], rival.claims[0]],
      witnesses: win.witnesses
    };
  }

  return { status: "RESOLVED", confidence, picks: [win.claims[0]], witnesses: win.witnesses };
}

function singleConfidence(claim) {
  return clamp01(0.55 + 0.45 * (claim.reliability ?? 0.5));
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
