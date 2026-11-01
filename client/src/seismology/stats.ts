// Catalog statistics for the Overview panel.
import type { Quake } from '../types';

/** Gutenberg-Richter energy relation: log10 E (joules) = 1.5 M + 4.8. */
export function magnitudeToJoules(mag: number): number {
  return 10 ** (1.5 * mag + 4.8);
}

const JOULES_PER_TON_TNT = 4.184e9;

export function joulesToTonsTnt(joules: number): number {
  return joules / JOULES_PER_TON_TNT;
}

/** Human-readable TNT equivalent, e.g. "3.2 kt TNT". */
export function formatTnt(tons: number): string {
  if (tons >= 1e6) return `${(tons / 1e6).toFixed(tons >= 1e7 ? 0 : 1)} Mt TNT`;
  if (tons >= 1e3) return `${(tons / 1e3).toFixed(tons >= 1e4 ? 0 : 1)} kt TNT`;
  if (tons >= 1) return `${tons.toFixed(tons >= 10 ? 0 : 1)} t TNT`;
  return `${(tons * 1000).toFixed(0)} kg TNT`;
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/** Fixed-width histogram over [min, max). Values outside are clamped into the end bins. */
export function histogram(values: number[], min: number, max: number, width: number): HistogramBin[] {
  const n = Math.max(1, Math.round((max - min) / width));
  const bins: HistogramBin[] = Array.from({ length: n }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const i = Math.min(n - 1, Math.max(0, Math.floor((v - min) / width + 1e-9)));
    bins[i].count++;
  }
  return bins;
}

const BIN = 0.1;
const roundBin = (m: number) => Math.round(m / BIN) * BIN;

/**
 * Magnitude of completeness by maximum curvature (Wiemer & Wyss 2000): the
 * most populated 0.1-magnitude bin, plus the +0.2 correction Woessner &
 * Wiemer (2005) recommend because the raw estimate is biased low.
 */
export function completenessMagnitude(mags: number[]): number | null {
  const counts = new Map<number, number>();
  for (const m of mags) {
    if (!Number.isFinite(m)) continue;
    const k = Math.round(roundBin(m) * 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = -Infinity;
  let bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount || (c === bestCount && k < best)) {
      best = k;
      bestCount = c;
    }
  }
  return Math.round(best + 2) / 10;
}

export const MIN_EVENTS_FOR_B = 50;

/**
 * USGS's worldwide catalog is only complete from about M4.5 up: smaller
 * events are located well only near dense networks (the US, Japan). Fitting a
 * global b-value below that mixes complete and incomplete regions and drags
 * b far too low, so the global fit never starts below this.
 */
export const GLOBAL_COMPLETENESS = 4.5;

/** Completeness for a mixed global catalog: max curvature, floored at `GLOBAL_COMPLETENESS`. */
export function globalCompleteness(mags: number[]): number | null {
  const mc = completenessMagnitude(mags);
  return mc === null ? null : Math.max(mc, GLOBAL_COMPLETENESS);
}

/**
 * Aki (1965) maximum-likelihood b-value with Utsu's half-bin correction:
 * b = log10(e) / (mean(M) - (Mc - dM/2)), over events at or above Mc.
 * Null when fewer than `MIN_EVENTS_FOR_B` events qualify. Also returns the
 * Shi & Bolt (1982) standard error.
 */
export function bValue(mags: number[], mc: number): { b: number; err: number; n: number } | null {
  const q = mags.filter((m) => Number.isFinite(m) && m >= mc - 1e-9);
  if (q.length < MIN_EVENTS_FOR_B) return null;
  const mean = q.reduce((s, m) => s + m, 0) / q.length;
  const spread = mean - (mc - BIN / 2);
  if (spread <= 0) return null;
  const b = Math.LOG10E / spread;
  const variance = q.reduce((s, m) => s + (m - mean) ** 2, 0) / (q.length * (q.length - 1));
  const err = 2.3 * b * b * Math.sqrt(variance);
  return { b, err, n: q.length };
}

/** Cumulative counts N(>=M) at each 0.1 step from the smallest to the largest magnitude. */
export function cumulativeCounts(mags: number[]): { mag: number; n: number }[] {
  const valid = mags.filter(Number.isFinite).map(roundBin);
  if (valid.length === 0) return [];
  const lo = Math.round(Math.min(...valid) * 10);
  const hi = Math.round(Math.max(...valid) * 10);
  const out: { mag: number; n: number }[] = [];
  for (let k = lo; k <= hi; k++) {
    const m = k / 10;
    out.push({ mag: m, n: valid.filter((v) => v >= m - 1e-9).length });
  }
  return out;
}

export type DepthBand = 'shallow' | 'intermediate' | 'deep';

/** USGS depth classes: shallow < 70 km, intermediate 70-300 km, deep > 300 km. */
export function depthBand(depthKm: number): DepthBand {
  if (depthKm < 70) return 'shallow';
  if (depthKm <= 300) return 'intermediate';
  return 'deep';
}

export interface CatalogSummary {
  count: number;
  largest: Quake | null;
  totalJoules: number;
  largestShare: number;
  feltReports: number;
  tsunamiFlags: number;
  depth: Record<DepthBand, number>;
  plateKinds: Record<string, number>;
}

export function summarizeCatalog(quakes: Quake[]): CatalogSummary {
  let largest: Quake | null = null;
  let totalJoules = 0;
  let feltReports = 0;
  let tsunamiFlags = 0;
  const depth: Record<DepthBand, number> = { shallow: 0, intermediate: 0, deep: 0 };
  const plateKinds: Record<string, number> = { subduction: 0, convergent: 0, transform: 0, divergent: 0, intraplate: 0 };
  for (const q of quakes) {
    if (!largest || q.mag > largest.mag) largest = q;
    totalJoules += magnitudeToJoules(q.mag);
    feltReports += q.felt ?? 0;
    tsunamiFlags += q.tsunami ? 1 : 0;
    depth[depthBand(q.depthKm)]++;
    plateKinds[q.plate?.kind ?? 'intraplate']++;
  }
  return {
    count: quakes.length,
    largest,
    totalJoules,
    largestShare: largest && totalJoules > 0 ? magnitudeToJoules(largest.mag) / totalJoules : 0,
    feltReports,
    tsunamiFlags,
    depth,
    plateKinds,
  };
}
