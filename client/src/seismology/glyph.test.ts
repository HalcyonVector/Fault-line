import { describe, it, expect } from 'vitest';
import { generateEventGlyph } from './glyph';

describe('generateEventGlyph', () => {
  it('is deterministic for the same inputs', () => {
    const a = generateEventGlyph('us1000abcd', 6.1, 35, 12);
    const b = generateEventGlyph('us1000abcd', 6.1, 35, 12);
    expect(a).toEqual(b);
  });

  it('produces the requested number of bars', () => {
    expect(generateEventGlyph('x', 5, 10, 8)).toHaveLength(8);
    expect(generateEventGlyph('x', 5, 10, 16)).toHaveLength(16);
  });

  it('keeps every bar within 0.05..1', () => {
    const bars = generateEventGlyph('some-id', 8.8, 600, 20);
    for (const b of bars) {
      expect(b).toBeGreaterThanOrEqual(0.05);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('differs for a different id, magnitude, or depth', () => {
    const base = generateEventGlyph('id-a', 5.0, 10);
    expect(generateEventGlyph('id-b', 5.0, 10)).not.toEqual(base);
    expect(generateEventGlyph('id-a', 6.5, 10)).not.toEqual(base);
    expect(generateEventGlyph('id-a', 5.0, 200)).not.toEqual(base);
  });
});
