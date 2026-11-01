import { describe, it, expect } from 'vitest';
import { regionOf } from './OverviewPanel';

describe('regionOf', () => {
  it('pulls the region out of USGS place strings', () => {
    expect(regionOf('10 km SSW of Volcano, Hawaii')).toBe('Hawaii');
    expect(regionOf('south of the Fiji Islands')).toBe('Fiji Islands');
    expect(regionOf('Mid-Atlantic Ridge')).toBe('Mid-Atlantic Ridge');
    expect(regionOf('off the east coast of Honshu, Japan')).toBe('Japan');
    expect(regionOf('central Mid-Atlantic Ridge')).toBe('Mid-Atlantic Ridge');
  });
});
