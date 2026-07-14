import { describe, it, expect } from 'vitest';
import { omoriRate, aftershockProductivity, generateAftershockTrain } from './omoriAftershocks';

describe('omoriRate', () => {
  it('decreases as time since the mainshock increases (Omori-Utsu decay)', () => {
    const K = 5;
    expect(omoriRate(0.1, K)).toBeGreaterThan(omoriRate(1, K));
    expect(omoriRate(1, K)).toBeGreaterThan(omoriRate(5, K));
  });

  it('scales linearly with productivity K', () => {
    expect(omoriRate(1, 10)).toBeCloseTo(2 * omoriRate(1, 5), 10);
  });
});

describe('aftershockProductivity', () => {
  it('is 1 at the M6 significance floor and grows with magnitude', () => {
    expect(aftershockProductivity(6)).toBeCloseTo(1, 10);
    expect(aftershockProductivity(7)).toBeGreaterThan(aftershockProductivity(6));
    expect(aftershockProductivity(8)).toBeGreaterThan(aftershockProductivity(7));
  });
});

describe('generateAftershockTrain', () => {
  it('is empty for an insignificant quake (below magnitude 6 and low sig)', () => {
    expect(generateAftershockTrain(4.5, 100)).toEqual([]);
    expect(generateAftershockTrain(5.9, 200)).toEqual([]);
  });

  it('is non-empty for a magnitude >= 6 quake even with low sig', () => {
    const pulses = generateAftershockTrain(6.2, 0);
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('is non-empty for a high-sig quake even below magnitude 6', () => {
    const pulses = generateAftershockTrain(5.5, 700);
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('produces strictly increasing delays', () => {
    const pulses = generateAftershockTrain(7, 900);
    for (let i = 1; i < pulses.length; i++) {
      expect(pulses[i].delayMs).toBeGreaterThan(pulses[i - 1].delayMs);
    }
  });

  it('produces monotonically non-increasing amplitude, matching the Omori decay shape', () => {
    const pulses = generateAftershockTrain(7, 900);
    for (let i = 1; i < pulses.length; i++) {
      expect(pulses[i].amplitude).toBeLessThanOrEqual(pulses[i - 1].amplitude);
    }
  });

  it('compresses the whole train into the requested audio window', () => {
    const audioWindowMs = 30_000;
    const pulses = generateAftershockTrain(7.5, 950, { audioWindowMs });
    const last = pulses[pulses.length - 1];
    expect(last.delayMs).toBeLessThanOrEqual(audioWindowMs + 1);
  });

  it('a bigger mainshock produces a denser (more pulses) and louder (higher ceiling) train than a smaller one', () => {
    const small = generateAftershockTrain(6.0, 0);
    const big = generateAftershockTrain(8.0, 0);
    expect(big.length).toBeGreaterThan(small.length);
    expect(big[0].amplitude).toBeGreaterThan(small[0].amplitude);
  });
});
