import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, estimateShakingIntensity, computeDamage, computeImpact } from '../src/lib/damageModel.js';

describe('haversineDistanceKm', () => {
  it('is zero for the same point', () => {
    expect(haversineDistanceKm(37.7749, -122.4194, 37.7749, -122.4194)).toBeCloseTo(0, 5);
  });

  it('matches a known real-world distance (San Francisco to Los Angeles, ~559km)', () => {
    const d = haversineDistanceKm(37.7749, -122.4194, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(530);
    expect(d).toBeLessThan(590);
  });

  it('is symmetric', () => {
    const a = haversineDistanceKm(35.6762, 139.6503, 41.0082, 28.9784);
    const b = haversineDistanceKm(41.0082, 28.9784, 35.6762, 139.6503);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('estimateShakingIntensity', () => {
  it('increases with magnitude at a fixed distance/depth', () => {
    const low = estimateShakingIntensity({ magnitude: 5, depthKm: 10, distanceKm: 50 });
    const high = estimateShakingIntensity({ magnitude: 7, depthKm: 10, distanceKm: 50 });
    expect(high).toBeGreaterThan(low);
  });

  it('decreases with distance at a fixed magnitude/depth', () => {
    const near = estimateShakingIntensity({ magnitude: 7, depthKm: 10, distanceKm: 10 });
    const far = estimateShakingIntensity({ magnitude: 7, depthKm: 10, distanceKm: 1000 });
    expect(near).toBeGreaterThan(far);
  });

  it('decreases with depth at a fixed magnitude/distance', () => {
    const shallow = estimateShakingIntensity({ magnitude: 7, depthKm: 5, distanceKm: 20 });
    const deep = estimateShakingIntensity({ magnitude: 7, depthKm: 400, distanceKm: 20 });
    expect(shallow).toBeGreaterThan(deep);
  });

  it('clamps to the 0..12 MMI-like range', () => {
    expect(estimateShakingIntensity({ magnitude: 9.5, depthKm: 1, distanceKm: 0 })).toBeLessThanOrEqual(12);
    expect(estimateShakingIntensity({ magnitude: 1, depthKm: 700, distanceKm: 20000 })).toBeGreaterThanOrEqual(0);
  });
});

describe('computeDamage', () => {
  it('equals full intensity at zero resilience', () => {
    expect(computeDamage(8, 0)).toBeCloseTo(8, 10);
  });

  it('is reduced, but never zero, at maximum resilience', () => {
    const damage = computeDamage(8, 100);
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeCloseTo(8 * 0.1, 10);
  });

  it('is monotonically non-increasing as resilience rises', () => {
    const d0 = computeDamage(10, 0);
    const d50 = computeDamage(10, 50);
    const d100 = computeDamage(10, 100);
    expect(d0).toBeGreaterThanOrEqual(d50);
    expect(d50).toBeGreaterThanOrEqual(d100);
  });

  it('never exceeds the input intensity and never goes negative', () => {
    expect(computeDamage(6, -50)).toBeLessThanOrEqual(6);
    expect(computeDamage(6, 500)).toBeGreaterThanOrEqual(0);
  });
});

describe('computeImpact', () => {
  it('combines distance, intensity, and damage consistently', () => {
    const impact = computeImpact({
      siteLat: 35.6762,
      siteLon: 139.6503,
      siteResilience: 40,
      quakeLat: 35.7,
      quakeLon: 139.7,
      magnitude: 6.5,
      depthKm: 30,
    });
    expect(impact.distanceKm).toBeGreaterThan(0);
    expect(impact.intensity).toBeGreaterThan(0);
    expect(impact.damage).toBeLessThanOrEqual(impact.intensity);
  });
});
