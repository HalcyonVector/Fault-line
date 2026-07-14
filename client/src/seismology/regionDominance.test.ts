import { describe, it, expect } from 'vitest';
import { accumulateRegionEnergy, dominantRegion, type RegionQuakeEvent } from './regionDominance';

const HOUR = 60 * 60 * 1000;

describe('accumulateRegionEnergy', () => {
  it('tracks each region independently', () => {
    const events: RegionQuakeEvent[] = [
      { region: 'ring-of-fire', magnitude: 6, timeMs: 0 },
      { region: 'mid-atlantic-ridge', magnitude: 3, timeMs: 0 },
    ];
    const energy = accumulateRegionEnergy(events, 0);
    expect(energy['ring-of-fire']).toBeGreaterThan(energy['mid-atlantic-ridge']);
    expect(energy['alpide-belt']).toBe(0);
    expect(energy['intraplate-other']).toBe(0);
  });

  it('decays a region toward zero once its activity stops', () => {
    const events: RegionQuakeEvent[] = [{ region: 'alpide-belt', magnitude: 6, timeMs: 0 }];
    const soon = accumulateRegionEnergy(events, 10 * 60 * 1000);
    const muchLater = accumulateRegionEnergy(events, 24 * HOUR);
    expect(muchLater['alpide-belt']).toBeLessThan(soon['alpide-belt']);
  });
});

describe('dominantRegion', () => {
  it('picks the region with the most decayed energy', () => {
    const events: RegionQuakeEvent[] = [
      { region: 'ring-of-fire', magnitude: 6.5, timeMs: 0 },
      { region: 'mid-atlantic-ridge', magnitude: 4, timeMs: 0 },
    ];
    const energy = accumulateRegionEnergy(events, 0);
    expect(dominantRegion(energy)).toBe('ring-of-fire');
  });

  it('returns null when every region is silent', () => {
    const energy = accumulateRegionEnergy([], 0);
    expect(dominantRegion(energy)).toBeNull();
  });

  it('switches dominance when a different region becomes louder', () => {
    const events: RegionQuakeEvent[] = [
      { region: 'ring-of-fire', magnitude: 5, timeMs: 0 },
      { region: 'mid-atlantic-ridge', magnitude: 7, timeMs: HOUR },
    ];
    const early = accumulateRegionEnergy(events, 0);
    const later = accumulateRegionEnergy(events, HOUR);
    expect(dominantRegion(early)).toBe('ring-of-fire');
    expect(dominantRegion(later)).toBe('mid-atlantic-ridge');
  });
});
