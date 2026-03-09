export function wrapAngleDiff(a, b) {
  let d = Math.abs(a - b);
  const twoPi = Math.PI * 2;
  if (d > Math.PI) d = twoPi - d;
  return d;
}
export function torusDist(thetaA, thetaB) {
  const d1 = wrapAngleDiff(thetaA[0], thetaB[0]);
  const d2 = wrapAngleDiff(thetaA[1], thetaB[1]);
  return Math.sqrt(d1*d1 + d2*d2);
}
export function torusWeight(thetaA, thetaB, sigma) {
  const d = torusDist(thetaA, thetaB);
  const s2 = (sigma*sigma) || 1e-6;
  return Math.exp(-(d*d)/(2*s2));
}
// Simple deterministic "projection": map (domain,subject) to a stable torus coordinate.
// This is CY-lite: cycles enforce context separation.
export function projectToTorus(domain, subject) {
  const h = hashString(domain + "::" + subject);
  // Two angles derived from hash
  const theta1 = ((h % 360) * Math.PI) / 180;
  const theta2 = (((Math.floor(h/360) % 360) * Math.PI) / 180);
  return [theta1, theta2];
}
function hashString(s) {
  let h = 2166136261;
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h>>>0);
}
