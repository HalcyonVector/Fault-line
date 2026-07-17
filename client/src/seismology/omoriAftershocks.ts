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
// is a reasonable textbook default, not fit to any specific real aftershock
// sequence (a live decision window is only ~75 real seconds long, nowhere
// near enough of an actual sequence to fit K against; USGS's own generic
// aftershock model makes the same call for the same reason, before enough
// sequence-specific data exists). The b-value is different: `estimateBValue`
// below is a genuine, standard estimator (Aki 1965's maximum-likelihood
// method, with Utsu's 1965 half-bin correction for magnitude binning) fit
// live against whatever quakes are actually streaming in through the global
// feed right now, not a fixed constant. See the README's Honest Limitations
// for what's still illustrative here.

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

const MIN_SAMPLE_SIZE_FOR_B_VALUE = 30;
const MAGNITUDE_BIN_WIDTH = 0.1; // USGS catalog magnitudes are reported to this precision
const MIN_B_VALUE = 0.4;
const MAX_B_VALUE = 2.0;

/**
 * Aki's (1965) maximum-likelihood b-value estimator, with Utsu's (1965)
 * half-bin correction for magnitude binning: b = log10(e) / (mean(M) - (Mc -
 * deltaM/2)), fit against whatever magnitudes are passed in at/above the
 * completeness threshold `magnitudeOfCompleteness`. This is the standard,
 * textbook method (not a fixed constant): it genuinely reflects the shape of
 * whatever catalog you hand it, which is why it's fit live against the real
 * global feed rather than baked in as a number.
 *
 * Returns `null` when there isn't enough data to trust the estimate (fewer
 * than `MIN_SAMPLE_SIZE_FOR_B_VALUE` qualifying events, or a degenerate
 * catalog where every magnitude is identical) — callers should fall back to
 * `DEFAULT_B_VALUE` in that case, the same way a real seismologist falls
 * back to a regional/global average before a local catalog is large enough
 * to fit reliably. The result is also clamped to a real-world-plausible
 * range: an estimate outside roughly 0.4-2.0 is far more likely to indicate
 * a still-too-small or still-incomplete sample than an actual b-value that
 * extreme.
 */
export function estimateBValue(magnitudes: number[], magnitudeOfCompleteness: number = REFERENCE_MAGNITUDE): number | null {
  const qualifying = magnitudes.filter((m) => Number.isFinite(m) && m >= magnitudeOfCompleteness);
  if (qualifying.length < MIN_SAMPLE_SIZE_FOR_B_VALUE) return null;

  // A catalog with zero actual spread (every qualifying event at the exact
  // same magnitude) has no slope to estimate a b-value from at all. Checking
  // this directly, rather than only via `spread <= 0` below, matters because
  // the Utsu half-bin correction shifts the effective completeness threshold
  // slightly *below* the raw one, which can make a perfectly flat catalog's
  // corrected spread come out as a small positive number instead of ~0 —
  // technically "not degenerate" by that check alone, but still meaningless.
  if (qualifying.every((m) => m === qualifying[0])) return null;

  const meanMagnitude = qualifying.reduce((sum, m) => sum + m, 0) / qualifying.length;
  const correctedMc = magnitudeOfCompleteness - MAGNITUDE_BIN_WIDTH / 2;
  const spread = meanMagnitude - correctedMc;
  if (spread <= 0) return null;

  const b = Math.LOG10E / spread;
  if (!Number.isFinite(b)) return null;
  return clamp(b, MIN_B_VALUE, MAX_B_VALUE);
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
