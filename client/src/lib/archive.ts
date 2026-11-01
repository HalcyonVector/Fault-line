import type { UserLocation } from '../types';

export interface ArchiveQuery {
  start: string; // YYYY-MM-DD
  end: string;
  minMag: number;
  /** Optional circle to search within. */
  near: (UserLocation & { radiusKm: number }) | null;
  orderBy: 'magnitude' | 'time';
  limit: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface ArchivePreset {
  id: string;
  label: string;
  description: string;
  needsLocation?: boolean;
  build: (today: Date, location: UserLocation | null) => ArchiveQuery;
}

const yearsAgo = (today: Date, years: number) => {
  const d = new Date(today);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return iso(d);
};

export const ARCHIVE_PRESETS: ArchivePreset[] = [
  {
    id: 'great',
    label: 'Great quakes since 1900',
    description: 'Every M8+ in the instrumental record',
    build: (today) => ({ start: '1900-01-01', end: iso(today), minMag: 8, near: null, orderBy: 'magnitude', limit: 500 }),
  },
  {
    id: 'major2000',
    label: 'M7+ since 2000',
    description: 'Major earthquakes this century',
    build: (today) => ({ start: '2000-01-01', end: iso(today), minMag: 7, near: null, orderBy: 'magnitude', limit: 1000 }),
  },
  {
    id: 'year',
    label: 'Past year, M5.5+',
    description: 'A year of strong quakes worldwide',
    build: (today) => ({ start: yearsAgo(today, 1), end: iso(today), minMag: 5.5, near: null, orderBy: 'magnitude', limit: 2000 }),
  },
  {
    id: 'near',
    label: 'Near you since 1970',
    description: 'M4.5+ within 300 km of your location',
    needsLocation: true,
    build: (today, location) => ({
      start: '1970-01-01',
      end: iso(today),
      minMag: 4.5,
      near: location ? { ...location, radiusKm: 300 } : null,
      orderBy: 'magnitude',
      limit: 2000,
    }),
  },
];

/** Query string for GET /api/archive. */
export function archiveParams(q: ArchiveQuery): URLSearchParams {
  const p = new URLSearchParams({ start: q.start, end: q.end, minmag: String(q.minMag), orderby: q.orderBy, limit: String(q.limit) });
  if (q.near) {
    p.set('lat', q.near.lat.toFixed(3));
    p.set('lon', q.near.lon.toFixed(3));
    p.set('radiusKm', String(q.near.radiusKm));
  }
  return p;
}

/** Span of an archive query in epoch ms: start of the first day to the end of the last. */
export function archiveSpan(q: ArchiveQuery): { startMs: number; endMs: number } {
  return { startMs: Date.parse(`${q.start}T00:00:00Z`), endMs: Date.parse(`${q.end}T23:59:59Z`) + 1000 };
}

/** A short human summary, e.g. "M8+ · 1900–2026 · worldwide". */
export function describeArchive(q: ArchiveQuery): string {
  const y0 = q.start.slice(0, 4);
  const y1 = q.end.slice(0, 4);
  const years = y0 === y1 ? y0 : `${y0}-${y1}`;
  const where = q.near ? `within ${q.near.radiusKm} km of ${q.near.label}` : 'worldwide';
  return `M${q.minMag}+ · ${years} · ${where}`;
}
