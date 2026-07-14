import type { TectonicRegion } from '../types';

interface BBox {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

function inBox(lon: number, lat: number, box: BBox): boolean {
  return lon >= box.lonMin && lon <= box.lonMax && lat >= box.latMin && lat <= box.latMax;
}

// Coarse bounding boxes only — this is a stylized heuristic for interesting
// timbral variety, not authoritative plate-boundary data (see the README's
// Honest Limitations). Real plate boundaries are irregular curves, not
// rectangles, and several real provinces (e.g. the East African Rift, the
// Himalayan collision zone's exact extent) are approximated crudely or
// folded into "intraplate/other".
const MID_ATLANTIC_RIDGE_BOXES: BBox[] = [
  { lonMin: -40, lonMax: -10, latMin: -55, latMax: 70 }, // Iceland down through the Azores to the South Atlantic
];

const RING_OF_FIRE_BOXES: BBox[] = [
  { lonMin: -170, lonMax: -130, latMin: 50, latMax: 72 }, // Alaska / Aleutians
  { lonMin: -125, lonMax: -110, latMin: 30, latMax: 50 }, // US/Canada Pacific coast
  { lonMin: -80, lonMax: -60, latMin: -60, latMax: 15 }, // Andes / South American west coast
  { lonMin: 120, lonMax: 180, latMin: -50, latMax: 60 }, // Japan, Philippines, Indonesia (east), New Zealand
  { lonMin: -180, lonMax: -150, latMin: -50, latMax: 60 }, // wraps across the antimeridian
];

const ALPIDE_BELT_BOXES: BBox[] = [
  { lonMin: -10, lonMax: 120, latMin: -10, latMax: 45 }, // Mediterranean -> Middle East -> Himalayas -> SE Asia
];

/**
 * Buckets a quake's epicenter into one of a handful of coarse tectonic
 * provinces via simple bounding-box heuristics. Used to steer the drone's
 * harmonic color, not for anything safety-critical — see the README.
 */
export function classifyTectonicRegion(lon: number, lat: number): TectonicRegion {
  if (MID_ATLANTIC_RIDGE_BOXES.some((b) => inBox(lon, lat, b))) return 'mid-atlantic-ridge';
  if (RING_OF_FIRE_BOXES.some((b) => inBox(lon, lat, b))) return 'ring-of-fire';
  if (ALPIDE_BELT_BOXES.some((b) => inBox(lon, lat, b))) return 'alpide-belt';
  return 'intraplate-other';
}
