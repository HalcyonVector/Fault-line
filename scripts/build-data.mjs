// Regenerates the small bundled datasets Fault Line ships with, from their
// public upstream sources. Not part of the normal build: the generated files
// are committed, so this only needs to run if you want to refresh them.
//
// Usage:
//   node scripts/build-data.mjs <dir containing the downloaded sources>
//
// Expected inputs in that directory:
//   PB2002_steps.json
//     https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_steps.json
//     (Bird 2003 plate boundary model, GeoJSON conversion by Hugo Ahlenius / Nordpil, ODC-BY 1.0)
//   ne_50m_populated_places_simple.geojson
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson
//     (Natural Earth, public domain)
//
// Outputs:
//   server/src/data/plateSteps.json      every boundary step, for nearest-boundary classification
//   client/src/data/plateBoundaries.json the same steps chained into drawable polylines, per class
//   client/src/data/cities.json          cities with population >= 100k, for nearby-city shaking estimates

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2];
if (!srcDir) {
  console.error('usage: node scripts/build-data.mjs <source dir>');
  process.exit(1);
}

const CLASSES = ['SUB', 'OSR', 'OTF', 'CRB', 'CTF', 'CCB', 'OCB'];
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ---- Plate boundaries -------------------------------------------------
const steps = JSON.parse(fs.readFileSync(path.join(srcDir, 'PB2002_steps.json'), 'utf8')).features.map((f) => f.properties);
const bounds = [...new Set(steps.map((s) => s.PLATEBOUND))].sort();
const boundIndex = new Map(bounds.map((b, i) => [b, i]));

// Flat array, 7 numbers per step: lon1, lat1, lon2, lat2, class index, boundary index, relative velocity (mm/yr).
const flat = [];
for (const s of steps) {
  flat.push(
    round(s.STARTLONG), round(s.STARTLAT), round(s.FINALLONG), round(s.FINALLAT),
    CLASSES.indexOf(s.STEPCLASS), boundIndex.get(s.PLATEBOUND), round(s.VELOCITYLE, 0),
  );
}
fs.writeFileSync(
  path.join(ROOT, 'server/src/data/plateSteps.json'),
  JSON.stringify({ source: 'Bird (2003) PB2002, via fraxen/tectonicplates (ODC-BY 1.0)', classes: CLASSES, boundaries: bounds, stride: 7, steps: flat }),
);

// Chain consecutive steps of the same boundary and class into polylines.
const lines = Object.fromEntries(CLASSES.map((c) => [c, []]));
let current = null;
let prev = null;
for (const s of steps) {
  const start = [round(s.STARTLONG), round(s.STARTLAT)];
  const end = [round(s.FINALLONG), round(s.FINALLAT)];
  const continues =
    prev &&
    prev.PLATEBOUND === s.PLATEBOUND &&
    prev.STEPCLASS === s.STEPCLASS &&
    prev.FINALLONG === s.STARTLONG &&
    prev.FINALLAT === s.STARTLAT;
  if (continues) {
    current.push(end);
  } else {
    current = [start, end];
    lines[s.STEPCLASS].push(current);
  }
  prev = s;
}
fs.writeFileSync(path.join(ROOT, 'client/src/data/plateBoundaries.json'), JSON.stringify(lines));

// ---- Cities -----------------------------------------------------------
const places = JSON.parse(fs.readFileSync(path.join(srcDir, 'ne_50m_populated_places_simple.geojson'), 'utf8')).features
  .map((f) => f.properties)
  .filter((p) => p.pop_max >= 100000)
  .sort((a, b) => b.pop_max - a.pop_max)
  .map((p) => [p.nameascii || p.name, p.adm0name, round(p.latitude, 3), round(p.longitude, 3), p.pop_max]);
fs.writeFileSync(path.join(ROOT, 'client/src/data/cities.json'), JSON.stringify(places));

console.log(`steps: ${steps.length}, boundaries: ${bounds.length}, polylines: ${Object.values(lines).reduce((n, l) => n + l.length, 0)}, cities: ${places.length}`);
