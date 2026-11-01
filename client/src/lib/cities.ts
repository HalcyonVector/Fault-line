import raw from '../data/cities.json';
import { haversineKm } from './geo';
import { estimateMmi } from '../seismology/intensity';

/** [name, country, lat, lon, population] from Natural Earth populated places (pop >= 100k). */
type CityRow = [string, string, number, number, number];
export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
  pop: number;
}

export const CITIES: City[] = (raw as CityRow[]).map(([name, country, lat, lon, pop]) => ({ name, country, lat, lon, pop }));

export interface CityImpact extends City {
  distanceKm: number;
  mmi: number;
}

/**
 * Cities within `maxKm` of an epicentre with their estimated shaking, ordered
 * by intensity then population. Always includes the single nearest city, even
 * if it is further away, so remote ocean events still get a reference point.
 */
export function cityImpacts(lon: number, lat: number, mag: number, depthKm: number, limit = 6, maxKm = 1500, cities: City[] = CITIES): CityImpact[] {
  let nearest: CityImpact | null = null;
  const within: CityImpact[] = [];
  for (const c of cities) {
    const distanceKm = haversineKm(lon, lat, c.lon, c.lat);
    const impact = { ...c, distanceKm, mmi: estimateMmi(mag, distanceKm, depthKm) };
    if (!nearest || distanceKm < nearest.distanceKm) nearest = impact;
    if (distanceKm <= maxKm) within.push(impact);
  }
  within.sort((a, b) => Math.round(b.mmi) - Math.round(a.mmi) || b.pop - a.pop);
  const out = within.slice(0, limit);
  if (nearest && !out.some((c) => c.name === nearest!.name && c.country === nearest!.country)) {
    out.push(nearest);
  }
  return out;
}

/** Nearest city to a point, for labelling the user's chosen location. */
export function nearestCity(lon: number, lat: number, cities: City[] = CITIES): (City & { distanceKm: number }) | null {
  let best: (City & { distanceKm: number }) | null = null;
  for (const c of cities) {
    const distanceKm = haversineKm(lon, lat, c.lon, c.lat);
    if (!best || distanceKm < best.distanceKm) best = { ...c, distanceKm };
  }
  return best;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Cities matching a typed query: names starting with it first, then names
 * containing it, then country matches; bigger cities first within each group.
 */
export function searchCities(query: string, limit = 6, cities: City[] = CITIES): City[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const scored: { c: City; rank: number }[] = [];
  for (const c of cities) {
    const name = fold(c.name);
    const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : fold(c.country).startsWith(q) ? 2 : -1;
    if (rank >= 0) scored.push({ c, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || b.c.pop - a.c.pop);
  return scored.slice(0, limit).map((s) => s.c);
}
