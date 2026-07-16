import { describe, it, expect } from 'vitest';
import { magnitudeRarityMultiplier, depthRarityMultiplier, rarityScore, rarityTier } from './rarityScore';

describe('magnitudeRarityMultiplier', () => {
  it('is 1 at the reference magnitude', () => {
    expect(magnitudeRarityMultiplier(4.5, 4.5, 1.0)).toBeCloseTo(1, 10);
  });

  it('grows 10x per whole magnitude unit at b=1.0', () => {
    const m5 = magnitudeRarityMultiplier(5.5, 4.5, 1.0);
    const m6 = magnitudeRarityMultiplier(6.5, 4.5, 1.0);
    expect(m6 / m5).toBeCloseTo(10, 5);
  });

  it('is below 1 for a smaller-than-reference magnitude', () => {
    expect(magnitudeRarityMultiplier(2.0, 4.5, 1.0)).toBeLessThan(1);
  });
});

describe('depthRarityMultiplier', () => {
  it('is 1 for shallow (the most common band)', () => {
    expect(depthRarityMultiplier(10)).toBeCloseTo(1 / 0.75, 10);
  });

  it('is higher for intermediate than shallow', () => {
    expect(depthRarityMultiplier(150)).toBeGreaterThan(depthRarityMultiplier(10));
  });

  it('is highest for deep', () => {
    expect(depthRarityMultiplier(500)).toBeGreaterThan(depthRarityMultiplier(150));
  });
});

describe('rarityScore', () => {
  it('is low for a routine shallow M4.5-ish quake', () => {
    expect(rarityScore(4.5, 10)).toBeLessThan(20);
  });

  it('is higher for a bigger quake at the same depth', () => {
    expect(rarityScore(7.5, 10)).toBeGreaterThan(rarityScore(4.5, 10));
  });

  it('is higher for an anomalously deep quake at the same magnitude', () => {
    expect(rarityScore(5.5, 550)).toBeGreaterThan(rarityScore(5.5, 10));
  });

  it('stays within the 0..99 bound even for an extreme event', () => {
    const score = rarityScore(9.8, 700);
    expect(score).toBeLessThanOrEqual(99);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('rarityTier', () => {
  it('buckets scores in ascending order', () => {
    expect(rarityTier(0)).toBe('common');
    expect(rarityTier(25)).toBe('notable');
    expect(rarityTier(45)).toBe('rare');
    expect(rarityTier(65)).toBe('extraordinary');
    expect(rarityTier(90)).toBe('historic');
  });
});
