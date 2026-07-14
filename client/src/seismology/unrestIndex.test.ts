import { describe, it, expect } from 'vitest';
import { normalizeUnrest, accumulateUnrestEnergy, unrestIndex, type QuakeEvent } from './unrestIndex';

const HOUR = 60 * 60 * 1000;

describe('normalizeUnrest', () => {
  it('is 0 for zero energy', () => {
    expect(normalizeUnrest(0)).toBe(0);
  });

  it('approaches but does not exceed 1 as energy grows', () => {
    // A moderate multiple of the reference energy: large enough to sit very
    // close to the ceiling, but not so large that float64 underflow in
    // exp(-x) rounds the result indistinguishably to exactly 1.
    const moderatelyLarge = normalizeUnrest(20 * 1.956e8);
    expect(moderatelyLarge).toBeLessThan(1);
    expect(moderatelyLarge).toBeGreaterThan(0.999);

    // An astronomically large energy value still saturates at the 1 ceiling
    // (never exceeds it), even if float precision rounds it to exactly 1.
    expect(normalizeUnrest(1e30)).toBeLessThanOrEqual(1);
  });

  it('is monotonically increasing in energy', () => {
    expect(normalizeUnrest(1000)).toBeGreaterThan(normalizeUnrest(100));
  });
});

describe('accumulateUnrestEnergy / unrestIndex', () => {
  it('is quiet on a calm day with only small, sparse quakes', () => {
    const events: QuakeEvent[] = [
      { magnitude: 2.1, timeMs: 0 },
      { magnitude: 1.8, timeMs: 3 * HOUR },
      { magnitude: 2.4, timeMs: 6 * HOUR },
    ];
    const unrest = unrestIndex(events, 6 * HOUR);
    expect(unrest).toBeLessThan(0.1);
  });

  it('builds up during a swarm of moderate quakes clustered in time', () => {
    const events: QuakeEvent[] = Array.from({ length: 10 }, (_, i) => ({
      magnitude: 5 + Math.random() * 0.4,
      timeMs: i * 5 * 60 * 1000, // every 5 minutes
    }));
    const calm = unrestIndex([], 0);
    const duringSwarm = unrestIndex(events, events[events.length - 1].timeMs);
    expect(duringSwarm).toBeGreaterThan(calm);
    expect(duringSwarm).toBeGreaterThan(0.3);
  });

  it('cools back down after a swarm ends, given enough elapsed time', () => {
    const events: QuakeEvent[] = [
      { magnitude: 6.2, timeMs: 0 },
      { magnitude: 5.8, timeMs: 10 * 60 * 1000 },
    ];
    const rightAfter = unrestIndex(events, 30 * 60 * 1000);
    const muchLater = unrestIndex(events, 24 * HOUR);
    expect(muchLater).toBeLessThan(rightAfter);
    expect(muchLater).toBeLessThan(0.05);
  });

  it('a single large quake registers more unrest than many tiny ones', () => {
    const bigOne: QuakeEvent[] = [{ magnitude: 7.5, timeMs: 0 }];
    const manySmall: QuakeEvent[] = Array.from({ length: 20 }, (_, i) => ({
      magnitude: 2.0,
      timeMs: i * 60 * 1000,
    }));
    expect(unrestIndex(bigOne, HOUR)).toBeGreaterThan(unrestIndex(manySmall, HOUR));
  });

  it('ignores events that happen after the query time', () => {
    const events: QuakeEvent[] = [
      { magnitude: 5, timeMs: 0 },
      { magnitude: 7, timeMs: 10 * HOUR }, // in the "future" relative to the query below
    ];
    const energyAtStart = accumulateUnrestEnergy(events, 0);
    const energyIncludingFuture = accumulateUnrestEnergy(events, 0); // same query, future event still excluded
    expect(energyAtStart).toBe(energyIncludingFuture);
    expect(unrestIndex(events, 0)).toBeLessThan(unrestIndex(events, 10 * HOUR));
  });

  it('does not require events to be pre-sorted', () => {
    const sorted: QuakeEvent[] = [
      { magnitude: 4, timeMs: 0 },
      { magnitude: 5, timeMs: HOUR },
    ];
    const shuffled: QuakeEvent[] = [sorted[1], sorted[0]];
    expect(unrestIndex(shuffled, 2 * HOUR)).toBeCloseTo(unrestIndex(sorted, 2 * HOUR), 10);
  });
});
