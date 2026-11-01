import { describe, it, expect } from 'vitest';
import { depthColor, ageColor, mmiColor, magRadius, magTone } from './colors';

describe('map colors', () => {
  it('depth ramp hits its stops and clamps', () => {
    expect(depthColor(0)).toBe('rgb(255, 214, 102)');
    expect(depthColor(-5)).toBe('rgb(255, 214, 102)');
    expect(depthColor(700)).toBe('rgb(124, 77, 255)');
    expect(depthColor(5000)).toBe('rgb(124, 77, 255)');
  });
  it('age ramp clamps to 0..1', () => {
    expect(ageColor(-1)).toBe(ageColor(0));
    expect(ageColor(2)).toBe(ageColor(1));
  });
  it('MMI uses the USGS scale', () => {
    expect(mmiColor(6)).toBe('#ffff00');
    expect(mmiColor(0)).toBe('#ffffff');
    expect(mmiColor(11)).toBe('#c80000');
  });
  it('marker size grows with magnitude', () => {
    expect(magRadius(6)).toBeGreaterThan(magRadius(4));
    expect(magRadius(-1)).toBe(magRadius(0));
    expect(magTone(7.1)).toBe('major');
    expect(magTone(1)).toBe('minor');
  });
});
