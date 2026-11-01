import { describe, it, expect } from 'vitest';
import { ARCHIVE_PRESETS, archiveParams, archiveSpan, describeArchive } from './archive';

const today = new Date(Date.UTC(2026, 10, 1));

describe('archive presets', () => {
  it('builds the great-quake preset from 1900 to today', () => {
    const q = ARCHIVE_PRESETS.find((p) => p.id === 'great')!.build(today, null);
    expect(q).toMatchObject({ start: '1900-01-01', end: '2026-11-01', minMag: 8, near: null });
  });
  it('the past-year preset starts exactly a year back', () => {
    expect(ARCHIVE_PRESETS.find((p) => p.id === 'year')!.build(today, null).start).toBe('2025-11-01');
  });
  it('the near-you preset centres on the location', () => {
    const q = ARCHIVE_PRESETS.find((p) => p.id === 'near')!.build(today, { lat: 35.6895, lon: 139.6917, label: 'Tokyo' });
    expect(q.near).toMatchObject({ label: 'Tokyo', radiusKm: 300 });
    const p = archiveParams(q);
    expect(p.get('lat')).toBe('35.690');
    expect(p.get('radiusKm')).toBe('300');
  });
});

describe('archive helpers', () => {
  const q = { start: '2000-01-01', end: '2000-12-31', minMag: 7, near: null, orderBy: 'time' as const, limit: 100 };
  it('serialises without a location', () => {
    const p = archiveParams(q);
    expect(Object.fromEntries(p)).toEqual({ start: '2000-01-01', end: '2000-12-31', minmag: '7', orderby: 'time', limit: '100' });
  });
  it('spans whole days', () => {
    const { startMs, endMs } = archiveSpan(q);
    expect(endMs - startMs).toBe(366 * 86_400_000);
  });
  it('describes itself', () => {
    expect(describeArchive(q)).toBe('M7+ · 2000 · worldwide');
    expect(describeArchive({ ...q, end: '2026-01-01', near: { lat: 0, lon: 0, label: 'Lima', radiusKm: 200 } })).toBe('M7+ · 2000-2026 · within 200 km of Lima');
  });
});
