import { describe, it, expect } from 'vitest';
import { lonLatToXYZ, xyzToLonLat, depthRadius, markerSize, DEPTH_EXAGGERATION } from './math';

describe('globe math', () => {
  it('places reference points on the unit sphere', () => {
    expect(lonLatToXYZ(0, 0)).toEqual([0, 0, 1]);
    const np = lonLatToXYZ(0, 90);
    expect(np[1]).toBeCloseTo(1);
    const east = lonLatToXYZ(90, 0);
    expect(east[0]).toBeCloseTo(1);
    expect(east[2]).toBeCloseTo(0);
  });
  it('round-trips lon/lat', () => {
    for (const [lon, lat] of [[139.7, 35.7], [-72.5, -36], [179, -18], [0, 0]]) {
      const [x, y, z] = lonLatToXYZ(lon, lat, 0.8);
      const [lo, la] = xyzToLonLat(x, y, z);
      expect(lo).toBeCloseTo(lon, 6);
      expect(la).toBeCloseTo(lat, 6);
    }
  });
  it('draws deep events deeper, exaggerated, and never through the centre', () => {
    expect(depthRadius(0)).toBe(1);
    expect(depthRadius(700)).toBeCloseTo(1 - (700 * DEPTH_EXAGGERATION) / 6371, 9);
    expect(depthRadius(700)).toBeLessThan(depthRadius(100));
    expect(depthRadius(1e6)).toBe(0.05);
    expect(depthRadius(-5)).toBe(1);
  });
  it('markers grow with magnitude', () => {
    expect(markerSize(7)).toBeGreaterThan(markerSize(5));
    expect(markerSize(-1)).toBe(markerSize(0));
  });
});
