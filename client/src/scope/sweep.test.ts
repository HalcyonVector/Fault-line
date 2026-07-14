import { describe, it, expect } from 'vitest';
import { sweepAngleDeg, blipOpacity, polarToCartesian, isWithinSweepTrail, sweepPeriodMs } from './sweep';

describe('sweepAngleDeg', () => {
  it('starts at 0deg at elapsed=0', () => {
    expect(sweepAngleDeg(0, 4000)).toBe(0);
  });

  it('reaches 180deg at half the period', () => {
    expect(sweepAngleDeg(2000, 4000)).toBeCloseTo(180);
  });

  it('wraps around past a full period', () => {
    expect(sweepAngleDeg(4500, 4000)).toBeCloseTo(sweepAngleDeg(500, 4000));
  });

  it('is 0 for a non-positive period rather than dividing by zero', () => {
    expect(sweepAngleDeg(1000, 0)).toBe(0);
  });
});

describe('blipOpacity', () => {
  it('is fully opaque at birth', () => {
    expect(blipOpacity(0, 5000)).toBe(1);
  });

  it('fades linearly toward 0', () => {
    expect(blipOpacity(2500, 5000)).toBeCloseTo(0.5);
  });

  it('is 0 once past its lifetime, never negative', () => {
    expect(blipOpacity(6000, 5000)).toBe(0);
  });

  it('is 0 for a non-positive lifetime', () => {
    expect(blipOpacity(100, 0)).toBe(0);
  });
});

describe('polarToCartesian', () => {
  it('places 0deg straight up from center', () => {
    const p = polarToCartesian(50, 50, 40, 0);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(10);
  });

  it('places 90deg to the right of center', () => {
    const p = polarToCartesian(50, 50, 40, 90);
    expect(p.x).toBeCloseTo(90);
    expect(p.y).toBeCloseTo(50);
  });
});

describe('isWithinSweepTrail', () => {
  it('is true for a blip the sweep just passed', () => {
    expect(isWithinSweepTrail(80, 90, 20)).toBe(true);
  });

  it('is false for a blip well ahead of the sweep', () => {
    expect(isWithinSweepTrail(200, 90, 20)).toBe(false);
  });

  it('handles the wraparound boundary at 0/360', () => {
    expect(isWithinSweepTrail(350, 5, 20)).toBe(true);
  });
});

describe('sweepPeriodMs', () => {
  it('is unchanged when motion is not reduced', () => {
    expect(sweepPeriodMs(4000, false)).toBe(4000);
  });

  it('slows down (does not disable) under prefers-reduced-motion', () => {
    expect(sweepPeriodMs(4000, true)).toBeGreaterThan(4000);
  });
});
