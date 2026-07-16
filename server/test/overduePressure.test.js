import { describe, it, expect } from 'vitest';
import { computeOverduePressure } from '../src/lib/overduePressure.js';

describe('computeOverduePressure', () => {
  it('is 0 the year of the last rupture', () => {
    const { raw, clamped } = computeOverduePressure(2000, 2000, 200);
    expect(raw).toBe(0);
    expect(clamped).toBe(0);
  });

  it('is 0.5 at half the recurrence interval', () => {
    const { raw } = computeOverduePressure(2100, 2000, 200);
    expect(raw).toBeCloseTo(0.5, 10);
  });

  it('is 1.0 exactly at the recurrence interval ("on schedule")', () => {
    const { raw, clamped } = computeOverduePressure(2200, 2000, 200);
    expect(raw).toBeCloseTo(1, 10);
    expect(clamped).toBeCloseTo(1, 10);
  });

  it('raw can exceed the cap, but clamped never does', () => {
    const { raw, clamped } = computeOverduePressure(2900, 2000, 200, 2);
    expect(raw).toBeCloseTo(4.5, 10);
    expect(clamped).toBe(2);
  });

  it('never goes negative even if given a future rupture year', () => {
    const { raw, clamped } = computeOverduePressure(2000, 2050, 200);
    expect(raw).toBeLessThan(0);
    expect(clamped).toBe(0);
  });
});
