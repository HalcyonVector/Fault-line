// Nearest-plate-boundary classification against Peter Bird's PB2002 model
// (Bird 2003, "An updated digital model of plate boundaries"), bundled as
// src/data/plateSteps.json by scripts/build-data.mjs.
import { readFileSync } from 'node:fs';
import { pointToSegmentKm } from './geo.js';

const data = JSON.parse(readFileSync(new URL('../data/plateSteps.json', import.meta.url), 'utf8'));

export const PLATE_NAMES = {
  AF: 'Africa', AM: 'Amur', AN: 'Antarctica', AP: 'Altiplano', AR: 'Arabia', AS: 'Aegean Sea', AT: 'Anatolia',
  AU: 'Australia', BH: "Bird's Head", BR: 'Balmoral Reef', BS: 'Banda Sea', BU: 'Burma', CA: 'Caribbean',
  CL: 'Caroline', CO: 'Cocos', CR: 'Conway Reef', EA: 'Easter', EU: 'Eurasia', FT: 'Futuna', GP: 'Galapagos',
  IN: 'India', JF: 'Juan de Fuca', JZ: 'Juan Fernandez', KE: 'Kermadec', MA: 'Mariana', MN: 'Manus', MO: 'Maoke',
  MS: 'Molucca Sea', NA: 'North America', NB: 'North Bismarck', ND: 'North Andes', NH: 'New Hebrides',
  NI: "Niuafo'ou", NZ: 'Nazca', OK: 'Okhotsk', ON: 'Okinawa', PA: 'Pacific', PM: 'Panama', PS: 'Philippine Sea',
  RI: 'Rivera', SA: 'South America', SB: 'South Bismarck', SC: 'Scotia', SL: 'Shetland', SO: 'Somalia',
  SS: 'Solomon Sea', SU: 'Sunda', SW: 'Sandwich', TI: 'Timor', TO: 'Tonga', WL: 'Woodlark', YA: 'Yangtze',
};

export const BOUNDARY_CLASSES = {
  SUB: { kind: 'subduction', label: 'Subduction zone' },
  OCB: { kind: 'convergent', label: 'Oceanic convergent boundary' },
  CCB: { kind: 'convergent', label: 'Continental collision zone' },
  OSR: { kind: 'divergent', label: 'Mid-ocean spreading ridge' },
  CRB: { kind: 'divergent', label: 'Continental rift' },
  OTF: { kind: 'transform', label: 'Oceanic transform fault' },
  CTF: { kind: 'transform', label: 'Continental transform fault' },
};

/** Beyond this distance a quake is reported as intraplate rather than tied to a boundary. */
export const MAX_BOUNDARY_DISTANCE_KM = 400;

const CELL_DEG = 5;
const COLS = 360 / CELL_DEG;
const ROWS = 180 / CELL_DEG;

const cellOf = (lon, lat) => {
  const c = Math.floor((((lon + 180) % 360) + 360) % 360 / CELL_DEG) % COLS;
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / CELL_DEG)));
  return [c, r];
};

// Spatial grid index: each step is filed under every cell its bounding box touches.
const grid = new Map();
const { steps, stride, classes, boundaries } = data;
for (let i = 0; i < steps.length; i += stride) {
  const [c1, r1] = cellOf(steps[i], steps[i + 1]);
  const [c2, r2] = cellOf(steps[i + 2], steps[i + 3]);
  const cs = Math.abs(c1 - c2) > COLS / 2 ? [c1, c2] : range(Math.min(c1, c2), Math.max(c1, c2));
  for (const c of cs) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      const key = r * COLS + c;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
  }
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/**
 * Describe a PB2002 boundary code. A '-' separator is a plain boundary; Bird
 * marks subduction polarity with a slash: 'A\B' means plate A subducts
 * beneath B, 'A/B' means B subducts beneath A (e.g. NZ\SA: Nazca under South
 * America, SU/AU: Australia under Sunda).
 */
export function describeBoundary(code) {
  const sep = code.includes('\\') ? '\\' : code.includes('/') ? '/' : '-';
  const [a, b] = code.split(sep);
  const plates = [PLATE_NAMES[a] ?? a, PLATE_NAMES[b] ?? b];
  let subducting = null;
  let overriding = null;
  if (sep === '\\') [subducting, overriding] = plates;
  if (sep === '/') [overriding, subducting] = plates;
  return { code, plates, subducting, overriding };
}

/**
 * Classify a point by its nearest plate boundary step. Returns null when the
 * nearest boundary is further than `MAX_BOUNDARY_DISTANCE_KM` (intraplate).
 */
export function classifyPoint(lon, lat, maxKm = MAX_BOUNDARY_DISTANCE_KM) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const reachDeg = Math.ceil(maxKm / 111 / CELL_DEG);
  const [c0, r0] = cellOf(lon, lat);
  const seen = new Set();
  let best = null;
  // Longitude cells shrink toward the poles, so widen the column search there.
  const colReach = Math.min(COLS / 2, Math.ceil(reachDeg / Math.max(0.1, Math.cos((lat * Math.PI) / 180))));
  for (let dr = -reachDeg; dr <= reachDeg; dr++) {
    const r = r0 + dr;
    if (r < 0 || r >= ROWS) continue;
    for (let dc = -colReach; dc <= colReach; dc++) {
      const c = (((c0 + dc) % COLS) + COLS) % COLS;
      const bucket = grid.get(r * COLS + c);
      if (!bucket) continue;
      for (const i of bucket) {
        if (seen.has(i)) continue;
        seen.add(i);
        const d = pointToSegmentKm(lon, lat, steps[i], steps[i + 1], steps[i + 2], steps[i + 3]);
        if (!best || d < best.d) best = { d, i };
      }
    }
  }
  if (!best || best.d > maxKm) return null;
  const cls = classes[steps[best.i + 4]];
  const info = BOUNDARY_CLASSES[cls];
  return {
    stepClass: cls,
    kind: info.kind,
    label: info.label,
    ...describeBoundary(boundaries[steps[best.i + 5]]),
    distanceKm: Math.round(best.d),
    relativeVelocityMmYr: steps[best.i + 6],
  };
}
