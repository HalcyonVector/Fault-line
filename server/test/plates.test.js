import { describe, it, expect } from 'vitest';
import { classifyPoint, describeBoundary } from '../src/lib/plates.js';
import { haversineKm, pointToSegmentKm, wrapLon } from '../src/lib/geo.js';

describe('geo helpers', () => {
  it('haversine matches a known city pair (London to Paris ~344 km)', () => {
    expect(haversineKm(-0.1278, 51.5074, 2.3522, 48.8566)).toBeCloseTo(344, -1);
  });

  it('wraps longitude differences across the antimeridian', () => {
    expect(wrapLon(359)).toBe(-1);
    expect(wrapLon(-181)).toBe(179);
  });

  it('measures point-to-segment distance, including across the date line', () => {
    expect(pointToSegmentKm(0, 1, -1, 0, 1, 0)).toBeCloseTo(111.2, 0);
    expect(pointToSegmentKm(179.9, 0, -179.9, 0, -179, 0)).toBeLessThan(25);
  });
});

describe('describeBoundary', () => {
  it('reads Bird subduction polarity from the separator', () => {
    expect(describeBoundary('NZ\\SA')).toMatchObject({ subducting: 'Nazca', overriding: 'South America' });
    expect(describeBoundary('SU/AU')).toMatchObject({ subducting: 'Australia', overriding: 'Sunda' });
    expect(describeBoundary('NA-PA')).toMatchObject({ plates: ['North America', 'Pacific'], subducting: null });
  });
});

describe('classifyPoint', () => {
  it('puts the Chilean margin on the Nazca subduction zone', () => {
    const c = classifyPoint(-72.5, -36.0);
    expect(c.kind).toBe('subduction');
    expect(c.subducting).toBe('Nazca');
  });

  it('puts the San Andreas on a continental transform', () => {
    const c = classifyPoint(-122.4, 37.6);
    expect(c.kind).toBe('transform');
    expect(c.plates).toEqual(expect.arrayContaining(['Pacific', 'North America']));
  });

  it('puts Iceland on a divergent boundary', () => {
    expect(classifyPoint(-18.5, 64.5).kind).toBe('divergent');
  });

  it('returns null for an intraplate location', () => {
    expect(classifyPoint(-98, 40)).toBeNull();
  });

  it('handles points near the antimeridian (Fiji/Tonga)', () => {
    const c = classifyPoint(-178.5, -18.0);
    expect(c).not.toBeNull();
    expect(c.distanceKm).toBeLessThan(400);
  });
});
