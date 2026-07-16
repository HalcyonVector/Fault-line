// A small deterministic "waveform" glyph for the intelligence log: a fixed
// number of bar heights seeded entirely from a quake's own id/magnitude/depth,
// so the same event always renders identically (no per-render randomness).
// Purely decorative — the rarity *number* next to it is what's meaningful,
// not this shape (see rarityScore.ts).

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A tiny seeded PRNG (mulberry32) so the glyph is reproducible from its seed alone. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Deterministic array of `barCount` bar heights in 0.05..1, seeded from the
 * quake's id + magnitude + depth. A bigger magnitude raises the baseline
 * height; the id provides per-event jitter so no two glyphs look identical.
 */
export function generateEventGlyph(id: string, magnitude: number, depthKm: number, barCount = 12): number[] {
  const seed = (hashString(id) ^ Math.round(magnitude * 97) ^ Math.round(depthKm * 3)) >>> 0;
  const rand = mulberry32(seed);
  const baseline = clamp(magnitude / 9, 0.15, 0.9);

  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const jitter = (rand() - 0.5) * 0.7;
    bars.push(clamp(baseline + jitter, 0.05, 1));
  }
  return bars;
}
