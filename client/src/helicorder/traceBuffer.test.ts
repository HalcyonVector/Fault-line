import { describe, it, expect } from 'vitest';
import { pushSample, peakAmplitude, amplitudeToTraceY, traceSampleIntervalMs, decimateForWidth } from './traceBuffer';

describe('pushSample', () => {
  it('appends while under the cap', () => {
    expect(pushSample([1, 2], 3, 5)).toEqual([1, 2, 3]);
  });

  it('drops the oldest sample once at the cap (fixed-size ring)', () => {
    expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });

  it('returns an empty buffer for a non-positive cap', () => {
    expect(pushSample([1, 2], 3, 0)).toEqual([]);
  });

  it('does not mutate the input buffer', () => {
    const original = [1, 2, 3];
    pushSample(original, 4, 3);
    expect(original).toEqual([1, 2, 3]);
  });
});

describe('peakAmplitude', () => {
  it('is 0 for silence', () => {
    expect(peakAmplitude([0, 0, 0])).toBe(0);
  });

  it('finds the largest absolute value, positive or negative', () => {
    expect(peakAmplitude([0.1, -0.9, 0.4])).toBeCloseTo(0.9);
  });

  it('handles an empty snapshot', () => {
    expect(peakAmplitude([])).toBe(0);
  });
});

describe('amplitudeToTraceY', () => {
  it('maps 0 amplitude to the center line', () => {
    expect(amplitudeToTraceY(0, 50, 1, 40)).toBe(50);
  });

  it('maps positive amplitude above center, negative below', () => {
    expect(amplitudeToTraceY(0.5, 50, 1, 40)).toBeLessThan(50);
    expect(amplitudeToTraceY(-0.5, 50, 1, 40)).toBeGreaterThan(50);
  });

  it('clamps gained amplitude to the max offset instead of overshooting', () => {
    expect(amplitudeToTraceY(1, 50, 5, 40)).toBe(10);
    expect(amplitudeToTraceY(-1, 50, 5, 40)).toBe(90);
  });
});

describe('traceSampleIntervalMs', () => {
  it('is unchanged when motion is not reduced', () => {
    expect(traceSampleIntervalMs(50, false)).toBe(50);
  });

  it('slows down (does not disable) under prefers-reduced-motion', () => {
    const slowed = traceSampleIntervalMs(50, true);
    expect(slowed).toBeGreaterThan(50);
    expect(Number.isFinite(slowed)).toBe(true);
  });
});

describe('decimateForWidth', () => {
  it('pads short buffers with min=max=value, one per sample', () => {
    expect(decimateForWidth([1, 2, 3], 10)).toEqual([
      { min: 1, max: 1 },
      { min: 2, max: 2 },
      { min: 3, max: 3 },
    ]);
  });

  it('reduces a long buffer to exactly targetWidth buckets', () => {
    const buffer = Array.from({ length: 100 }, (_, i) => i);
    const out = decimateForWidth(buffer, 10);
    expect(out).toHaveLength(10);
  });

  it('preserves peak transients within a bucket instead of naive subsampling', () => {
    // A sharp spike buried between zeros would be lost by naive every-Nth sampling.
    const buffer = new Array(20).fill(0);
    buffer[5] = 1;
    const out = decimateForWidth(buffer, 4);
    expect(out.some((b) => b.max >= 1)).toBe(true);
  });

  it('returns an empty array for an empty buffer or non-positive width', () => {
    expect(decimateForWidth([], 10)).toEqual([]);
    expect(decimateForWidth([1, 2], 0)).toEqual([]);
  });
});
