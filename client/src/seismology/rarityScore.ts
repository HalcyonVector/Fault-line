import { depthBand } from './energyMapping';

// Objective statistical-rarity scoring for the global intelligence log: a
// rough Gutenberg-Richter-style magnitude multiplier (bigger events are
// exponentially rarer) combined with a depth-band rarity multiplier (most
// earthquakes are shallow; deep events are statistically anomalous). Both
// halves are grounded in real global catalog statistics, kept deliberately
// simple; see the README's Honest Limitations.

const B_VALUE = 1.0; // Gutenberg-Richter b-value, typical global average
const REFERENCE_MAGNITUDE = 4.5; // "unremarkable, routinely-observed" baseline

// Rough global proportions of earthquakes by USGS depth band (shallow <70km,
// intermediate 70-300km, deep >300km), approximate figures from published
// global catalog summaries, not a precise calibration.
const DEPTH_BAND_FREQUENCY: Record<ReturnType<typeof depthBand>, number> = {
  shallow: 0.75,
  intermediate: 0.2,
  deep: 0.05,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** How many times rarer (or commoner) a quake of this magnitude is vs. the reference magnitude, per Gutenberg-Richter. */
export function magnitudeRarityMultiplier(
  magnitude: number,
  referenceMagnitude: number = REFERENCE_MAGNITUDE,
  bValue: number = B_VALUE,
): number {
  return Math.pow(10, bValue * (magnitude - referenceMagnitude));
}

/** How many times rarer this quake's depth band is vs. shallow (the most common band). */
export function depthRarityMultiplier(depthKm: number): number {
  return 1 / DEPTH_BAND_FREQUENCY[depthBand(depthKm)];
}

export type RarityTier = 'common' | 'notable' | 'rare' | 'extraordinary' | 'historic';

/** Bounded 0..99 rarity score: higher means objectively rarer (bigger and/or anomalously deep). */
export function rarityScore(magnitude: number, depthKm: number): number {
  const raw = magnitudeRarityMultiplier(magnitude) * depthRarityMultiplier(depthKm);
  return clamp(Math.round(20 * Math.log10(raw + 1)), 0, 99);
}

/** A human-readable tier label bucketing the numeric score. */
export function rarityTier(score: number): RarityTier {
  if (score < 20) return 'common';
  if (score < 40) return 'notable';
  if (score < 60) return 'rare';
  if (score < 80) return 'extraordinary';
  return 'historic';
}
