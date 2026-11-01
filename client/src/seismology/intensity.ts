// Estimated shaking intensity (Modified Mercalli Intensity, MMI) at a distance
// from an earthquake, using the Atkinson & Wald (2007) intensity prediction
// equation with its California coefficients:
//
//   MMI = c1 + c2(M-6) + c3(M-6)^2 + c4 log10(R) + c5 R + c6 B + c7 M log10(R)
//   R = sqrt(D^2 + h^2),  h = max(4, 10^(-1.72 + 0.43 M)),  B = max(0, log10(R / 30))
//
// D here is hypocentral distance (epicentral distance and depth combined),
// which stands in for rupture distance for anything but very large events.
// Applying California coefficients globally is a deliberate simplification:
// real attenuation differs by region (stable cratons carry shaking much
// further). It is a rough estimate, not a ShakeMap.

const C = { c1: 12.27, c2: 2.27, c3: 0.1304, c4: -1.3, c5: -0.000707, c6: 1.95, c7: -0.577, rt: 30 };

export const MIN_MMI = 1;
export const MAX_MMI = 10;

/** Estimated MMI at `epicentralKm` from a quake of magnitude `mag` at `depthKm`, clamped to I..X. */
export function estimateMmi(mag: number, epicentralKm: number, depthKm: number): number {
  const d = Math.hypot(Math.max(0, epicentralKm), Math.max(0, depthKm));
  const h = Math.max(4, 10 ** (-1.72 + 0.43 * mag));
  const r = Math.hypot(d, h);
  const logR = Math.log10(r);
  const b = Math.max(0, Math.log10(r / C.rt));
  const m6 = mag - 6;
  const mmi = C.c1 + C.c2 * m6 + C.c3 * m6 * m6 + C.c4 * logR + C.c5 * r + C.c6 * b + C.c7 * mag * logR;
  return Math.min(MAX_MMI, Math.max(MIN_MMI, mmi));
}

/**
 * Epicentral radius (km) out to which estimated MMI stays at or above
 * `targetMmi`. 0 if even the epicentre doesn't reach it. MMI falls
 * monotonically with distance, so a bisection is enough.
 */
export function radiusForMmi(mag: number, depthKm: number, targetMmi: number, maxKm = 3000): number {
  if (estimateMmi(mag, 0, depthKm) < targetMmi) return 0;
  if (estimateMmi(mag, maxKm, depthKm) >= targetMmi) return maxKm;
  let lo = 0;
  let hi = maxKm;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (estimateMmi(mag, mid, depthKm) >= targetMmi) lo = mid;
    else hi = mid;
  }
  return lo;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Roman numeral for an MMI value (rounded to the nearest whole level). */
export function mmiRoman(mmi: number): string {
  return ROMAN[Math.min(9, Math.max(0, Math.round(mmi) - 1))];
}

/** USGS's perceived-shaking wording for an MMI level. */
export function mmiShaking(mmi: number): string {
  const level = Math.round(mmi);
  if (level <= 1) return 'Not felt';
  if (level <= 3) return 'Weak';
  if (level === 4) return 'Light';
  if (level === 5) return 'Moderate';
  if (level === 6) return 'Strong';
  if (level === 7) return 'Very strong';
  if (level === 8) return 'Severe';
  if (level === 9) return 'Violent';
  return 'Extreme';
}

/** USGS's potential-damage wording for an MMI level. */
export function mmiDamage(mmi: number): string {
  const level = Math.round(mmi);
  if (level <= 4) return 'None';
  if (level === 5) return 'Very light';
  if (level === 6) return 'Light';
  if (level === 7) return 'Moderate';
  if (level === 8) return 'Moderate/heavy';
  if (level === 9) return 'Heavy';
  return 'Very heavy';
}

/** The MMI levels drawn as shaking contours on the map. */
export const CONTOUR_LEVELS = [4, 5, 6, 7, 8] as const;
