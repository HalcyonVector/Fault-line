import { describe, it, expect } from 'vitest';
import {
  isSignificantMainshock,
  omoriRate,
  aftershockProductivityK,
  expectedAftershockCount,
  gutenbergRichterExceedanceFraction,
  damagingAftershockProbability,
} from './omoriAftershocks';

describe('isSignificantMainshock', () => {
  it('is true at or above magnitude 6', () => {
    expect(isSignificantMainshock(6.0, 0)).toBe(true);
    expect(isSignificantMainshock(7.5, 0)).toBe(true);
  });

  it('is true for high sig even below magnitude 6', () => {
    expect(isSignificantMainshock(5.2, 700)).toBe(true);
  });

  it('is false for a small, low-sig quake', () => {
    expect(isSignificantMainshock(4.5, 100)).toBe(false);
  });
});

describe('omoriRate', () => {
  it('decreases as time since the mainshock increases (Omori-Utsu decay)', () => {
    const K = 5;
    expect(omoriRate(0.01, K)).toBeGreaterThan(omoriRate(1, K));
    expect(omoriRate(1, K)).toBeGreaterThan(omoriRate(5, K));
  });

  it('scales linearly with productivity K', () => {
    expect(omoriRate(1, 10)).toBeCloseTo(2 * omoriRate(1, 5), 10);
  });
});

describe('aftershockProductivityK', () => {
  it('equals the base rate at the magnitude-6 significance floor and grows with magnitude', () => {
    expect(aftershockProductivityK(6)).toBeCloseTo(5, 10);
    expect(aftershockProductivityK(7)).toBeGreaterThan(aftershockProductivityK(6));
    expect(aftershockProductivityK(8)).toBeGreaterThan(aftershockProductivityK(7));
  });
});

describe('expectedAftershockCount', () => {
  it('grows with the length of the forecast horizon', () => {
    const short = expectedAftershockCount(7, 0, 1);
    const long = expectedAftershockCount(7, 0, 24);
    expect(long).toBeGreaterThan(short);
  });

  it('decreases the later the same-length window starts (Omori decay)', () => {
    const early = expectedAftershockCount(7, 0, 1);
    const later = expectedAftershockCount(7, 10, 11);
    expect(early).toBeGreaterThan(later);
  });

  it('grows with mainshock magnitude for the same window', () => {
    const small = expectedAftershockCount(6, 0, 1);
    const big = expectedAftershockCount(8, 0, 1);
    expect(big).toBeGreaterThan(small);
  });

  it('is non-negative even for a start after the end', () => {
    expect(expectedAftershockCount(7, 5, 2)).toBeGreaterThanOrEqual(0);
  });
});

describe('gutenbergRichterExceedanceFraction', () => {
  it('is 1 when the threshold equals the reference magnitude', () => {
    expect(gutenbergRichterExceedanceFraction(2.5, 2.5, 1.0)).toBeCloseTo(1, 10);
  });

  it('shrinks by 10x per whole magnitude unit at b=1.0', () => {
    const at3 = gutenbergRichterExceedanceFraction(3.5, 2.5, 1.0);
    const at4 = gutenbergRichterExceedanceFraction(4.5, 2.5, 1.0);
    expect(at3 / at4).toBeCloseTo(10, 5);
  });

  it('never exceeds 1 even below the reference magnitude', () => {
    expect(gutenbergRichterExceedanceFraction(1.0, 2.5, 1.0)).toBeLessThanOrEqual(1);
  });
});

describe('damagingAftershockProbability', () => {
  it('is between 0 and 1', () => {
    const p = damagingAftershockProbability(7.5, 0, 1);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('is higher for a bigger mainshock over the same forecast window', () => {
    const small = damagingAftershockProbability(6.0, 0, 24);
    const big = damagingAftershockProbability(8.0, 0, 24);
    expect(big).toBeGreaterThan(small);
  });

  it('decays as the forecast window slides later after the mainshock', () => {
    const soon = damagingAftershockProbability(7.0, 0, 1);
    const later = damagingAftershockProbability(7.0, 48, 49);
    expect(soon).toBeGreaterThan(later);
  });

  it('is meaningfully lower for a higher dangerous-magnitude threshold', () => {
    const lenient = damagingAftershockProbability(7.5, 0, 24, { dangerousMagnitude: 4.5 });
    const strict = damagingAftershockProbability(7.5, 0, 24, { dangerousMagnitude: 6.5 });
    expect(lenient).toBeGreaterThan(strict);
  });
});
