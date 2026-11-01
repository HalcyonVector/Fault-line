// Per-event USGS products (ShakeMap contours, "Did You Feel It?" grid) and
// archive searches, both through the FDSN event web service.
import { normalizeFeature, withPlate } from './usgsFeed.js';

export const FDSN_URL = (process.env.USGS_FDSN_URL ?? 'https://earthquake.usgs.gov/fdsnws/event/1').replace(/\/$/, '');

// Product files are only ever fetched from USGS itself (or from the configured
// FDSN host, so a local mirror works). Anything else in a detail response is ignored.
const ALLOWED_HOSTS = new Set(['earthquake.usgs.gov', new URL(FDSN_URL).host]);

const round = (v) => Math.round(v * 1000) / 1000;
const ttlCache = new Map();

async function cached(key, ttlMs, load) {
  const hit = ttlCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  if (ttlCache.size > 300) ttlCache.delete(ttlCache.keys().next().value);
  ttlCache.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

async function getJson(url, timeoutMs = 12_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 204) return null;
  if (!res.ok) throw Object.assign(new Error(`USGS responded ${res.status}`), { upstreamStatus: res.status });
  return res.json();
}

function safeProductUrl(url) {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.has(u.host) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The preferred (first) product of a type from an event detail response. */
function product(detail, type) {
  return detail?.properties?.products?.[type]?.[0] ?? null;
}

/** ShakeMap MMI contours: [{ mmi, lines: [[[lon, lat], ...], ...] }], one entry per intensity level. */
export function parseShakeMapContours(geojson) {
  const out = [];
  for (const f of geojson?.features ?? []) {
    const mmi = Number(f?.properties?.value);
    const g = f?.geometry;
    if (!Number.isFinite(mmi) || !g) continue;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    const clean = lines.map((l) => l.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])).map(([x, y]) => [round(x), round(y)])).filter((l) => l.length > 1);
    if (clean.length) out.push({ mmi, lines: clean });
  }
  return out.sort((a, b) => a.mmi - b.mmi);
}

/** DYFI aggregated cells: [{ cdi, responses, distanceKm, ring: [[lon, lat], ...] }]. */
export function parseDyfiCells(geojson) {
  const out = [];
  for (const f of geojson?.features ?? []) {
    const p = f?.properties ?? {};
    const cdi = Number(p.cdi);
    const ring = f?.geometry?.type === 'Polygon' ? f.geometry.coordinates?.[0] : null;
    if (!Number.isFinite(cdi) || !Array.isArray(ring) || ring.length < 3) continue;
    const pts = ring.map(([x, y]) => [round(x), round(y)]);
    // USGS DYFI cells come as four corners without repeating the first; GeoJSON
    // (and d3) need closed rings, or the square renders as a sliver.
    const [fx, fy] = pts[0];
    const [lx, ly] = pts[pts.length - 1];
    if (fx !== lx || fy !== ly) pts.push([fx, fy]);
    out.push({ cdi, responses: Number(p.nresp) || 0, distanceKm: Number.isFinite(Number(p.dist)) ? Number(p.dist) : null, ring: pts });
  }
  return out;
}

/**
 * Observed shaking for one event: ShakeMap contours and DYFI cells when USGS
 * has produced them, null for each when it hasn't. Cached for 10 minutes;
 * both products are revised in the first hours after a quake.
 */
export async function fetchObserved(eventId) {
  return cached(`observed:${eventId}`, 10 * 60_000, async () => {
    const detail = await getJson(`${FDSN_URL}/query?eventid=${encodeURIComponent(eventId)}&format=geojson`);
    if (!detail) return { eventId, shakemap: null, dyfi: null };

    const sm = product(detail, 'shakemap');
    const dy = product(detail, 'dyfi');
    const smUrl = safeProductUrl(sm?.contents?.['download/cont_mmi.json']?.url);
    const dyUrl = safeProductUrl(dy?.contents?.['dyfi_geo_10km.geojson']?.url ?? dy?.contents?.['dyfi_geo_1km.geojson']?.url);

    const [smJson, dyJson] = await Promise.all([
      smUrl ? getJson(smUrl).catch(() => null) : null,
      dyUrl ? getJson(dyUrl).catch(() => null) : null,
    ]);

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      eventId,
      shakemap: smJson
        ? { maxMmi: num(sm.properties?.maxmmi), contours: parseShakeMapContours(smJson), url: detail.properties?.url ? `${detail.properties.url}/shakemap` : null }
        : null,
      dyfi: dyJson
        ? { maxCdi: num(dy.properties?.maxmmi), responses: num(dy.properties?.numResp ?? dy.properties?.['num-responses']), cells: parseDyfiCells(dyJson), url: detail.properties?.url ? `${detail.properties.url}/dyfi` : null }
        : null,
    };
  });
}

/** Validated archive query → FDSN query string. Throws with status 400 on bad input. */
export function buildArchiveQuery(q) {
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  const date = (v, name) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad(`${name} must be YYYY-MM-DD`);
    return v;
  };
  const number = (v, name, lo, hi) => {
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw bad(`${name} must be between ${lo} and ${hi}`);
    return n;
  };

  const start = date(q.start, 'start');
  const end = date(q.end, 'end');
  if (Date.parse(end) < Date.parse(start)) throw bad('end must be after start');
  if (Date.parse(start) < Date.parse('1900-01-01')) throw bad('start must be 1900 or later');

  const params = new URLSearchParams({ format: 'geojson', starttime: start, endtime: `${end}T23:59:59`, eventtype: 'earthquake' });
  const minmag = number(q.minmag, 'minmag', 0, 10);
  const maxmag = number(q.maxmag, 'maxmag', 0, 10);
  const lat = number(q.lat, 'lat', -90, 90);
  const lon = number(q.lon, 'lon', -180, 180);
  const radiusKm = number(q.radiusKm, 'radiusKm', 1, 20_001.6);
  const limit = number(q.limit, 'limit', 1, 2000) ?? 500;
  const orderby = q.orderby === 'time' ? 'time' : 'magnitude';

  if (minmag !== undefined) params.set('minmagnitude', String(minmag));
  if (maxmag !== undefined) params.set('maxmagnitude', String(maxmag));
  if ((lat === undefined) !== (lon === undefined) || (lat !== undefined && radiusKm === undefined)) {
    throw bad('lat, lon and radiusKm go together');
  }
  if (lat !== undefined) {
    params.set('latitude', String(lat));
    params.set('longitude', String(lon));
    params.set('maxradiuskm', String(radiusKm));
  }
  params.set('orderby', orderby);
  params.set('limit', String(Math.round(limit)));
  return params;
}

/** Run an archive search. Results are cached for an hour; the past rarely changes. */
export async function searchArchive(query) {
  const params = buildArchiveQuery(query);
  const key = `archive:${params}`;
  return cached(key, 60 * 60_000, async () => {
    let data;
    try {
      data = await getJson(`${FDSN_URL}/query?${params}`, 25_000);
    } catch (err) {
      // FDSN answers 400 for queries it refuses, e.g. more than 20,000 matches before the limit.
      if (err.upstreamStatus === 400) throw Object.assign(new Error('USGS rejected that search. Try a narrower date range or a higher magnitude.'), { status: 400 });
      throw err;
    }
    const quakes = (data?.features ?? []).map(normalizeFeature).filter(Boolean).map(withPlate);
    const limit = Number(params.get('limit'));
    return { quakes, count: quakes.length, truncated: quakes.length >= limit, query: Object.fromEntries(params) };
  });
}
