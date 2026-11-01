import { describe, it, expect } from 'vitest';
import {
  magnitudeToJoules, joulesToTonsTnt, formatTnt, histogram, completenessMagnitude, globalCompleteness, bValue,
  cumulativeCounts, depthBand, summarizeCatalog,
} from './stats';
import type { Quake } from '../types';

describe('energy', () => {
  it('each whole magnitude step is ~31.6x more energy', () => {
    expect(magnitudeToJoules(6) / magnitudeToJoules(5)).toBeCloseTo(10 ** 1.5, 6);
  });
  it('an M6 is roughly 15 kt TNT', () => {
    const t = joulesToTonsTnt(magnitudeToJoules(6));
    expect(t).toBeGreaterThan(10_000);
    expect(t).toBeLessThan(20_000);
  });
  it('formats TNT across scales', () => {
    expect(formatTnt(0.5)).toBe('500 kg TNT');
    expect(formatTnt(2500)).toBe('2.5 kt TNT');
    expect(formatTnt(3.2e6)).toBe('3.2 Mt TNT');
  });
});

describe('histogram', () => {
  it('bins values and clamps outliers into the end bins', () => {
    const h = histogram([0, 0.4, 0.6, 1.2, 9, -3], 0, 2, 0.5);
    expect(h.map((b) => b.count)).toEqual([3, 1, 1, 1]);
  });
});

// Synthetic Gutenberg-Richter catalog with a known b-value, sampled by inverse CDF.
function grCatalog(b: number, mMin: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    // Continuous magnitudes from half a bin below mMin, so rounding to 0.1 lands the first bin on mMin.
    const m = mMin - 0.05 - Math.log10(1 - u) / b;
    out.push(Math.round(m * 10) / 10);
  }
  return out;
}

describe('b-value and completeness', () => {
  it('recovers a known b-value from a synthetic catalog', () => {
    const mags = grCatalog(1.0, 2.0, 5000);
    const r = bValue(mags, 2.0)!;
    expect(r.b).toBeGreaterThan(0.93);
    expect(r.b).toBeLessThan(1.07);
    expect(r.err).toBeGreaterThan(0);
    expect(r.err).toBeLessThan(0.05);
  });
  it('returns null on too few events', () => {
    expect(bValue([3, 3.1, 3.2], 3)).toBeNull();
  });
  it('max-curvature Mc sits at the peak bin + 0.2', () => {
    // Incomplete below 2.5 (fewer small events recorded), complete above.
    const mags = [...grCatalog(1, 2.5, 2000), ...Array(100).fill(2.2), ...Array(200).fill(2.4)];
    expect(completenessMagnitude(mags)).toBeCloseTo(2.7, 6);
    expect(completenessMagnitude([])).toBeNull();
  });
  it('floors global completeness at M4.5 so mixed-network catalogs are not underfit', () => {
    // A US-heavy catalog: plenty of M2.5-3 events, few large ones elsewhere.
    const mags = [...grCatalog(1, 2.5, 3000), ...grCatalog(1, 4.5, 200)];
    expect(completenessMagnitude(mags)).toBeLessThan(4.5);
    expect(globalCompleteness(mags)).toBe(4.5);
    expect(globalCompleteness([6, 6.1, 6.2])).toBeGreaterThanOrEqual(6);
  });
  it('cumulative counts are non-increasing', () => {
    const c = cumulativeCounts([1, 1.5, 2, 2, 3]);
    expect(c[0]).toEqual({ mag: 1, n: 5 });
    expect(c.at(-1)).toEqual({ mag: 3, n: 1 });
    for (let i = 1; i < c.length; i++) expect(c[i].n).toBeLessThanOrEqual(c[i - 1].n);
  });
});

describe('summarizeCatalog', () => {
  const base = { magType: null, place: '', updated: null, url: null, cdi: null, mmi: null, alert: null, status: null, sig: 0, net: null, type: 'earthquake', lon: 0, lat: 0, time: 0 } as const;
  it('totals energy, depth bands and plate kinds', () => {
    const quakes: Quake[] = [
      { ...base, id: 'a', mag: 6, depthKm: 10, felt: 10, tsunami: 1, plate: { kind: 'subduction' } as Quake['plate'] },
      { ...base, id: 'b', mag: 4, depthKm: 150, felt: null, tsunami: 0, plate: null },
      { ...base, id: 'c', mag: 3, depthKm: 500, felt: 2, tsunami: 0, plate: null },
    ];
    const s = summarizeCatalog(quakes);
    expect(s.count).toBe(3);
    expect(s.largest?.id).toBe('a');
    expect(s.largestShare).toBeGreaterThan(0.99);
    expect(s.feltReports).toBe(12);
    expect(s.tsunamiFlags).toBe(1);
    expect(s.depth).toEqual({ shallow: 1, intermediate: 1, deep: 1 });
    expect(s.plateKinds.subduction).toBe(1);
    expect(s.plateKinds.intraplate).toBe(2);
    expect(depthBand(70)).toBe('intermediate');
  });
});
