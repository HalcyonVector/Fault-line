import { describe, it, expect } from 'vitest';
import { alertReason, newArrivals, DEFAULT_ALERT_SETTINGS } from './alerts';
import type { Quake } from '../types';

const q = (over: Partial<Quake>) => ({ id: 'x', mag: 3, lon: 0, lat: 0, depthKm: 10, ...over } as Quake);
const home = { lat: 35.68, lon: 139.69, label: 'Tokyo' };

describe('alertReason', () => {
  it('fires for big quakes anywhere', () => {
    expect(alertReason(q({ mag: 6.4 }), DEFAULT_ALERT_SETTINGS, null)).toMatch(/M6\.0 or larger/);
    expect(alertReason(q({ mag: 5.9 }), DEFAULT_ALERT_SETTINGS, null)).toBeNull();
  });
  it('fires for a moderate quake close enough to be felt at your location', () => {
    const r = alertReason(q({ mag: 4.5, lon: 139.8, lat: 35.6 }), DEFAULT_ALERT_SETTINGS, home);
    expect(r).toMatch(/Possibly felt at Tokyo/);
  });
  it('stays quiet for the same quake far away', () => {
    expect(alertReason(q({ mag: 4.5, lon: -70, lat: -30 }), DEFAULT_ALERT_SETTINGS, home)).toBeNull();
  });
});

describe('newArrivals', () => {
  it('treats the first load as a baseline', () => {
    expect(newArrivals([q({ id: 'a' })], null)).toEqual([]);
  });
  it('returns only unseen events afterwards', () => {
    expect(newArrivals([q({ id: 'a' }), q({ id: 'b' })], new Set(['a'])).map((x) => x.id)).toEqual(['b']);
  });
});
