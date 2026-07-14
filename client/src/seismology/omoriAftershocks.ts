import type { AftershockPulse } from '../types';

// Omori-Utsu aftershock decay law: rate(t) = K / (t + c)^p. p ~= 1.0 is the
// classic Omori value; c is a small time offset that keeps the rate finite
// right after the mainshock instead of diverging at t=0.
const P = 1.0;
const C_HOURS = 0.05;

const MIN_MAGNITUDE_FOR_AFTERSHOCKS = 6;
const MIN_SIG_FOR_AFTERSHOCKS = 600;

const REAL_WINDOW_HOURS = 6; // real aftershock decay hours we model
const AUDIO_WINDOW_MS = 30_000; // compressed onto ~30s of audio
const MAX_PULSE_AMPLITUDE = 0.3; // these are quiet "aftermath tension" echoes, never as loud as the main onset

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Instantaneous aftershock rate at `tHours` after the mainshock, per the Omori-Utsu law. */
export function omoriRate(tHours: number, K: number, c = C_HOURS, p = P): number {
  return K / Math.pow(tHours + c, p);
}

/**
 * Aftershock "productivity" scaling: bigger mainshocks produce measurably
 * more aftershocks. Normalized to 1 at the M6 significance floor.
 */
export function aftershockProductivity(magnitude: number): number {
  return Math.pow(10, 0.4 * (magnitude - MIN_MAGNITUDE_FOR_AFTERSHOCKS));
}

export interface AftershockTrainOptions {
  numPulses?: number;
  realWindowHours?: number;
  audioWindowMs?: number;
}

/**
 * Generates a decaying train of quiet echo pulses for a significant quake
 * (mag >= 6, or high `sig`), following the real Omori-Utsu decay shape but
 * compressed onto an audio timescale: several real hours of aftershock
 * decay become roughly 20-40 seconds of echoes after the main P/S onset.
 * Returns an empty array for quakes that don't meet the significance bar —
 * most quakes are just a plain P/S onset with no aftermath tail.
 */
export function generateAftershockTrain(
  magnitude: number,
  sig = 0,
  options: AftershockTrainOptions = {},
): AftershockPulse[] {
  const significant = magnitude >= MIN_MAGNITUDE_FOR_AFTERSHOCKS || sig >= MIN_SIG_FOR_AFTERSHOCKS;
  if (!significant) return [];

  const realWindowHours = options.realWindowHours ?? REAL_WINDOW_HOURS;
  const audioWindowMs = options.audioWindowMs ?? AUDIO_WINDOW_MS;
  // Bigger mainshocks get both a denser train (more pulses) and a louder
  // ceiling on those pulses — productivity (K) alone would only reshape
  // *when* pulses land, not how many or how loud, since K cancels out of
  // the rate ratio used to normalize each pulse's amplitude.
  const numPulses =
    options.numPulses ?? clamp(Math.round(8 + (magnitude - MIN_MAGNITUDE_FOR_AFTERSHOCKS) * 4), 6, 24);
  const maxAmplitude = clamp(
    0.12 + (magnitude - MIN_MAGNITUDE_FOR_AFTERSHOCKS) * 0.025,
    0.12,
    MAX_PULSE_AMPLITUDE,
  );
  if (numPulses < 2) return [];

  const K = aftershockProductivity(magnitude) * 1.2;
  const tMinHours = C_HOURS;
  const rateAtStart = omoriRate(tMinHours, K);

  const pulses: AftershockPulse[] = [];
  for (let i = 0; i < numPulses; i++) {
    const frac = i / (numPulses - 1);
    // Log-spaced sample points: Omori decay is steepest right after the
    // mainshock, so pulses cluster there and thin out toward the tail,
    // matching the real shape instead of landing at even audio-time steps.
    const tHours = tMinHours * Math.pow(realWindowHours / tMinHours, frac);
    const rate = omoriRate(tHours, K);
    const amplitude = clamp((rate / rateAtStart) * maxAmplitude, 0, maxAmplitude);
    const delayMs = (tHours / realWindowHours) * audioWindowMs;
    pulses.push({ delayMs, amplitude });
  }
  return pulses;
}
