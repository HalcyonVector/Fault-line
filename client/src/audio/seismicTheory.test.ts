import { describe, it, expect } from 'vitest';
import { intervalPaletteForUnrest, regionColorFor } from './seismicTheory';

describe('intervalPaletteForUnrest', () => {
  it('stays open/consonant (no tritone or minor second) when calm', () => {
    const palette = intervalPaletteForUnrest(0.05);
    expect(palette).not.toContain(1);
    expect(palette).not.toContain(6);
    expect(palette).toContain(7); // a fifth
  });

  it('introduces tense intervals (tritone / minor second) as unrest approaches 1', () => {
    const palette = intervalPaletteForUnrest(0.95);
    expect(palette).toContain(6);
    expect(palette).toContain(1);
  });

  it('always includes the root', () => {
    for (const unrest of [0, 0.3, 0.6, 0.9, 1]) {
      expect(intervalPaletteForUnrest(unrest)).toContain(0);
    }
  });
});

describe('regionColorFor', () => {
  it('makes a Ring-of-Fire-dominant period more metallic than a Mid-Atlantic-Ridge-dominant one at the same unrest', () => {
    const ringOfFire = regionColorFor('ring-of-fire', 0.6);
    const midAtlantic = regionColorFor('mid-atlantic-ridge', 0.6);
    expect(ringOfFire.overtoneColor).toBeGreaterThan(midAtlantic.overtoneColor);
    expect(midAtlantic.warmth).toBeGreaterThan(ringOfFire.warmth);
  });

  it('keeps every value within 0..1 across regions and unrest levels', () => {
    const regions: (Parameters<typeof regionColorFor>[0])[] = [
      'ring-of-fire', 'alpide-belt', 'mid-atlantic-ridge', 'intraplate-other', null,
    ];
    for (const region of regions) {
      for (const unrest of [0, 0.25, 0.5, 0.75, 1]) {
        const color = regionColorFor(region, unrest);
        expect(color.overtoneColor).toBeGreaterThanOrEqual(0);
        expect(color.overtoneColor).toBeLessThanOrEqual(1);
        expect(color.warmth).toBeGreaterThanOrEqual(0);
        expect(color.warmth).toBeLessThanOrEqual(1);
      }
    }
  });

  it('falls back to the same coloring as intraplate/other when region is null', () => {
    expect(regionColorFor(null, 0.4)).toEqual(regionColorFor('intraplate-other', 0.4));
  });
});
