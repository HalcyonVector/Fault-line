import { describe, it, expect } from 'vitest';
import { estimateMmi, radiusForMmi, mmiRoman, mmiShaking, mmiDamage } from './intensity';

describe('estimateMmi (Atkinson & Wald 2007, California coefficients)', () => {
  it('gives plausible near-source intensities', () => {
    // A shallow M6 felt at ~10 km is typically VII-ish.
    expect(estimateMmi(6, 10, 10)).toBeGreaterThan(6.5);
    expect(estimateMmi(6, 10, 10)).toBeLessThan(8);
    // A small M3 a few km away is weak-to-light.
    expect(estimateMmi(3, 5, 5)).toBeGreaterThan(2.5);
    expect(estimateMmi(3, 5, 5)).toBeLessThan(5);
  });

  it('falls with distance and rises with magnitude', () => {
    expect(estimateMmi(6, 50, 10)).toBeLessThan(estimateMmi(6, 10, 10));
    expect(estimateMmi(7, 50, 10)).toBeGreaterThan(estimateMmi(6, 50, 10));
  });

  it('deep events shake the surface less', () => {
    expect(estimateMmi(6.5, 0, 400)).toBeLessThan(estimateMmi(6.5, 0, 15));
  });

  it('clamps to I..X', () => {
    expect(estimateMmi(2, 5000, 10)).toBe(1);
    for (const m of [5, 7, 8, 9.5]) expect(estimateMmi(m, 0, 0)).toBeLessThanOrEqual(10);
  });
});

describe('known limitation', () => {
  it('saturates near-source for great quakes (documented in the README)', () => {
    // The h term grows with magnitude, so an M9.5 at the epicentre comes out around VII,
    // where real great earthquakes reach IX or more.
    expect(estimateMmi(9.5, 0, 0)).toBeLessThan(8);
  });
});

describe('radiusForMmi', () => {
  it('returns 0 when the epicentre does not reach the level', () => {
    expect(radiusForMmi(2.5, 10, 6)).toBe(0);
  });
  it('is consistent with estimateMmi at the boundary', () => {
    const r = radiusForMmi(6.5, 15, 5);
    expect(r).toBeGreaterThan(0);
    expect(estimateMmi(6.5, r - 0.5, 15)).toBeGreaterThanOrEqual(5);
    expect(estimateMmi(6.5, r + 0.5, 15)).toBeLessThan(5);
  });
  it('higher intensities sit inside lower ones', () => {
    expect(radiusForMmi(7, 20, 7)).toBeLessThan(radiusForMmi(7, 20, 5));
  });
});

describe('labels', () => {
  it('formats roman numerals and USGS wording', () => {
    expect(mmiRoman(6.4)).toBe('VI');
    expect(mmiRoman(0.2)).toBe('I');
    expect(mmiRoman(12)).toBe('X');
    expect(mmiShaking(4)).toBe('Light');
    expect(mmiShaking(8.2)).toBe('Severe');
    expect(mmiDamage(3)).toBe('None');
    expect(mmiDamage(7)).toBe('Moderate');
  });
});
