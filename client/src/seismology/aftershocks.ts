// Aftershock forecasting with the Reasenberg & Jones (1989) model, using their
// generic California parameters. The rate of aftershocks at or above
// magnitude M, t days after a mainshock of magnitude Mm, is
//
//   lambda(t, M) = 10^(a + b (Mm - M)) * (t + c)^(-p)
//
// i.e. the modified Omori (Omori-Utsu) time decay combined with
// Gutenberg-Richter magnitude scaling. Integrating over a window gives the
// expected count, and treating aftershocks as a Poisson process gives the
// probability of at least one. USGS's operational forecasts use regional
// parameters (Page et al. 2016) refined by each sequence as it unfolds; the
// generic California set is a reasonable global stand-in, not a substitute.

import { haversineKm } from '../lib/geo';
import type { Quake } from '../types';

export const RJ_GENERIC = { a: -1.67, b: 0.91, p: 1.08, c: 0.05 } as const;
export type RjParams = { a: number; b: number; p: number; c: number };

const MS_PER_DAY = 86_400_000;

/** Integral of (t + c)^-p from t1 to t2 (days). */
export function omoriIntegral(t1: number, t2: number, p: number, c: number): number {
  const a = Math.max(0, t1) + c;
  const b = Math.max(a, Math.max(0, t2) + c);
  if (Math.abs(p - 1) < 1e-9) return Math.log(b / a);
  return (b ** (1 - p) - a ** (1 - p)) / (1 - p);
}

/** Expected number of aftershocks >= `minMag` between t1 and t2 days after the mainshock. */
export function expectedAftershocks(mainMag: number, minMag: number, t1Days: number, t2Days: number, params: RjParams = RJ_GENERIC): number {
  return 10 ** (params.a + params.b * (mainMag - minMag)) * omoriIntegral(t1Days, t2Days, params.p, params.c);
}

/** Probability of at least one aftershock >= `minMag` between t1 and t2 days after the mainshock. */
export function aftershockProbability(mainMag: number, minMag: number, t1Days: number, t2Days: number, params: RjParams = RJ_GENERIC): number {
  return 1 - Math.exp(-expectedAftershocks(mainMag, minMag, t1Days, t2Days, params));
}

export interface ForecastRow {
  minMag: number;
  label: string;
  windows: { label: string; probability: number; expected: number }[];
}

export const FORECAST_WINDOWS = [
  { label: 'Next day', days: 1 },
  { label: 'Next week', days: 7 },
  { label: 'Next month', days: 30 },
];

/** The forecast table shown for a selected quake, starting from `nowMs`. */
export function forecastTable(mainMag: number, mainTimeMs: number, nowMs: number): ForecastRow[] {
  const elapsed = Math.max(0, (nowMs - mainTimeMs) / MS_PER_DAY);
  const thresholds = [
    { minMag: 3, label: 'M3+' },
    { minMag: 5, label: 'M5+' },
    { minMag: Math.max(5.5, Math.round(mainMag * 10) / 10), label: `Larger than this (M${mainMag.toFixed(1)}+)` },
  ].filter((t, i, all) => all.findIndex((o) => o.minMag === t.minMag) === i && (t.minMag < mainMag || i === all.length - 1));
  return thresholds.map(({ minMag, label }) => ({
    minMag,
    label,
    windows: FORECAST_WINDOWS.map((w) => ({
      label: w.label,
      expected: expectedAftershocks(mainMag, minMag, elapsed, elapsed + w.days),
      probability: aftershockProbability(mainMag, minMag, elapsed, elapsed + w.days),
    })),
  }));
}

/**
 * Wells & Coppersmith (1994) subsurface rupture length, all slip types:
 * log10(L km) = -2.44 + 0.59 M. Used to size the aftershock zone.
 */
export function ruptureLengthKm(mag: number): number {
  return 10 ** (-2.44 + 0.59 * mag);
}

/** Radius around the epicentre within which later events are counted as this quake's aftershocks. */
export function aftershockZoneKm(mag: number): number {
  return Math.max(20, ruptureLengthKm(mag));
}

export interface SequenceSummary {
  zoneKm: number;
  aftershocks: Quake[];
  /** A later, larger event inside the zone: this quake may have been a foreshock. */
  largerFollower: Quake | null;
  /** An earlier, larger event inside the zone in the last 30 days: this is likely its aftershock. */
  parent: Quake | null;
}

/** Find events in `catalog` that belong to the same sequence as `main`. */
export function summarizeSequence(main: Quake, catalog: Quake[]): SequenceSummary {
  const zoneKm = aftershockZoneKm(main.mag);
  const t0 = main.time ?? 0;
  const aftershocks: Quake[] = [];
  let largerFollower: Quake | null = null;
  let parent: Quake | null = null;
  for (const q of catalog) {
    if (q.id === main.id || q.time === null) continue;
    const parentZone = aftershockZoneKm(q.mag);
    const d = haversineKm(main.lon, main.lat, q.lon, q.lat);
    if (q.time > t0 && d <= zoneKm) {
      if (q.mag > main.mag) {
        if (!largerFollower || q.mag > largerFollower.mag) largerFollower = q;
      } else {
        aftershocks.push(q);
      }
    } else if (q.time < t0 && q.mag > main.mag && d <= parentZone && t0 - q.time < 30 * MS_PER_DAY) {
      if (!parent || q.mag > parent.mag) parent = q;
    }
  }
  aftershocks.sort((x, y) => (x.time ?? 0) - (y.time ?? 0));
  return { zoneKm, aftershocks, largerFollower, parent };
}
