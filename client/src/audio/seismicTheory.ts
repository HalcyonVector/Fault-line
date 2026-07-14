import type { TectonicRegion } from '../types';

/**
 * Semitone intervals (from a shared low drone root) available to the drone
 * layers at a given unrest level. Near 0 this stays open and consonant
 * (fifths, octaves); as unrest climbs toward 1, minor seconds and tritones
 * creep in, exactly the "quiet on a calm day, dense and dissonant during a
 * swarm" character the drone is meant to have. Ordered darkest-interval-last
 * so callers can slice the first N for a given layerCount and still read
 * "more layers = more of the tense stuff" naturally.
 */
export function intervalPaletteForUnrest(unrest: number): number[] {
  if (unrest < 0.25) return [0, 12, 7, 19]; // root, octave, fifth, fifth+octave — open and calm
  if (unrest < 0.5) return [0, 7, 12, 5]; // add a fourth: a little more color, still consonant
  if (unrest < 0.75) return [0, 7, 12, 6]; // a tritone creeps in alongside the fifth
  return [0, 6, 7, 1]; // tritone + minor second cluster: maximally tense
}

export interface RegionColor {
  overtoneColor: number; // 0..1, metallic FM-ish overtone amount
  warmth: number; // 0..1, lower = colder/sparser
}

/**
 * How strongly the currently-dominant tectonic region should tint the
 * drone's timbre: a Ring-of-Fire-dominant period leans metallic and tense,
 * a Mid-Atlantic-Ridge-dominant period stays comparatively warm and simple,
 * scaled further by how unsettled things are overall.
 */
export function regionColorFor(region: TectonicRegion | null, unrest: number): RegionColor {
  switch (region) {
    case 'ring-of-fire':
      return { overtoneColor: clamp(0.45 + unrest * 0.55), warmth: clamp(0.35 - unrest * 0.2) };
    case 'alpide-belt':
      return { overtoneColor: clamp(0.3 + unrest * 0.45), warmth: clamp(0.45 - unrest * 0.15) };
    case 'mid-atlantic-ridge':
      return { overtoneColor: clamp(0.1 + unrest * 0.25), warmth: clamp(0.7 - unrest * 0.1) };
    case 'intraplate-other':
    default:
      return { overtoneColor: clamp(0.15 + unrest * 0.2), warmth: clamp(0.55 - unrest * 0.1) };
  }
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}
