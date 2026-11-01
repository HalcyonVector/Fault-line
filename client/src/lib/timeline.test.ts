import { describe, it, expect } from 'vitest';
import { binByTime, visibleAt, advanceCursor } from './timeline';
import type { Quake } from '../types';

const q = (id: string, mag: number, time: number | null) => ({ id, mag, time } as Quake);

describe('binByTime', () => {
  it('counts events per bin and tracks the largest magnitude', () => {
    const bins = binByTime([q('a', 2, 5), q('b', 4, 7), q('c', 3, 15), q('old', 9, -100), q('none', 9, null)], 20, 20, 10);
    expect(bins).toHaveLength(2);
    expect(bins[0]).toMatchObject({ start: 0, end: 10, count: 2, maxMag: 4 });
    expect(bins[1]).toMatchObject({ count: 1, maxMag: 3 });
  });
  it('puts an event exactly at the end in the last bin', () => {
    const bins = binByTime([q('a', 1, 20)], 20, 20, 10);
    expect(bins[1].count).toBe(1);
  });
});

describe('playback', () => {
  it('shows only events up to the cursor', () => {
    const all = [q('a', 1, 1), q('b', 1, 5), q('c', 1, 9)];
    expect(visibleAt(all, null)).toHaveLength(3);
    expect(visibleAt(all, 5).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('advances so the full span plays in the chosen number of seconds, and ends at the live edge', () => {
    // 1000 ms of real time at a 10 s playback of a 100,000 ms span advances 10,000 ms.
    expect(advanceCursor(0, 1000, 100_000, 10, 100_000)).toBe(10_000);
    expect(advanceCursor(95_000, 1000, 100_000, 10, 100_000)).toBeNull();
  });
});
