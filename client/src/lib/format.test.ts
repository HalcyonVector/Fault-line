import { describe, it, expect } from 'vitest';
import { formatRelativeTime, formatUtc, formatKm, formatPercent, formatPopulation, formatCoords } from './format';

describe('format', () => {
  it('relative time', () => {
    const now = 10 * 86_400_000;
    expect(formatRelativeTime(now - 10_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 50_000, now)).toBe('1m ago');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
    const later = 400 * 365.25 * 86_400_000;
    expect(formatRelativeTime(later - 90 * 86_400_000, later)).toBe('2mo ago');
    expect(formatRelativeTime(later - 50 * 365.25 * 86_400_000, later)).toBe('50y ago');
    expect(formatRelativeTime(now + 5000, now)).toBe('just now');
  });
  it('UTC timestamps', () => {
    expect(formatUtc(Date.UTC(2026, 10, 1, 4, 7))).toBe('2026-11-01 04:07 UTC');
  });
  it('distances, percentages, populations, coordinates', () => {
    expect(formatKm(0.42)).toBe('420 m');
    expect(formatKm(4.25)).toBe('4.3 km');
    expect(formatKm(1240.4)).toBe('1,240 km');
    expect(formatPercent(0.004)).toBe('<1%');
    expect(formatPercent(0.372)).toBe('37%');
    expect(formatPercent(0.999)).toBe('>99%');
    expect(formatPopulation(12_500_000)).toBe('13M');
    expect(formatPopulation(3_400_000)).toBe('3.4M');
    expect(formatPopulation(250_000)).toBe('250k');
    expect(formatCoords(-33.45, -70.66)).toBe('33.45°S 70.66°W');
  });
});
