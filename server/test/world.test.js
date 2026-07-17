import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmpDir;
let fileCounter = 0;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'fault-line-world-'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.WORLD_DATA_FILE;
});

// Each test gets its own throwaway world.json and a fresh module registry
// (the USGS fetch cache and the file-path constants are module-level state),
// mirroring the isolation pattern in quakes.test.js and presets.test.js.
async function freshApp() {
  fileCounter += 1;
  process.env.WORLD_DATA_FILE = path.join(tmpDir, `world-${fileCounter}.json`);
  vi.resetModules();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

function mockUsgsResponse(features) {
  return { ok: true, status: 200, json: async () => ({ features }) };
}

function quakeFeature({ id, mag, lon, lat, depthKm = 10, sig = 0, time = Date.now() }) {
  return {
    id,
    geometry: { type: 'Point', coordinates: [lon, lat, depthKm] },
    properties: { mag, place: 'test', time, updated: time, tsunami: 0, sig, alert: null, type: 'earthquake' },
  };
}

describe('GET /api/world', () => {
  it('returns the 6-site portfolio with starting budget and empty ledger when no quakes are near anything', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const res = await request(app).get('/api/world');
    expect(res.status).toBe(200);
    expect(res.body.sites).toHaveLength(6);
    expect(res.body.budget.value).toBe(100);
    expect(res.body.ledgerCount).toBe(0);
    expect(res.body.ledger).toBeUndefined(); // full history lives behind GET /api/world/ledger now, not the main snapshot
    expect(res.body.activeAftershockWindow).toBeNull();

    const ids = res.body.sites.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(['san-francisco', 'tokyo', 'istanbul', 'kathmandu', 'santiago', 'wellington']),
    );
    for (const site of res.body.sites) {
      expect(site.overduePressure.raw).toBeGreaterThan(0);
      expect(typeof site.faultSystem).toBe('string');
    }
  });

  it('logs a quake-impact ledger entry and reduces site health for a strong nearby quake', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockUsgsResponse([quakeFeature({ id: 'sf-strike', mag: 7.2, lon: -122.42, lat: 37.78, depthKm: 8, sig: 900 })]),
      ),
    );
    const app = await freshApp();

    const res = await request(app).get('/api/world');
    expect(res.body.ledgerCount).toBeGreaterThan(0);

    const ledgerRes = await request(app).get('/api/world/ledger');
    const impactEntries = ledgerRes.body.entries.filter((e) => e.type === 'quake-impact');
    expect(impactEntries.length).toBeGreaterThan(0);

    const sf = res.body.sites.find((s) => s.id === 'san-francisco');
    expect(sf.health).toBeLessThan(100);
  });

  it('does not log an impact for a distant, weak quake', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'far-weak', mag: 2.1, lon: 0, lat: 0, depthKm: 10 })])),
    );
    const app = await freshApp();

    const res = await request(app).get('/api/world');
    expect(res.body.ledgerCount).toBe(0);
    const ledgerRes = await request(app).get('/api/world/ledger');
    expect(ledgerRes.body.entries.filter((e) => e.type === 'quake-impact')).toEqual([]);
  });

  it('opens an aftershock decision window for a magnitude >= 6 mainshock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'big-one', mag: 6.8, lon: 139.7, lat: 35.7, sig: 850 })])),
    );
    const app = await freshApp();

    const res = await request(app).get('/api/world');
    expect(res.body.activeAftershockWindow).not.toBeNull();
    expect(res.body.activeAftershockWindow.mainshockQuakeId).toBe('big-one');
    expect(res.body.activeAftershockWindow.expiresAt).toBeGreaterThan(Date.now());
  });

  it('does not open a window for an insignificant quake', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'small', mag: 4.0, lon: 139.7, lat: 35.7, sig: 100 })])),
    );
    const app = await freshApp();

    const res = await request(app).get('/api/world');
    expect(res.body.activeAftershockWindow).toBeNull();
  });

  it('survives a burst of concurrent requests without a torn-file crash', async () => {
    // This is the exact shape of the bug this test guards against: before the
    // shared file's read-modify-write was serialized via worldStore.transact,
    // overlapping GET /api/world calls (two tabs, dev-mode double polling,
    // etc.) could race to write world.json, occasionally leaving it
    // truncated/invalid and crashing the whole process on the next read.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'burst-quake', mag: 5.5, lon: -122.4, lat: 37.8 })])),
    );
    const app = await freshApp();

    const responses = await Promise.all(Array.from({ length: 15 }, () => request(app).get('/api/world')));
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.sites).toHaveLength(6);
    }
  });

  it('finalizes an expired window into the ledger and clears it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'expiring', mag: 6.5, lon: 28.9, lat: 41.0, sig: 800 })])),
    );
    const app = await freshApp();

    const opened = await request(app).get('/api/world');
    expect(opened.body.activeAftershockWindow).not.toBeNull();

    vi.setSystemTime(new Date('2026-01-01T00:02:00Z')); // well past the ~75s window

    const closed = await request(app).get('/api/world');
    expect(closed.body.activeAftershockWindow).toBeNull();
    const closedLedger = await request(app).get('/api/world/ledger');
    const windowEntries = closedLedger.body.entries.filter((e) => e.type === 'aftershock-window');
    expect(windowEntries).toHaveLength(1);
    expect(windowEntries[0].mainshockQuakeId).toBe('expiring');
    expect(windowEntries[0].committed).toBeNull();
  });
});

