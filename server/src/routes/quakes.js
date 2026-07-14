import { Router } from 'express';

const router = Router();

// USGS updates the summary feeds roughly every minute. `all_day` gives a
// meaningful rolling window for the unrest index (enough quakes to feel
// alive) without being as sparse as `all_hour` on a quiet day. See the
// README's "Data Source" section for the full rationale.
const FEED = process.env.USGS_FEED ?? 'all_day';
const USGS_URL = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${FEED}.geojson`;

// In-memory cache so bursty client polling never hammers USGS. A 35s TTL is
// comfortably below USGS's own ~60s update cadence, so cached responses are
// never staler than the upstream data actually is.
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

router.get('/', async (_req, res) => {
  try {
    if (cache && cache.expires > Date.now()) {
      return res.json({ ...cache.payload, cached: true });
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
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[quakes] failed:', err.message);
    res.status(502).json({ error: 'quakes_unavailable', message: err.message });
  }
});

export default router;
