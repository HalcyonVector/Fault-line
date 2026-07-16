import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

// The quakes route keeps its cache in module-level state, so each test gets
// a fresh module instance (vi.resetModules + dynamic import) rather than
// sharing one cache across unrelated assertions.
async function freshApp() {
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

function mockUsgsResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      features: [
        {
          id: 'us1000abcd',
          geometry: { type: 'Point', coordinates: [139.69, 35.69, 45.2] },
          properties: {
            mag: 5.4,
            place: '10km E of Tokyo, Japan',
            time: 1750000000000,
            updated: 1750000100000,
            tsunami: 0,
            sig: 480,
            alert: null,
            type: 'earthquake',
          },
        },
        {
          id: 'us1000efgh',
          // Missing coordinates entirely, should be filtered out, not crash the route.
          geometry: null,
          properties: { mag: 2.1, place: 'somewhere', time: 1750000200000 },
        },
      ],
    }),
  };
}

describe('GET /api/quakes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes USGS GeoJSON features into the flat quake shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse()));
    const app = await freshApp();

    const res = await request(app).get('/api/quakes');
    expect(res.status).toBe(200);
    expect(res.body.feed).toBe('all_day');
    expect(res.body.cached).toBe(false);
    expect(res.body.quakes).toHaveLength(1); // the coordinate-less feature is dropped
    expect(res.body.quakes[0]).toMatchObject({
      id: 'us1000abcd',
      mag: 5.4,
      lon: 139.69,
      lat: 35.69,
      depthKm: 45.2,
      place: '10km E of Tokyo, Japan',
    });
  });

  it('serves a cached response on the next request without calling fetch again', async () => {
    const fetchMock = vi.fn(async () => mockUsgsResponse());
    vi.stubGlobal('fetch', fetchMock);
    const app = await freshApp();

    const first = await request(app).get('/api/quakes');
    expect(first.body.cached).toBe(false);

    const second = await request(app).get('/api/quakes');
    expect(second.body.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when the upstream USGS feed fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const app = await freshApp();

    const res = await request(app).get('/api/quakes');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('quakes_unavailable');
  });
});
