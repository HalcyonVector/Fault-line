import { describe, it, expect } from 'vitest';
import {
  isSignificantMainshock,
  omoriRate,
  aftershockProductivityK,
  expectedAftershockCount,
  gutenbergRichterExceedanceFraction,
  damagingAftershockProbability,
  estimateBValue,
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

describe('estimateBValue', () => {
  // A tiny seeded PRNG (mulberry32) so the synthetic-catalog test below is
  // reproducible instead of depending on Math.random() — a flaky statistical
  // test that only sometimes fails is worse than no test.
  function mulberry32(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Inverse-transform-samples a Gutenberg-Richter magnitude distribution with
   * a known true b-value, then rounds to the nearest 0.1 the way a real
   * catalog is actually reported — this matters here specifically because
   * `estimateBValue` applies Utsu's half-bin correction, which assumes
   * exactly this kind of binning. Testing it against unrounded/continuous
   * magnitudes would be checking the estimator against data that doesn't
   * match what the correction term is for.
   */
  function sampleGutenbergRichterMagnitudes(count: number, trueB: number, mc: number, rng: () => number): number[] {
    const magnitudes: number[] = [];
    for (let i = 0; i < count; i++) {
      const u = rng();
      const raw = mc - Math.log10(1 - u) / trueB;
      magnitudes.push(Math.round(raw * 10) / 10);
    }
    return magnitudes;
  }

  it('recovers a known true b-value from a large synthetic Gutenberg-Richter catalog', () => {
    const rng = mulberry32(42);
    const trueB = 1.0;
    const mc = 2.5;
    const magnitudes = sampleGutenbergRichterMagnitudes(5000, trueB, mc, rng);

    const estimated = estimateBValue(magnitudes, mc);
    expect(estimated).not.toBeNull();
    // Aki's MLE estimator has a well-documented small downward finite-sample
    // bias, so "recovers" means "within a real tolerance band", not
    // "reproduces the true value exactly" — 0.2 comfortably covers that
    // known bias plus ordinary sampling variance at n=5000 without being
    // loose enough to pass a genuinely broken estimator.
    expect(Math.abs((estimated as number) - trueB)).toBeLessThan(0.2);
  });

  it('recovers a different true b-value just as well (not hardcoded to b=1)', () => {
    const rng = mulberry32(7);
    const trueB = 1.4;
    const mc = 2.5;
    const magnitudes = sampleGutenbergRichterMagnitudes(5000, trueB, mc, rng);

    const estimated = estimateBValue(magnitudes, mc);
    expect(estimated).not.toBeNull();
    expect(Math.abs((estimated as number) - trueB)).toBeLessThan(0.2);
  });

  it('returns null when there is not enough data to trust the estimate', () => {
    expect(estimateBValue([3.0, 3.2, 3.5], 2.5)).toBeNull();
    expect(estimateBValue([], 2.5)).toBeNull();
  });

  it('ignores magnitudes below the completeness threshold', () => {
    const rng = mulberry32(1);
    const aboveMc = sampleGutenbergRichterMagnitudes(50, 1.0, 2.5, rng);
    const belowMc = Array.from({ length: 200 }, () => 1.0); // a flood of tiny, incomplete-catalog quakes
    const estimated = estimateBValue([...aboveMc, ...belowMc], 2.5);
    // Should still produce a sane b-value driven only by the >= Mc events, not be
    // dragged around by the huge pile of sub-threshold magnitudes.
    expect(estimated).not.toBeNull();
    expect(estimated as number).toBeGreaterThan(0.4);
    expect(estimated as number).toBeLessThan(2.0);
  });

  it('returns null for a degenerate catalog where every magnitude sits at completeness', () => {
    const flat = Array.from({ length: 100 }, () => 2.5);
    expect(estimateBValue(flat, 2.5)).toBeNull();
  });

  it('clamps to a real-world-plausible range instead of returning an extreme value', () => {
    // A handful of magnitudes barely above Mc with one huge outlier can produce
    // a nonsensical raw estimate; the clamp keeps it in a defensible band.
    const skewed = [...Array.from({ length: 40 }, () => 2.51), 9.0];
    const estimated = estimateBValue(skewed, 2.5);
    if (estimated !== null) {
      expect(estimated).toBeGreaterThanOrEqual(0.4);
      expect(estimated).toBeLessThanOrEqual(2.0);
    }
  });
});
