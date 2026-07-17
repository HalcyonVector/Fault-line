import { describe, it, expect } from 'vitest';
import { buildLedgerExport } from './exportLedger';
import type { LedgerEntry } from '../types';

const sample: LedgerEntry[] = [
  {
    id: 'a',
    type: 'quake-impact',
    quakeId: 'q1',
    siteId: 'tokyo',
    magnitude: 5,
    depthKm: 10,
    distanceKm: 100,
    intensity: 4,
    damage: 3,
    resolvedAt: '2026-01-01T00:00:00Z',
  },
];

describe('buildLedgerExport', () => {
  it('produces a timestamped, path-safe filename', () => {
    const { filename } = buildLedgerExport(sample, Date.parse('2026-03-05T02:03:04Z'));
    expect(filename).toBe('fault-line-ledger-2026-03-05-02-03-04.json');
    expect(filename).not.toMatch(/[:T]/);
  });

  it('embeds the full ledger, entry count, and export time in valid JSON', () => {
    const nowMs = Date.parse('2026-03-05T02:03:04Z');
    const { json } = buildLedgerExport(sample, nowMs);
    const parsed = JSON.parse(json);
    expect(parsed.entryCount).toBe(1);
    expect(parsed.ledger).toEqual(sample);
    expect(parsed.exportedAt).toBe(new Date(nowMs).toISOString());
  });

  it('handles an empty ledger', () => {
    const { json } = buildLedgerExport([], Date.now());
    expect(JSON.parse(json).entryCount).toBe(0);
  });
});
