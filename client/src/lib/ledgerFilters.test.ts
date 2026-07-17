import { describe, it, expect } from 'vitest';
import { ledgerEntrySiteId, filterLedgerBySite, sortLedgerByRecency } from './ledgerFilters';
import type { LedgerEntry } from '../types';

function impact(siteId: string, resolvedAt: string, id = `${siteId}-${resolvedAt}`): LedgerEntry {
  return {
    id,
    type: 'quake-impact',
    quakeId: 'q1',
    siteId,
    magnitude: 5,
    depthKm: 10,
    distanceKm: 100,
    intensity: 4,
    damage: 3,
    resolvedAt,
  };
}

function window(nearestSiteId: string | null, resolvedAt: string, id = `w-${resolvedAt}`): LedgerEntry {
  return {
    id,
    type: 'aftershock-window',
    mainshockQuakeId: 'm1',
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
  it('reads siteId directly off a quake-impact entry', () => {
    expect(ledgerEntrySiteId(impact('tokyo', '2026-01-01T00:00:00Z'))).toBe('tokyo');
  });

  it('reads nearestSiteId off an aftershock-window entry', () => {
    expect(ledgerEntrySiteId(window('istanbul', '2026-01-01T00:00:00Z'))).toBe('istanbul');
  });

  it('is null for a window with no nearby site', () => {
    expect(ledgerEntrySiteId(window(null, '2026-01-01T00:00:00Z'))).toBeNull();
  });
});

describe('filterLedgerBySite', () => {
  const ledger = [
    impact('tokyo', '2026-01-01T00:00:00Z', 'a'),
    impact('santiago', '2026-01-01T01:00:00Z', 'b'),
    window('tokyo', '2026-01-01T02:00:00Z', 'c'),
    window(null, '2026-01-01T03:00:00Z', 'd'),
  ];

  it('returns everything when siteId is null', () => {
    expect(filterLedgerBySite(ledger, null)).toHaveLength(4);
  });

  it('returns only entries for the given site across both entry shapes', () => {
    const result = filterLedgerBySite(ledger, 'tokyo');
    expect(result.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('returns an empty array for a site with no entries', () => {
    expect(filterLedgerBySite(ledger, 'wellington')).toEqual([]);
  });
});

describe('sortLedgerByRecency', () => {
  it('orders newest first regardless of input order', () => {
    const ledger = [
      impact('tokyo', '2026-01-01T00:00:00Z', 'oldest'),
      impact('tokyo', '2026-01-03T00:00:00Z', 'newest'),
      impact('tokyo', '2026-01-02T00:00:00Z', 'middle'),
    ];
    expect(sortLedgerByRecency(ledger).map((e) => e.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('does not mutate the input array', () => {
    const ledger = [impact('tokyo', '2026-01-01T00:00:00Z', 'a'), impact('tokyo', '2026-01-02T00:00:00Z', 'b')];
    const original = [...ledger];
    sortLedgerByRecency(ledger);
    expect(ledger).toEqual(original);
  });
});
