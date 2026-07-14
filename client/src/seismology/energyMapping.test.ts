import { describe, it, expect } from 'vitest';
import {
  magnitudeToEnergy,
  decayEnergy,
  magnitudeToAmplitude,
  depthToBrightness,
  depthToFilterCutoffHz,
  depthToEnvelope,
  depthBand,
} from './energyMapping';

describe('magnitudeToEnergy', () => {
  it('grows faster than linear in magnitude', () => {
    const e1 = magnitudeToEnergy(4);
    const e2 = magnitudeToEnergy(5);
    const e3 = magnitudeToEnergy(6);
    const step1 = e2 - e1;
    const step2 = e3 - e2;
    expect(step2).toBeGreaterThan(step1);
  });

  it('is monotonically increasing', () => {
    expect(magnitudeToEnergy(6)).toBeGreaterThan(magnitudeToEnergy(5));
  });
});

describe('decayEnergy', () => {
  it('halves after one half-life (2 hours)', () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const decayed = decayEnergy(1000, twoHoursMs);
    expect(decayed).toBeCloseTo(500, 0);
  });

  it('does not change energy for zero or negative elapsed time', () => {
    expect(decayEnergy(500, 0)).toBe(500);
    expect(decayEnergy(500, -100)).toBe(500);
  });

  it('approaches zero over a long time', () => {
    const tenHalfLives = 20 * 60 * 60 * 1000;
    expect(decayEnergy(1000, tenHalfLives)).toBeLessThan(1);
  });
});

describe('magnitudeToAmplitude', () => {
  it('is monotonically increasing with magnitude', () => {
    const a1 = magnitudeToAmplitude(3);
    const a2 = magnitudeToAmplitude(5);
    const a3 = magnitudeToAmplitude(7);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
  });

  it('clamps to 1 at and beyond the reference max magnitude so a M9 does not clip past full scale', () => {
    expect(magnitudeToAmplitude(9)).toBe(1);
    expect(magnitudeToAmplitude(9.5)).toBe(1);
  });

  it('keeps a minimum-threshold quake clearly above zero', () => {
    expect(magnitudeToAmplitude(2.5)).toBeGreaterThanOrEqual(0.05);
  });
});

describe('depthToBrightness', () => {
  it('is 1 at the surface and decreases with depth', () => {
    expect(depthToBrightness(0)).toBeCloseTo(1, 5);
    expect(depthToBrightness(70)).toBeCloseTo(0.5, 5);
    expect(depthToBrightness(700)).toBeLessThan(depthToBrightness(70));
  });

  it('never goes negative for very large depths', () => {
    expect(depthToBrightness(10000)).toBeGreaterThanOrEqual(0);
  });
});

describe('depthToFilterCutoffHz', () => {
  it('is brighter (higher cutoff) for shallow quakes than deep ones', () => {
    expect(depthToFilterCutoffHz(10)).toBeGreaterThan(depthToFilterCutoffHz(500));
  });
});

describe('depthToEnvelope', () => {
  it('gives shallow quakes a fast attack and short decay, deep quakes the opposite', () => {
    const shallow = depthToEnvelope(5);
    const deep = depthToEnvelope(600);
    expect(shallow.attack).toBeLessThan(deep.attack);
    expect(shallow.decay).toBeLessThan(deep.decay);
  });
});

describe('depthBand', () => {
  it('classifies shallow, intermediate, and deep correctly', () => {
    expect(depthBand(10)).toBe('shallow');
    expect(depthBand(150)).toBe('intermediate');
    expect(depthBand(400)).toBe('deep');
  });
});
