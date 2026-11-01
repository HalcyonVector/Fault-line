import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { buildArchiveQuery, parseShakeMapContours, parseDyfiCells } from '../src/lib/usgsEvent.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

describe('parsers (real USGS samples)', () => {
  it('reads ShakeMap MMI contours, sorted by level', () => {
    const c = parseShakeMapContours(fixture('cont_mmi.json'));
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].mmi).toBe(2);
    for (let i = 1; i < c.length; i++) expect(c[i].mmi).toBeGreaterThanOrEqual(c[i - 1].mmi);
    expect(c[0].lines[0][0]).toHaveLength(2);
  });
  it('reads DYFI cells with intensity and response counts', () => {
    const cells = parseDyfiCells(fixture('dyfi_geo_10km.json'));
    expect(cells).toHaveLength(5);
    expect(cells[0]).toMatchObject({ cdi: expect.any(Number), responses: expect.any(Number) });
    expect(cells[0].ring.length).toBeGreaterThanOrEqual(4);
  });
  it('closes the unclosed four-corner rings USGS publishes', () => {
    const raw = fixture('dyfi_geo_10km.json').features[0].geometry.coordinates[0];
    expect(raw).toHaveLength(4);
    const ring = parseDyfiCells(fixture('dyfi_geo_10km.json'))[0].ring;
    expect(ring).toHaveLength(5);
    expect(ring[4]).toEqual(ring[0]);
  });
  it('skips malformed features instead of throwing', () => {
    expect(parseShakeMapContours({ features: [{ properties: {}, geometry: null }, null] })).toEqual([]);
    expect(parseDyfiCells({ features: [{ properties: { cdi: 'x' } }] })).toEqual([]);
    expect(parseDyfiCells(null)).toEqual([]);
  });
});

describe('GET /api/quakes/:id/observed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows the detail response to the ShakeMap and DYFI products', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/query?eventid=us6000pi9w')) return ok(fixture('detail.json'));
      if (url.endsWith('cont_mmi.json')) return ok(fixture('cont_mmi.json'));
      if (url.endsWith('dyfi_geo_10km.geojson')) return ok(fixture('dyfi_geo_10km.json'));
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();
    const res = await request(app).get('/api/quakes/us6000pi9w/observed');
    expect(res.status).toBe(200);
    expect(res.body.shakemap.maxMmi).toBeCloseTo(9.212);
    expect(res.body.shakemap.contours.length).toBeGreaterThan(0);
    expect(res.body.dyfi).toMatchObject({ maxCdi: 9.1, responses: 858 });
    expect(res.body.dyfi.cells).toHaveLength(5);

    await request(app).get('/api/quakes/us6000pi9w/observed');
    expect(fetchMock).toHaveBeenCalledTimes(3); // second request served from cache
  });

  it('never fetches product URLs on other hosts', async () => {
    const detail = fixture('detail.json');
    detail.properties.products.shakemap[0].contents['download/cont_mmi.json'].url = 'http://169.254.169.254/latest/meta-data';
    const fetchMock = vi.fn(async (url) => (url.includes('/query?') ? ok(detail) : ok(fixture('dyfi_geo_10km.json'))));
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();
    const res = await request(app).get('/api/quakes/us6000pi9w/observed');
    expect(res.body.shakemap).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => u.includes('169.254'))).toBe(false);
  });

  it('returns nulls for an event without products and rejects junk ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ properties: { products: {} } })));
    const app = await freshApp();
    expect((await request(app).get('/api/quakes/nc123456/observed')).body).toMatchObject({ shakemap: null, dyfi: null });
    expect((await request(app).get('/api/quakes/..%2Fetc/observed')).status).toBe(400);
  });
});

describe('archive', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds an FDSN query from validated input', () => {
    const p = buildArchiveQuery({ start: '1900-01-01', end: '2026-10-31', minmag: '8' });
    expect(p.get('starttime')).toBe('1900-01-01');
    expect(p.get('endtime')).toBe('2026-10-31T23:59:59');
    expect(p.get('minmagnitude')).toBe('8');
    expect(p.get('orderby')).toBe('magnitude');
    expect(p.get('limit')).toBe('500');
    const near = buildArchiveQuery({ start: '2000-01-01', end: '2001-01-01', lat: '35.7', lon: '139.7', radiusKm: '300', orderby: 'time', limit: '2000' });
    expect(near.get('maxradiuskm')).toBe('300');
    expect(near.get('orderby')).toBe('time');
  });

  it('rejects bad input', () => {
    expect(() => buildArchiveQuery({ start: 'yesterday', end: '2020-01-01' })).toThrow(/YYYY-MM-DD/);
    expect(() => buildArchiveQuery({ start: '2020-01-02', end: '2020-01-01' })).toThrow(/after start/);
    expect(() => buildArchiveQuery({ start: '1800-01-01', end: '2020-01-01' })).toThrow(/1900/);
    expect(() => buildArchiveQuery({ start: '2020-01-01', end: '2020-02-01', lat: '10' })).toThrow(/go together/);
    expect(() => buildArchiveQuery({ start: '2020-01-01', end: '2020-02-01', minmag: '11' })).toThrow(/between/);
    expect(() => buildArchiveQuery({ start: '2020-01-01', end: '2020-02-01', limit: '99999' })).toThrow(/between/);
  });

  it('GET /api/archive normalizes results and flags truncation', async () => {
    const features = Array.from({ length: 3 }, (_, i) => ({
      id: `us${i}`, geometry: { coordinates: [-72.7, -36.1, 30] }, properties: { mag: 8 + i / 10, time: 1_000_000 + i, place: 'Chile' },
    }));
    const fetchMock = vi.fn(async () => ok({ features }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();
    const res = await request(app).get('/api/archive?start=1900-01-01&end=2026-01-01&minmag=8&limit=3');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.truncated).toBe(true);
    expect(res.body.quakes[0].plate.kind).toBe('subduction');
    expect(fetchMock.mock.calls[0][0]).toMatch(/fdsnws\/event\/1\/query\?format=geojson/);
  });

  it('turns an FDSN refusal into a friendly 400 and bad input into 400 without calling USGS', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();
    const refused = await request(app).get('/api/archive?start=1900-01-01&end=2026-01-01&minmag=1');
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/narrower/);
    const bad = await request(app).get('/api/archive?start=nope&end=2026-01-01');
    expect(bad.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats 204 No Content as an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })));
    const app = await freshApp();
    const res = await request(app).get('/api/archive?start=2020-01-01&end=2020-01-02&minmag=9');
    expect(res.body).toMatchObject({ count: 0, truncated: false });
  });
});
