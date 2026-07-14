import type { TectonicRegion } from '../types';
import { magnitudeToEnergy, decayEnergy } from './energyMapping';

export interface RegionQuakeEvent {
  region: TectonicRegion;
  magnitude: number;
  timeMs: number;
}

const REGIONS: TectonicRegion[] = ['ring-of-fire', 'alpide-belt', 'mid-atlantic-ridge', 'intraplate-other'];

function emptyEnergyMap(): Record<TectonicRegion, number> {
  return { 'ring-of-fire': 0, 'alpide-belt': 0, 'mid-atlantic-ridge': 0, 'intraplate-other': 0 };
}

/**
 * Same decayed-energy-accumulation idea as the global unrest index, but kept
 * separately per tectonic province, so "which region has been loudest
 * lately" is its own rolling, decaying signal rather than a single global
 * snapshot. Feeds the drone's harmonic-color steering.
 */
export function accumulateRegionEnergy(events: RegionQuakeEvent[], atMs: number): Record<TectonicRegion, number> {
  const energy = emptyEnergyMap();
  const lastMs: Record<TectonicRegion, number | null> = {
    'ring-of-fire': null,
    'alpide-belt': null,
    'mid-atlantic-ridge': null,
    'intraplate-other': null,
  };

  const relevant = events.filter((e) => e.timeMs <= atMs).sort((a, b) => a.timeMs - b.timeMs);
  for (const event of relevant) {
    const prev = lastMs[event.region];
    if (prev !== null) energy[event.region] = decayEnergy(energy[event.region], event.timeMs - prev);
    energy[event.region] += magnitudeToEnergy(event.magnitude);
    lastMs[event.region] = event.timeMs;
  }

  for (const region of REGIONS) {
    const prev = lastMs[region];
    if (prev !== null) energy[region] = decayEnergy(energy[region], atMs - prev);
  }

  return energy;
}

/** The region with the highest current decayed energy, or null if every region is silent. */
export function dominantRegion(energy: Record<TectonicRegion, number>): TectonicRegion | null {
  let best: TectonicRegion | null = null;
  let bestValue = 0;
  for (const region of REGIONS) {
    if (energy[region] > bestValue) {
      bestValue = energy[region];
      best = region;
    }
  }
  return best;
}
