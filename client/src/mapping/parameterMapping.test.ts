import { describe, it, expect } from 'vitest';
import { mapUnrestToParams, mapQuakeToTriggerParams } from './parameterMapping';
import type { Quake } from '../types';

function quake(overrides: Partial<Quake> = {}): Quake {
  return {
    id: 'test-1',
    mag: 4.5,
    place: 'Test Place',
    time: 0,
    updated: 0,
    tsunami: 0,
    sig: 400,
    alert: null,
    type: 'earthquake',
    lon: 139.69,
    lat: 35.69,
    depthKm: 10,
    ...overrides,
  };
}

describe('mapUnrestToParams', () => {
  it('is sparse and open when calm, dense and dissonant when unsettled', () => {
    const calm = mapUnrestToParams(0.02, null);
    const unsettled = mapUnrestToParams(0.95, null);

    expect(unsettled.droneDensity).toBeGreaterThan(calm.droneDensity);
    expect(unsettled.layerCount).toBeGreaterThan(calm.layerCount);
    expect(unsettled.dissonance).toBeGreaterThan(calm.dissonance);
    expect(unsettled.tremoloRate).toBeGreaterThan(calm.tremoloRate);
  });

  it('keeps layerCount within 1..5', () => {
    for (const unrest of [0, 0.25, 0.5, 0.75, 1]) {
      const params = mapUnrestToParams(unrest, null);
      expect(params.layerCount).toBeGreaterThanOrEqual(1);
      expect(params.layerCount).toBeLessThanOrEqual(5);
    }
  });

  it('clamps out-of-range unrest input', () => {
    expect(mapUnrestToParams(-1, null).dissonance).toBe(0);
    expect(mapUnrestToParams(2, null).dissonance).toBe(1);
  });

  it('makes a Ring-of-Fire-dominant drone more metallic than a Mid-Atlantic-Ridge-dominant one', () => {
    const ringOfFire = mapUnrestToParams(0.5, 'ring-of-fire');
    const midAtlantic = mapUnrestToParams(0.5, 'mid-atlantic-ridge');
    expect(ringOfFire.overtoneColor).toBeGreaterThan(midAtlantic.overtoneColor);
  });

  it('passes the dominant region straight through', () => {
    expect(mapUnrestToParams(0.5, 'alpide-belt').dominantRegion).toBe('alpide-belt');
    expect(mapUnrestToParams(0.5, null).dominantRegion).toBeNull();
  });
});

describe('mapQuakeToTriggerParams', () => {
  it('gives a bigger quake more amplitude', () => {
    const small = mapQuakeToTriggerParams(quake({ mag: 3 }));
    const big = mapQuakeToTriggerParams(quake({ mag: 7 }));
    expect(big.amplitude).toBeGreaterThan(small.amplitude);
  });

  it('makes a shallow quake brighter (higher cutoff) with a shorter decay than a deep one', () => {
    const shallow = mapQuakeToTriggerParams(quake({ depthKm: 5 }));
    const deep = mapQuakeToTriggerParams(quake({ depthKm: 600 }));
    expect(shallow.cutoffHz).toBeGreaterThan(deep.cutoffHz);
    expect(shallow.decay).toBeLessThan(deep.decay);
  });

  it('gives a deep quake a longer P-S delay than a shallow one', () => {
    const shallow = mapQuakeToTriggerParams(quake({ depthKm: 5 }));
    const deep = mapQuakeToTriggerParams(quake({ depthKm: 600 }));
    expect(deep.spDelayMs).toBeGreaterThan(shallow.spDelayMs);
  });

  it('only attaches an aftershock train for significant quakes', () => {
    const minor = mapQuakeToTriggerParams(quake({ mag: 4.5, sig: 300 }));
    const major = mapQuakeToTriggerParams(quake({ mag: 6.8, sig: 900 }));
    expect(minor.aftershocks).toEqual([]);
    expect(major.aftershocks.length).toBeGreaterThan(0);
  });

  it('resolves the tectonic region from the quake coordinates', () => {
    const tokyo = mapQuakeToTriggerParams(quake({ lon: 139.69, lat: 35.69 }));
    expect(tokyo.region).toBe('ring-of-fire');
  });
});
