import { magnitudeToEnergy, decayEnergy } from './energyMapping';

export interface QuakeEvent {
  magnitude: number;
  timeMs: number;
}

// Chosen so a single M5.5-ish quake (or an equivalent cluster of smaller
// ones) noticeably lifts the index, while a genuinely major swarm pushes it
// toward the 1.0 ceiling. This is a stylized "restlessness" scale, not a
// seismological hazard metric; see the README's Honest Limitations.
const REFERENCE_ENERGY = magnitudeToEnergy(5.5) * 1.1;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Soft-saturating normalization: energy -> 0..1, approaching (never reaching) 1 as energy grows without bound. */
export function normalizeUnrest(energy: number): number {
  if (energy <= 0) return 0;
  return clamp01(1 - Math.exp(-energy / REFERENCE_ENERGY));
}

/**
 * Folds a chronological list of quake events into a single decayed energy
 * total as of `atMs`, applying the exponential half-life between each event
 * (and from the last event up to `atMs`) rather than just summing raw
 * energies. This is what gives the index real temporal memory: it builds up
 * during a swarm and cools back down afterward instead of reacting only to
 * an instantaneous snapshot. Events after `atMs` are ignored; events do not
 * need to be pre-sorted.
 */
export function accumulateUnrestEnergy(events: QuakeEvent[], atMs: number): number {
  const relevant = events.filter((e) => e.timeMs <= atMs).sort((a, b) => a.timeMs - b.timeMs);

  let energy = 0;
  let lastMs: number | null = null;
  for (const event of relevant) {
    if (lastMs !== null) energy = decayEnergy(energy, event.timeMs - lastMs);
    energy += magnitudeToEnergy(event.magnitude);
    lastMs = event.timeMs;
  }
  if (lastMs !== null) energy = decayEnergy(energy, atMs - lastMs);
  return energy;
}

/** The rolling 0..1 unrest index at time `atMs`, given the full event history so far. */
export function unrestIndex(events: QuakeEvent[], atMs: number): number {
  return normalizeUnrest(accumulateUnrestEnergy(events, atMs));
}
