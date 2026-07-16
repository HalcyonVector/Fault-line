// The core damage model: real haversine distance, a simplified MMI-like
// intensity-attenuation estimate, and resilience-scaled damage. Every
// function here is pure and deterministic — see server/test/damageModel.test.js.
//
// The attenuation formula is deliberately simple and clearly NOT a real
// ShakeMap / region-calibrated Ground-Motion-to-Intensity-Conversion-Equation
// (GMICE). It's loosely inspired by the shape of published intensity-
// attenuation relations (e.g. Bakun & Wentworth 1997-style "intensity falls
// off roughly linearly with log distance, rises with magnitude"), with
// hand-picked coefficients tuned only to feel reasonable across the
// magnitude/distance ranges this app cares about. See the README's Honest
// Limitations section.

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lon points, in kilometers. */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Simplified MMI-like (roughly 0-12) local shaking-intensity estimate from
 * magnitude, focal depth, and epicentral distance. Uses hypocentral (slant)
 * distance so depth genuinely matters, not just as a separate penalty term.
 * Not a real GMICE — see the module doc comment above.
 */
export function estimateShakingIntensity({ magnitude, depthKm, distanceKm }) {
  const depth = Math.max(1, depthKm ?? 10);
  const epicentral = Math.max(0, distanceKm ?? 0);
  const hypocentralKm = Math.sqrt(epicentral * epicentral + depth * depth);
  const intensity = 1.5 * magnitude - 2.85 * Math.log10(hypocentralKm + 5) + 4.2;
  return clamp(intensity, 0, 12);
}

/**
 * Damage dealt to a site = its local shaking intensity, scaled down by the
 * site's current resilience (0-100). Resilience never fully eliminates
 * damage (real risk always remains, even at max investment) — it can only
 * absorb up to 90% of the shaking intensity.
 */
export function computeDamage(intensity, resilience) {
  const r = clamp(resilience ?? 0, 0, 100);
  const absorptionFactor = (r / 100) * 0.9;
  const damage = intensity * (1 - absorptionFactor);
  return clamp(damage, 0, intensity);
}

/** Convenience: distance + intensity + damage in one call, for a quake against a single site. */
export function computeImpact({ siteLat, siteLon, siteResilience, quakeLat, quakeLon, magnitude, depthKm }) {
  const distanceKm = haversineDistanceKm(siteLat, siteLon, quakeLat, quakeLon);
  const intensity = estimateShakingIntensity({ magnitude, depthKm, distanceKm });
  const damage = computeDamage(intensity, siteResilience);
  return { distanceKm, intensity, damage };
}
