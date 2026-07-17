import { describe, it, expect } from 'vitest';
import { rankByOverduePressure, mostOverdueSite } from './overdueRanking';
import type { Site } from '../types';

function site(id: string, clamped: number): Site {
  return {
    id,
    name: id,
    country: 'Testland',
    lat: 0,
    lon: 0,
    faultSystem: 'Test Fault',
    recurrenceYears: 100,
    lastMajorRuptureYear: 2000,
    note: '',
    resilience: 20,
    health: 100,
    overduePressure: { raw: clamped, clamped },
  };
}

describe('rankByOverduePressure', () => {
  it('sorts most-overdue first', () => {
    const sites = [site('a', 0.2), site('b', 0.9), site('c', 0.5)];
    expect(rankByOverduePressure(sites).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const sites = [site('a', 0.2), site('b', 0.9)];
    const original = [...sites];
    rankByOverduePressure(sites);
    expect(sites).toEqual(original);
  });

  it('returns an empty array for an empty portfolio', () => {
    expect(rankByOverduePressure([])).toEqual([]);
  });
});

describe('mostOverdueSite', () => {
  it('returns the single most-overdue site', () => {
    const sites = [site('a', 0.2), site('b', 0.9), site('c', 0.5)];
    expect(mostOverdueSite(sites)?.id).toBe('b');
  });

  it('returns null for an empty portfolio', () => {
    expect(mostOverdueSite([])).toBeNull();
  });
});
