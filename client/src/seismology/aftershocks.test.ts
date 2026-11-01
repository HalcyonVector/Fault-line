import { describe, it, expect } from 'vitest';
import {
  omoriIntegral, expectedAftershocks, aftershockProbability, forecastTable,
  ruptureLengthKm, aftershockZoneKm, summarizeSequence, RJ_GENERIC,
} from './aftershocks';
import type { Quake } from '../types';

const q = (id: string, mag: number, lon: number, lat: number, time: number): Quake => ({
  id, mag, lon, lat, time, depthKm: 10, magType: null, place: '', updated: null, url: null, felt: null, cdi: null,
  mmi: null, alert: null, status: null, tsunami: 0, sig: 0, net: null, type: 'earthquake', plate: null,
});

describe('omoriIntegral', () => {
  it('matches the closed form for p = 1 (log) and numerical integration for p != 1', () => {
    expect(omoriIntegral(0, 1, 1, 0.05)).toBeCloseTo(Math.log(1.05 / 0.05), 9);
    let sum = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) * (2 / n);
      sum += (t + 0.05) ** -1.08 * (2 / n);
    }
    expect(omoriIntegral(0, 2, 1.08, 0.05)).toBeCloseTo(sum, 3);
  });
  it('is zero for an empty window', () => {
    expect(omoriIntegral(3, 3, 1.08, 0.05)).toBeCloseTo(0, 12);
  });
});

describe('Reasenberg & Jones forecast', () => {
  it('scales by 10^b per magnitude unit', () => {
    const ratio = expectedAftershocks(7, 4, 0, 7) / expectedAftershocks(7, 5, 0, 7);
    expect(ratio).toBeCloseTo(10 ** RJ_GENERIC.b, 6);
  });
  it('gives the textbook-scale answer for an M6 (roughly even odds of M5+ in the first week)', () => {
    const p = aftershockProbability(6, 5, 0, 7);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.75);
  });
  it('decays as time passes', () => {
    expect(aftershockProbability(6.5, 5, 10, 11)).toBeLessThan(aftershockProbability(6.5, 5, 0, 1));
  });
  it('builds a table that starts from the elapsed time', () => {
    const t0 = Date.UTC(2026, 0, 1);
    const fresh = forecastTable(6.8, t0, t0);
    const later = forecastTable(6.8, t0, t0 + 5 * 86_400_000);
    expect(fresh.map((r) => r.label)).toEqual(['M3+', 'M5+', 'Larger than this (M6.8+)']);
    expect(later[1].windows[0].probability).toBeLessThan(fresh[1].windows[0].probability);
    for (const row of fresh) {
      const ps = row.windows.map((w) => w.probability);
      expect(ps[0]).toBeLessThanOrEqual(ps[1]);
      expect(ps[1]).toBeLessThanOrEqual(ps[2]);
    }
  });
  it('skips thresholds above a small mainshock', () => {
    const rows = forecastTable(4.2, 0, 0);
    expect(rows.map((r) => r.minMag)).toEqual([3, 5.5]);
  });
});

describe('rupture length and sequence grouping', () => {
  it('Wells & Coppersmith: an M7 ruptures roughly 50 km', () => {
    expect(ruptureLengthKm(7)).toBeGreaterThan(40);
    expect(ruptureLengthKm(7)).toBeLessThan(60);
    expect(aftershockZoneKm(3)).toBe(20);
  });

  it('collects aftershocks, flags a larger follower and finds a parent', () => {
    const main = q('m', 6, 140, 35, 1_000_000);
    const catalog = [
      main,
      q('a1', 4, 140.05, 35.05, 1_100_000),
      q('a2', 3, 140.1, 35, 1_050_000),
      q('far', 4, 150, 35, 1_100_000),
      q('before', 3, 140, 35, 900_000),
      q('bigger', 6.5, 140.02, 35, 2_000_000),
    ];
    const s = summarizeSequence(main, catalog);
    expect(s.aftershocks.map((x) => x.id)).toEqual(['a2', 'a1']);
    expect(s.largerFollower?.id).toBe('bigger');
    expect(s.parent).toBeNull();

    const child = summarizeSequence(catalog[1], catalog);
    expect(child.parent?.id).toBe('m');
  });
});
