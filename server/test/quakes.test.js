import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

// The feed cache is module-level state, so each test gets a fresh module graph.
async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

function usgsPayload() {
  return {
    metadata: { generated: 1750000300000 },
    features: [
      {
        id: 'us1000abcd',
        geometry: { type: 'Point', coordinates: [142.37, 38.3, 29] }, // off Tohoku, on the Japan Trench
        properties: { mag: 6.1, magType: 'mww', place: 'off the east coast of Honshu, Japan', time: 1750000000000, tsunami: 1, sig: 572, alert: 'green', url: 'https://earthquake.usgs.gov/x', felt: 120, type: 'earthquake' },
      },
      {
        id: 'nc2',
        geometry: { type: 'Point', coordinates: [-98.0, 40.0, 5] }, // central Nebraska, intraplate
        properties: { mag: 2.6, place: 'Nebraska', time: 1750000200000 },
      },
      { id: 'bad1', geometry: null, properties: { mag: 2.1, time: 1 } },
      { id: 'bad2', geometry: { coordinates: [200, 10, 1] }, properties: { mag: 2.1, time: 1 } },
    ],
  };
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe('GET /api/quakes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes features, drops invalid ones, sorts newest first and attaches plate context', async () => {
    const fetchMock = vi.fn(async () => ok(usgsPayload()));
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();

    const res = await request(app).get('/api/quakes');
    expect(res.status).toBe(200);
    expect(res.body.range).toBe('day');
    expect(res.body.feed).toBe('all_day');
    expect(fetchMock.mock.calls[0][0]).toMatch(/all_day\.geojson$/);
    expect(res.body.quakes.map((q) => q.id)).toEqual(['nc2', 'us1000abcd']);

    const tohoku = res.body.quakes[1];
    expect(tohoku).toMatchObject({ mag: 6.1, magType: 'mww', tsunami: 1, felt: 120, alert: 'green', depthKm: 29 });
    expect(tohoku.plate.kind).toBe('subduction');
    expect(tohoku.plate.subducting).toBe('Pacific');

    expect(res.body.quakes[0].plate).toBeNull();
  });

  it('maps each range to its USGS feed', async () => {
    const fetchMock = vi.fn(async () => ok(usgsPayload()));
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();
    await request(app).get('/api/quakes?range=week');
    await request(app).get('/api/quakes?range=month');
    expect(fetchMock.mock.calls[0][0]).toMatch(/all_week\.geojson$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/2\.5_month\.geojson$/);
  });

  it('rejects an unknown range with 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const app = await freshApp();
    const res = await request(app).get('/api/quakes?range=decade');
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves the cached copy within the TTL', async () => {
    const fetchMock = vi.fn(async () => ok(usgsPayload()));
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();
    expect((await request(app).get('/api/quakes')).body.cached).toBe(false);
    expect((await request(app).get('/api/quakes')).body.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the last good copy, flagged stale, when a refresh fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const fetchMock = vi.fn(async () => ok(usgsPayload()));
      vi.stubGlobal('fetch', fetchMock);
      const app = await freshApp();
      await request(app).get('/api/quakes');

      fetchMock.mockImplementation(async () => ({ ok: false, status: 503 }));
      vi.setSystemTime(Date.now() + 10 * 60_000);
      const res = await request(app).get('/api/quakes');
      expect(res.status).toBe(200);
      expect(res.body.stale).toBe(true);
      expect(res.body.quakes).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 502 when USGS fails and nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const app = await freshApp();
    const res = await request(app).get('/api/quakes');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('quakes_unavailable');
  });

  it('404s unknown API routes as JSON', async () => {
    const app = await freshApp();
    const res = await request(app).get('/api/world');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
