import { describe, it, expect } from 'vitest';
import { CITIES, cityImpacts, nearestCity } from './cities';

describe('cities', () => {
  it('ships a sensible bundled list', () => {
    expect(CITIES.length).toBeGreaterThan(500);
    expect(CITIES.some((c) => c.name === 'Tokyo')).toBe(true);
  });

  it('ranks the closest big city as most strongly shaken', () => {
    const impacts = cityImpacts(139.7, 35.6, 6.5, 30);
    expect(impacts[0].name).toBe('Tokyo');
    expect(impacts[0].mmi).toBeGreaterThan(5);
  });

  it('still returns the nearest city for a remote mid-ocean event', () => {
    const impacts = cityImpacts(-30, -40, 5, 10, 6, 500);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].distanceKm).toBeGreaterThan(500);
  });

  it('labels a location by its nearest city', () => {
    expect(nearestCity(2.35, 48.86)?.name).toBe('Paris');
  });
});
