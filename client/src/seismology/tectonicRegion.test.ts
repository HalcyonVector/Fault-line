import { describe, it, expect } from 'vitest';
import { classifyTectonicRegion } from './tectonicRegion';

describe('classifyTectonicRegion', () => {
  it('classifies Tokyo, Japan as Ring of Fire', () => {
    expect(classifyTectonicRegion(139.69, 35.69)).toBe('ring-of-fire');
  });

  it('classifies Ridgecrest, California as Ring of Fire', () => {
    expect(classifyTectonicRegion(-117.67, 35.77)).toBe('ring-of-fire');
  });

  it('classifies Reykjavik, Iceland as Mid-Atlantic Ridge', () => {
    expect(classifyTectonicRegion(-21.9, 64.15)).toBe('mid-atlantic-ridge');
  });

  it('classifies a mid-continental US point (Wichita, Kansas) as intraplate/other', () => {
    expect(classifyTectonicRegion(-97.34, 37.68)).toBe('intraplate-other');
  });

  it('classifies Istanbul, Turkey (on the Alpide belt) as alpide-belt', () => {
    expect(classifyTectonicRegion(28.98, 41.01)).toBe('alpide-belt');
  });

  it('always returns one of the four known region labels', () => {
    const points: [number, number][] = [
      [0, 0],
      [180, -90],
      [-180, 90],
      [77.2, 28.6], // New Delhi
      [151.2, -33.9], // Sydney
    ];
    const known = new Set(['ring-of-fire', 'alpide-belt', 'mid-atlantic-ridge', 'intraplate-other']);
    for (const [lon, lat] of points) {
      expect(known.has(classifyTectonicRegion(lon, lat))).toBe(true);
    }
  });
});
