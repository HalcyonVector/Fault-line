import type { FeedRange, Quake } from '../types';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Span and bin width of the timeline strip for each feed range. */
export const RANGE_SPEC: Record<FeedRange, { spanMs: number; binMs: number; label: string }> = {
  hour: { spanMs: HOUR, binMs: 2 * MIN, label: 'Past hour' },
  day: { spanMs: 24 * HOUR, binMs: 30 * MIN, label: 'Past day' },
  week: { spanMs: 7 * 24 * HOUR, binMs: 3 * HOUR, label: 'Past week' },
  month: { spanMs: 30 * 24 * HOUR, binMs: 12 * HOUR, label: 'Past 30 days (M2.5+)' },
};

export interface TimeBin {
  start: number;
  end: number;
  count: number;
  maxMag: number;
}

/** Equal-width bins ending at `endMs`, counting events and their largest magnitude. */
export function binByTime(quakes: Quake[], endMs: number, spanMs: number, binMs: number): TimeBin[] {
  const n = Math.max(1, Math.ceil(spanMs / binMs));
  const start = endMs - n * binMs;
  const bins: TimeBin[] = Array.from({ length: n }, (_, i) => ({ start: start + i * binMs, end: start + (i + 1) * binMs, count: 0, maxMag: -Infinity }));
  for (const q of quakes) {
    if (q.time === null || q.time < start || q.time > endMs) continue;
    const i = Math.min(n - 1, Math.floor((q.time - start) / binMs));
    bins[i].count++;
    bins[i].maxMag = Math.max(bins[i].maxMag, q.mag);
  }
  return bins;
}

/** Events visible at playback cursor `cursorMs`: everything that has happened by then. */
export function visibleAt(quakes: Quake[], cursorMs: number | null): Quake[] {
  if (cursorMs === null) return quakes;
  return quakes.filter((q) => q.time !== null && q.time <= cursorMs);
}

/** Advance a playback cursor; returns null once it passes the live edge (playback finished). */
export function advanceCursor(cursorMs: number, elapsedRealMs: number, spanMs: number, playSeconds: number, liveEdgeMs: number): number | null {
  const next = cursorMs + (spanMs / (playSeconds * 1000)) * elapsedRealMs;
  return next >= liveEdgeMs ? null : next;
}
