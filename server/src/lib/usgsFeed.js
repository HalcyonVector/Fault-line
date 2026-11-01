// USGS GeoJSON summary-feed fetch, normalize and cache.
import { classifyPoint } from './plates.js';

/** The time windows the client can ask for, and the USGS summary feed behind each. */
export const RANGES = {
  hour: { feed: 'all_hour', ttlMs: 30_000 },
  day: { feed: 'all_day', ttlMs: 45_000 },
  week: { feed: 'all_week', ttlMs: 60_000 },
  // The full all_month feed is ~10k events and several MB; M2.5+ keeps the month view light and meaningful.
  month: { feed: '2.5_month', ttlMs: 5 * 60_000 },
};
export const DEFAULT_RANGE = 'day';

const BASE_URL = (process.env.USGS_BASE_URL ?? 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary').replace(/\/$/, '');

// Per-range cache. Entries are kept after they expire so a failed refresh can
// fall back to the last good payload (flagged `stale`) instead of a hard error.
const cache = new Map(); // range -> { expires, payload }
// Plate classification is deterministic per event location, so memoize it across refreshes.
const plateMemo = new Map();

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeFeature(feature) {
  const [lon, lat, depth] = feature?.geometry?.coordinates ?? [];
  const p = feature?.properties ?? {};
  if (num(lon) === null || num(lat) === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    id: String(feature.id),
    mag: num(p.mag) ?? 0,
    magType: p.magType ?? null,
    place: p.place || p.title || 'Unknown location',
    time: num(p.time),
    updated: num(p.updated),
    url: p.url ?? null,
    felt: num(p.felt),
    cdi: num(p.cdi),
    mmi: num(p.mmi),
    alert: p.alert ?? null,
    status: p.status ?? null,
    tsunami: p.tsunami ? 1 : 0,
    sig: num(p.sig) ?? 0,
    net: p.net ?? null,
    type: p.type ?? 'earthquake',
    lon,
    lat,
    depthKm: num(depth) ?? 0,
  };
}

function withPlate(q) {
  const key = `${q.lon.toFixed(2)},${q.lat.toFixed(2)}`;
  if (!plateMemo.has(key)) {
    if (plateMemo.size > 50_000) plateMemo.clear();
    plateMemo.set(key, classifyPoint(q.lon, q.lat));
  }
  return { ...q, plate: plateMemo.get(key) };
}

/**
 * Returns `{ range, feed, quakes, generatedAt, fetchedAt, cached, stale }`.
 * Throws only when USGS fails and there is no earlier payload to fall back on.
 */
export async function fetchQuakes(range = DEFAULT_RANGE) {
  const cfg = RANGES[range];
  if (!cfg) throw Object.assign(new Error(`Unknown range "${range}"`), { status: 400 });

  const hit = cache.get(range);
  if (hit && hit.expires > Date.now()) return { ...hit.payload, cached: true, stale: false };

  try {
    const response = await fetch(`${BASE_URL}/${cfg.feed}.geojson`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`USGS responded ${response.status}`);
    const data = await response.json();
    const quakes = (data.features ?? [])
      .map(normalizeFeature)
      .filter(Boolean)
      .map(withPlate)
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    const payload = {
      range,
      feed: cfg.feed,
      quakes,
      generatedAt: num(data.metadata?.generated),
      fetchedAt: new Date().toISOString(),
    };
    cache.set(range, { expires: Date.now() + cfg.ttlMs, payload });
    return { ...payload, cached: false, stale: false };
  } catch (err) {
    if (hit) {
      console.warn(`[usgs] ${cfg.feed} refresh failed (${err.message}); serving last good copy`);
      return { ...hit.payload, cached: true, stale: true };
    }
    throw err;
  }
}
