function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t);
}

/**
 * Standard seismic-moment-adjacent energy scaling: energy grows roughly an
 * order of magnitude for every ~0.67 units of magnitude, so a swarm of small
 * quakes barely moves the needle while a single large quake dominates,
 * unlike a naive linear-in-magnitude scale, which would flatten that
 * difference out. Shared by the unrest accumulator and per-region tracking.
 */
export function magnitudeToEnergy(magnitude: number): number {
  return Math.pow(10, 1.5 * magnitude);
}

const HALF_LIFE_MS = 2 * 60 * 60 * 1000; // ~2 hours
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_MS;

/** Exponential decay of an accumulated energy value over `elapsedMs`. Never negative, never grows. */
export function decayEnergy(energy: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return energy;
  return energy * Math.exp(-DECAY_LAMBDA * elapsedMs);
}

const MIN_TRIGGER_MAGNITUDE = 2.5;
const MAX_TRIGGER_MAGNITUDE = 9;

/**
 * Magnitude -> per-event trigger amplitude, in 0..1. Derived from the same
 * energy formula (so it's still monotonic in the physically-motivated
 * sense) but compressed logarithmically before normalizing, the way
 * perceived loudness compresses physical amplitude: otherwise a M4.5
 * "default threshold" quake would sit at a small fraction of a percent of
 * full scale next to a M9. Clamped so nothing above M9 clips past 1, and
 * floored so even a minimum-threshold M2.5 stays above zero.
 */
export function magnitudeToAmplitude(
  magnitude: number,
  minMagnitude = MIN_TRIGGER_MAGNITUDE,
  maxMagnitude = MAX_TRIGGER_MAGNITUDE,
): number {
  const minLog = Math.log10(magnitudeToEnergy(minMagnitude));
  const maxLog = Math.log10(magnitudeToEnergy(maxMagnitude));
  const log = Math.log10(magnitudeToEnergy(magnitude));
  const t = (log - minLog) / (maxLog - minLog);
  return clamp(t, 0.05, 1);
}

const SHALLOW_REFERENCE_KM = 70; // USGS's own shallow/intermediate boundary

/**
 * 1 = shallow (bright), fading toward 0 as depth grows. Physically motivated:
 * higher frequencies attenuate faster than low frequencies over a longer
 * path through the earth, so a deep quake should sound duller, not just
 * arbitrarily different.
 */
export function depthToBrightness(depthKm: number): number {
  const d = Math.max(0, depthKm);
  return clamp(1 / (1 + d / SHALLOW_REFERENCE_KM));
}

/** Depth -> lowpass filter cutoff for the trigger's "crack"/"thud" timbre. */
export function depthToFilterCutoffHz(depthKm: number): number {
  const brightness = depthToBrightness(depthKm);
  return lerp(150, 8000, brightness);
}

/** Depth -> envelope shape: shallow = fast sharp transient, deep = slow muffled thud. */
export function depthToEnvelope(depthKm: number): { attack: number; decay: number } {
  const brightness = depthToBrightness(depthKm);
  return {
    attack: lerp(0.35, 0.004, brightness),
    decay: lerp(3.2, 0.25, brightness),
  };
}

export type DepthBand = 'shallow' | 'intermediate' | 'deep';

export function depthBand(depthKm: number): DepthBand {
  if (depthKm < 70) return 'shallow';
  if (depthKm <= 300) return 'intermediate';
  return 'deep';
}
