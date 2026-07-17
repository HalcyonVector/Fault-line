import type { Site } from '../types';

/** Sites ranked by overdue-pressure, most-overdue first. Ties keep their original relative order. */
export function rankByOverduePressure(sites: Site[]): Site[] {
  return [...sites].sort((a, b) => b.overduePressure.clamped - a.overduePressure.clamped);
}

/** The single most statistically-overdue site, or null for an empty portfolio. */
export function mostOverdueSite(sites: Site[]): Site | null {
  return rankByOverduePressure(sites)[0] ?? null;
}
