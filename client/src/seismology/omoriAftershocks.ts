// Repurposed from the old audio build's "Omori-law aftershock echo train"
// generator (which scheduled quiet audio pulses) into a real probability
// forecast for the aftershock decision window. The core Omori-Utsu decay law
// (`omoriRate`) is unchanged: it's the same real law, just consumed
// differently: instead of scheduling sounds, its integral over a forecast
// horizon becomes an expected aftershock count, which is combined with the
// Gutenberg-Richter magnitude-frequency relation (a simplified
// Reasenberg-Jones-style combination) to estimate the probability that at
// least one *damaging* aftershock lands in that horizon.
//
// This is illustrative, not a real forecast: the productivity constant (K)
// and b-value below are reasonable textbook defaults, not fit to any
// specific real aftershock sequence; see the README's Honest Limitations.

// Omori-Utsu aftershock decay law: rate(t) = K / (t + c)^p. p ~= 1.0 is the
// classic Omori value; c is a small time offset that keeps the rate finite
// right at the mainshock instead of diverging at t=0.
const P = 1.0;
const C_HOURS = 0.05; // ~3 minutes; real early-aftershock catalogs are often incomplete before this

const MIN_MAGNITUDE_FOR_WINDOW = 6;
const MIN_SIG_FOR_WINDOW = 600;

// The productivity (K) estimate is calibrated as "aftershocks at/above this
// magnitude, per hour, at t=c" for a magnitude-6 mainshock, a reasonable
// illustrative order of magnitude, not fit to a specific sequence.
const REFERENCE_MAGNITUDE = 2.5;
const BASE_K_AT_M6 = 5;

// Gutenberg-Richter b-value: log10(N(>=M)) = a - b*M. 1.0 is the typical
// global average; regional b-values vary (0.7-1.3 is a common real range).
const DEFAULT_B_VALUE = 1.0;

// What counts as a "damaging" aftershock for this forecast.
const DEFAULT_DANGEROUS_MAGNITUDE = 5.0;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** True when a mainshock is significant enough to open an aftershock decision window (mag>=6, or high USGS `sig`). */
export function isSignificantMainshock(magnitude: number, sig = 0): boolean {
  return magnitude >= MIN_MAGNITUDE_FOR_WINDOW || sig >= MIN_SIG_FOR_WINDOW;
}

/** Instantaneous aftershock rate (events/hour, at/above the reference magnitude) at `tHours` after the mainshock, per the Omori-Utsu law. */
export function omoriRate(tHours: number, K: number, c = C_HOURS, p = P): number {
  return K / Math.pow(Math.max(0, tHours) + c, p);
}

/**
 * Aftershock-zone productivity (K): bigger mainshocks produce measurably
 * more aftershocks. Normalized so a magnitude-6 mainshock gives `BASE_K_AT_M6`.
 */
export function aftershockProductivityK(mainshockMagnitude: number): number {
  return BASE_K_AT_M6 * Math.pow(10, 0.4 * (mainshockMagnitude - MIN_MAGNITUDE_FOR_WINDOW));
}

/**
 * Expected number of aftershocks (at/above the reference magnitude)
 * occurring between `tStartHours` and `tEndHours` after the mainshock: the
 * closed-form integral of the Omori-Utsu rate over that window.
 */
export function expectedAftershockCount(
  mainshockMagnitude: number,
  tStartHours: number,
  tEndHours: number,
  c = C_HOURS,
  p = P,
): number {
  const K = aftershockProductivityK(mainshockMagnitude);
  const start = Math.max(0, tStartHours) + c;
  const end = Math.max(start, tEndHours + c);
  if (Math.abs(p - 1) < 1e-9) {
    return K * Math.log(end / start);
  }
  return (K / (1 - p)) * (Math.pow(end, 1 - p) - Math.pow(start, 1 - p));
}

/**
 * Gutenberg-Richter exceedance fraction: what fraction of aftershocks at/above
 * `referenceMagnitude` are themselves at/above `thresholdMagnitude`. Clamped
 * to 1 (a threshold at or below the reference can't be "more than all of them").
 */
export function gutenbergRichterExceedanceFraction(
  thresholdMagnitude: number,
  referenceMagnitude: number = REFERENCE_MAGNITUDE,
  bValue: number = DEFAULT_B_VALUE,
): number {
  return clamp(Math.pow(10, -bValue * (thresholdMagnitude - referenceMagnitude)), 0, 1);
}

export interface DamagingAftershockOptions {
  dangerousMagnitude?: number;
  referenceMagnitude?: number;
  bValue?: number;
}

/**
 * Probability of at least one damaging aftershock (>= `dangerousMagnitude`,
 * default M5.0) occurring between `tStartHours` and `tEndHours` after the
 * mainshock, treating aftershocks as a Poisson process (the standard
 * assumption behind real Reasenberg-Jones-style aftershock forecasts): a
 * simplified combination of the real Omori-Utsu temporal decay and the real
 * Gutenberg-Richter magnitude-frequency relation.
 */
export function damagingAftershockProbability(
  mainshockMagnitude: number,
  tStartHours: number,
  tEndHours: number,
  options: DamagingAftershockOptions = {},
): number {
  const referenceMagnitude = options.referenceMagnitude ?? REFERENCE_MAGNITUDE;
  const dangerousMagnitude = options.dangerousMagnitude ?? DEFAULT_DANGEROUS_MAGNITUDE;
  const bValue = options.bValue ?? DEFAULT_B_VALUE;

  const expectedTotal = expectedAftershockCount(mainshockMagnitude, tStartHours, tEndHours);
  const fraction = gutenbergRichterExceedanceFraction(dangerousMagnitude, referenceMagnitude, bValue);
  const expectedDamaging = expectedTotal * fraction;
  return clamp(1 - Math.exp(-expectedDamaging), 0, 1);
}

export const OMORI_CONSTANTS = {
  P,
  C_HOURS,
  MIN_MAGNITUDE_FOR_WINDOW,
  MIN_SIG_FOR_WINDOW,
  REFERENCE_MAGNITUDE,
  DEFAULT_B_VALUE,
  DEFAULT_DANGEROUS_MAGNITUDE,
};
