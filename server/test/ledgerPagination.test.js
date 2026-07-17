import { describe, it, expect } from 'vitest';
import { ledgerEntrySiteId, paginateLedger } from '../src/lib/ledgerPagination.js';

function impact(siteId, resolvedAt, id) {
  return {
    id,
    type: 'quake-impact',
    quakeId: `q-${id}`,
    siteId,
    magnitude: 5,
    depthKm: 10,
    distanceKm: 100,
    intensity: 4,
    damage: 3,
    resolvedAt,
  };
}

function window(nearestSiteId, resolvedAt, id) {
  return {
    id,
    type: 'aftershock-window',
    mainshockQuakeId: `m-${id}`,
    mainshockMagnitude: 7,
    mainshockSig: 800,
    nearestSiteId,
    nearestSiteDistanceKm: nearestSiteId ? 50 : null,
    opensAt: 0,
    expiresAt: 75000,
    committed: null,
    resolvedAt,
  };
}

describe('ledgerEntrySiteId', () => {
  it('reads siteId off a quake-impact entry and nearestSiteId off an aftershock-window entry', () => {
    expect(ledgerEntrySiteId(impact('tokyo', '2026-01-01T00:00:00Z', 'a'))).toBe('tokyo');
    expect(ledgerEntrySiteId(window('istanbul', '2026-01-01T00:00:00Z', 'b'))).toBe('istanbul');
    expect(ledgerEntrySiteId(window(null, '2026-01-01T00:00:00Z', 'c'))).toBeNull();
  });
});

describe('paginateLedger', () => {
  it('returns newest first', () => {
    const ledger = [
      impact('tokyo', '2026-01-01T00:00:00Z', 'oldest'),
      impact('tokyo', '2026-01-03T00:00:00Z', 'newest'),
      impact('tokyo', '2026-01-02T00:00:00Z', 'middle'),
    ];
    const { entries } = paginateLedger(ledger, { limit: 10 });
    expect(entries.map((e) => e.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('filters to a single site across both entry shapes', () => {
    const ledger = [
      impact('tokyo', '2026-01-01T00:00:00Z', 'a'),
      impact('santiago', '2026-01-01T01:00:00Z', 'b'),
      window('tokyo', '2026-01-01T02:00:00Z', 'c'),
      window(null, '2026-01-01T03:00:00Z', 'd'),
    ];
    const { entries, totalMatching } = paginateLedger(ledger, { siteId: 'tokyo', limit: 10 });
    expect(entries.map((e) => e.id)).toEqual(['c', 'a']);
    expect(totalMatching).toBe(2);
  });

  it('reports hasMore and a usable nextCursor when the ledger exceeds the page size', () => {
    const ledger = Array.from({ length: 5 }, (_, i) =>
      impact('tokyo', `2026-01-0${i + 1}T00:00:00Z`, `id-${i}`),
    );
    const page1 = paginateLedger(ledger, { limit: 2 });
    expect(page1.entries.map((e) => e.id)).toEqual(['id-4', 'id-3']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = paginateLedger(ledger, { limit: 2, cursor: page1.nextCursor });
    expect(page2.entries.map((e) => e.id)).toEqual(['id-2', 'id-1']);
    expect(page2.hasMore).toBe(true);

    const page3 = paginateLedger(ledger, { limit: 2, cursor: page2.nextCursor });
    expect(page3.entries.map((e) => e.id)).toEqual(['id-0']);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).not.toBeNull(); // still a valid key, just nothing left after it
  });

  it('breaks ties correctly when multiple entries share the exact same resolvedAt', () => {
    // Every impact from one ingestion pass shares one timestamp (see worldEngine.js).
    const ledger = [
      impact('a', '2026-01-01T00:00:00Z', 'x'),
      impact('b', '2026-01-01T00:00:00Z', 'y'),
      impact('c', '2026-01-01T00:00:00Z', 'z'),
    ];
    const page1 = paginateLedger(ledger, { limit: 1 });
    const page2 = paginateLedger(ledger, { limit: 1, cursor: page1.nextCursor });
    const page3 = paginateLedger(ledger, { limit: 1, cursor: page2.nextCursor });
    const seenIds = [page1, page2, page3].map((p) => p.entries[0].id);
    // No entry skipped, none repeated, all three eventually surface exactly once.
    expect(new Set(seenIds).size).toBe(3);
    expect(page3.hasMore).toBe(false);
  });

  it('returns an empty page for an unknown cursor rather than restarting from the top', () => {
    const ledger = [impact('tokyo', '2026-01-01T00:00:00Z', 'a')];
    const { entries, hasMore } = paginateLedger(ledger, { cursor: 'not-a-real-cursor|zzz' });
    expect(entries).toEqual([]);
    expect(hasMore).toBe(false);
  });

  it('handles an empty ledger', () => {
    expect(paginateLedger([], { limit: 10 })).toEqual({
      entries: [],
      hasMore: false,
      nextCursor: null,
      totalMatching: 0,
    });
  });

  it('clamps an out-of-range limit to a sane maximum', () => {
    const ledger = Array.from({ length: 150 }, (_, i) => impact('tokyo', '2026-01-01T00:00:00Z', `id-${i}`));
    const { entries } = paginateLedger(ledger, { limit: 10000 });
    expect(entries.length).toBe(100);
  });

  it('falls back to the default limit for a non-positive or non-numeric limit', () => {
    const ledger = Array.from({ length: 30 }, (_, i) => impact('tokyo', '2026-01-01T00:00:00Z', `id-${i}`));
    expect(paginateLedger(ledger, { limit: 0 }).entries.length).toBe(25);
    expect(paginateLedger(ledger, { limit: -5 }).entries.length).toBe(25);
    expect(paginateLedger(ledger, { limit: NaN }).entries.length).toBe(25);
  });
});