describe('GET /api/world/ledger', () => {
  it('returns an empty page when nothing has happened yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const res = await request(app).get('/api/world/ledger');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [], hasMore: false, nextCursor: null, totalMatching: 0 });
  });

  it('pages through entries newest-first using the returned cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mockUsgsResponse([
          quakeFeature({ id: 'q1', mag: 6.0, lon: -122.42, lat: 37.78, sig: 700 }),
          quakeFeature({ id: 'q2', mag: 6.5, lon: -122.42, lat: 37.78, sig: 750 }),
        ]),
      ),
    );
    const app = await freshApp();
    await request(app).get('/api/world'); // ingest

    const page1 = await request(app).get('/api/world/ledger?limit=1');
    expect(page1.status).toBe(200);
    expect(page1.body.entries).toHaveLength(1);
    expect(page1.body.totalMatching).toBeGreaterThanOrEqual(2);

    if (page1.body.hasMore) {
      const page2 = await request(app).get(`/api/world/ledger?limit=1&cursor=${encodeURIComponent(page1.body.nextCursor)}`);
      expect(page2.status).toBe(200);
      expect(page2.body.entries[0].id).not.toBe(page1.body.entries[0].id);
    }
  });

  it('filters to a single site', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'sf-only', mag: 7.0, lon: -122.42, lat: 37.78, sig: 900 })])),
    );
    const app = await freshApp();
    await request(app).get('/api/world');

    const sfRes = await request(app).get('/api/world/ledger?siteId=san-francisco');
    expect(sfRes.body.entries.every((e) => e.siteId === 'san-francisco' || e.nearestSiteId === 'san-francisco')).toBe(true);

    const tokyoRes = await request(app).get('/api/world/ledger?siteId=tokyo');
    expect(tokyoRes.body.entries).toEqual([]);
  });

  it('rejects an unknown site filter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const res = await request(app).get('/api/world/ledger?siteId=atlantis');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_site');
  });
});

describe('POST /api/world/allocate', () => {
  it('spends budget and raises the target site resilience', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const before = await request(app).get('/api/world');
    const startingResilience = before.body.sites.find((s) => s.id === 'wellington').resilience;

    const res = await request(app).post('/api/world/allocate').send({ siteId: 'wellington', amount: 15 });
    expect(res.status).toBe(200);
    expect(res.body.budget.value).toBe(85);
    expect(res.body.sites.find((s) => s.id === 'wellington').resilience).toBe(startingResilience + 15);
  });

  it('rejects an unknown site', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const res = await request(app).post('/api/world/allocate').send({ siteId: 'atlantis', amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_site');
  });

  it('rejects spending more than the available budget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const res = await request(app).post('/api/world/allocate').send({ siteId: 'wellington', amount: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('insufficient_budget');
  });

  it('rejects a non-positive amount', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const res = await request(app).post('/api/world/allocate').send({ siteId: 'wellington', amount: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_amount');
  });
});

describe('POST /api/world/commit-aftershock-response', () => {
  it('rejects a commitment when no window is open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockUsgsResponse([])));
    const app = await freshApp();

    const res = await request(app).post('/api/world/commit-aftershock-response').send({ siteId: 'tokyo', amount: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('no_active_window');
  });

  it('commits budget to a site while a window is open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'mainshock-1', mag: 7.0, lon: 85.3, lat: 27.7, sig: 900 })])),
    );
    const app = await freshApp();

    await request(app).get('/api/world'); // opens the window

    const res = await request(app).post('/api/world/commit-aftershock-response').send({ siteId: 'kathmandu', amount: 20 });
    expect(res.status).toBe(200);
    expect(res.body.activeAftershockWindow.committed).toMatchObject({ siteId: 'kathmandu', amount: 20 });
    expect(res.body.budget.value).toBe(80);
  });

  it('rejects a second commitment on the same window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockUsgsResponse([quakeFeature({ id: 'mainshock-2', mag: 7.0, lon: 85.3, lat: 27.7, sig: 900 })])),
    );
    const app = await freshApp();

    await request(app).get('/api/world');
    await request(app).post('/api/world/commit-aftershock-response').send({ siteId: 'kathmandu', amount: 10 });
    const res = await request(app).post('/api/world/commit-aftershock-response').send({ siteId: 'kathmandu', amount: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_committed');
  });
});
