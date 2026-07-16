// Shared USGS GeoJSON summary-feed fetch + normalize + cache, used by both
// the /api/quakes proxy route and the world engine's quake ingestion. Pulled
// out of routes/quakes.js so both consumers share one cache instead of each
// hitting USGS independently.

// USGS updates the summary feeds roughly every minute. `all_day` gives a
// meaningful rolling window (enough quakes to feel alive) without being as
// sparse as `all_hour` on a quiet day. See the README's "Data Source" section.
export const FEED = process.env.USGS_FEED ?? 'all_day';
const USGS_URL = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${FEED}.geojson`;

// In-memory cache so bursty polling (from clients or the world engine) never
// hammers USGS. A 35s TTL is comfortably below USGS's own ~60s update cadence.
const CACHE_MS = 35 * 1000;
let cache = null; // { expires, payload }

function normalizeFeature(feature) {
  const [lon, lat, depthKm] = feature.geometry?.coordinates ?? [null, null, null];
  const p = feature.properties ?? {};
  return {
    id: feature.id,
    mag: typeof p.mag === 'number' ? p.mag : 0,
    place: p.place ?? 'Unknown location',
    time: p.time ?? null,
    updated: p.updated ?? null,
    tsunami: p.tsunami ?? 0,
    sig: p.sig ?? 0,
    alert: p.alert ?? null,
    type: p.type ?? 'earthquake',
    lon,
    lat,
    depthKm,
  };
}

/**
 * Returns `{ quakes, feed, fetchedAt, cached }`. Throws on upstream failure
 * (callers decide how to surface that — the route returns 502, the world
 * engine just skips this ingestion pass and tries again next time it's read).
 */
export async function fetchQuakes() {
  if (cache && cache.expires > Date.now()) {
    return { ...cache.payload, cached: true };
  }

  const response = await fetch(USGS_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`USGS responded ${response.status}`);
  const data = await response.json();

  const quakes = (data.features ?? [])
    .map(normalizeFeature)
    .filter((q) => typeof q.lon === 'number' && typeof q.lat === 'number');

  const payload = {
    quakes,
    feed: FEED,
    fetchedAt: new Date().toISOString(),
  };

  cache = { expires: Date.now() + CACHE_MS, payload };
  return { ...payload, cached: false };
}
