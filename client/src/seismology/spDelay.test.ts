import { describe, it, expect } from 'vitest';
import { computeSPDelay } from './spDelay';

describe('computeSPDelay', () => {
  it('is exactly zero for a surface (zero depth) quake', () => {
    expect(computeSPDelay(0)).toBe(0);
  });

  it('grows monotonically with depth', () => {
    const shallow = computeSPDelay(10);
    const mid = computeSPDelay(100);
    const deep = computeSPDelay(600);
    expect(mid).toBeGreaterThan(shallow);
    expect(deep).toBeGreaterThan(mid);
  });

  it('matches the closed-form Vp/Vs travel-time-difference formula', () => {
    const depthKm = 200;
    const expected = depthKm * (1 / 3.6 - 1 / 6.5) * 1000;
    expect(computeSPDelay(depthKm)).toBeCloseTo(expected, 6);
  });

  it('never returns a negative delay for negative/garbage depth input', () => {
    expect(computeSPDelay(-50)).toBe(0);
  });
});
