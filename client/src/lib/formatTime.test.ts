import { describe, it, expect } from 'vitest';
import { formatClock, formatRelativeTime } from './formatTime';

describe('formatClock', () => {
  it('formats whole hours', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(13)).toBe('13:00');
  });

  it('formats fractional hours to the nearest minute', () => {
    expect(formatClock(9.5)).toBe('09:30');
  });

  it('rounds 22.999... up to 23:00, never 22:60', () => {
    expect(formatClock(22.9999)).toBe('23:00');
  });

  it('wraps past 24 hours', () => {
    expect(formatClock(24)).toBe('00:00');
  });
});

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;

  it('reads "just now" for very recent events', () => {
    expect(formatRelativeTime(now - 5000, now)).toBe('just now');
  });

  it('formats minutes, hours, and days', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000, now)).toBe('2d ago');
  });

  it('never returns a negative duration for a future timestamp', () => {
    expect(formatRelativeTime(now + 10_000, now)).toBe('just now');
  });
});
