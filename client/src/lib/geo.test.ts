import { describe, it, expect } from 'vitest';
import { haversineKm, bearingDeg, compassPoint, pointInRing } from './geo';

describe('geo', () => {
  it('haversine: London to Paris is ~344 km', () => {
    expect(haversineKm(-0.1278, 51.5074, 2.3522, 48.8566)).toBeCloseTo(344, -1);
  });
  it('haversine is symmetric and zero at the same point', () => {
    expect(haversineKm(10, 10, 10, 10)).toBe(0);
    expect(haversineKm(1, 2, 3, 4)).toBeCloseTo(haversineKm(3, 4, 1, 2), 9);
  });
  it('bearing: due east along the equator is 90', () => {
    expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(90, 6);
    expect(bearingDeg(0, 0, 0, -10)).toBeCloseTo(180, 6);
  });
  it('compass points round to the nearest of 16', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(22.5)).toBe('NNE');
    expect(compassPoint(225)).toBe('SW');
  });
});

describe('pointInRing', () => {
  const square: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  it('detects inside and outside', () => {
    expect(pointInRing(0.5, 0.5, square)).toBe(true);
    expect(pointInRing(1.5, 0.5, square)).toBe(false);
    expect(pointInRing(-0.1, 0.5, square)).toBe(false);
  });
});
