// Static map geometry: a Natural Earth projection fitted to a fixed world-space
// rectangle, plus pre-built SVG path strings for everything that never moves.
import { geoArea, geoCircle, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import countries from 'world-atlas/countries-110m.json';
import plateLines from '../data/plateBoundaries.json';
import type { PlateKind } from '../types';

export const WORLD_WIDTH = 1000;

const sphere = { type: 'Sphere' } as const;
export const projection = geoNaturalEarth1().fitWidth(WORLD_WIDTH, sphere);
const path = geoPath(projection);
const [[, y0], [, y1]] = path.bounds(sphere);
export const WORLD_HEIGHT = Math.ceil(y1 - y0);
projection.translate([projection.translate()[0], projection.translate()[1] - y0]);

const topo = countries as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;

export const SPHERE_PATH = path(sphere) ?? '';
export const GRATICULE_PATH = path(geoGraticule10()) ?? '';
export const LAND_PATH = path(feature(topo, topo.objects.land)) ?? '';
export const BORDERS_PATH = path(mesh(topo, topo.objects.countries, (a, b) => a !== b)) ?? '';

const CLASS_KIND: Record<string, PlateKind> = {
  SUB: 'subduction', OCB: 'convergent', CCB: 'convergent', OSR: 'divergent', CRB: 'divergent', OTF: 'transform', CTF: 'transform',
};

/** One SVG path per boundary kind, so each can be styled and toggled as a layer. */
export const PLATE_PATHS: Record<PlateKind, string> = (() => {
  const byKind: Record<PlateKind, [number, number][][]> = { subduction: [], convergent: [], divergent: [], transform: [] };
  for (const [cls, lines] of Object.entries(plateLines as unknown as Record<string, [number, number][][]>)) {
    byKind[CLASS_KIND[cls]].push(...lines);
  }
  const out = {} as Record<PlateKind, string>;
  for (const kind of Object.keys(byKind) as PlateKind[]) {
    out[kind] = path({ type: 'MultiLineString', coordinates: byKind[kind] }) ?? '';
  }
  return out;
})();

/** Project lon/lat into world space. Null for points the projection can't place. */
export function project(lon: number, lat: number): [number, number] | null {
  const p = projection([lon, lat]);
  return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
}

/** World space back to lon/lat (null outside the globe). */
export function unproject(x: number, y: number): [number, number] | null {
  const p = projection.invert?.([x, y]);
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  // invert() happily returns coordinates for points outside the sphere outline; reject those.
  const back = projection(p);
  if (!back || Math.hypot(back[0] - x, back[1] - y) > 0.5) return null;
  return p;
}

const KM_PER_DEGREE = 111.195;

/** SVG path for a geodesic circle of `radiusKm` around a point; d3 clips it at the antimeridian. */
export function circlePath(lon: number, lat: number, radiusKm: number): string {
  if (radiusKm <= 0) return '';
  return path(geoCircle().center([lon, lat]).radius(radiusKm / KM_PER_DEGREE).precision(2)()) ?? '';
}

/** SVG path for arbitrary lon/lat line work (ShakeMap contours). */
export function linesPath(lines: [number, number][][]): string {
  return path({ type: 'MultiLineString', coordinates: lines }) ?? '';
}

/** SVG path for one lon/lat polygon ring (a DYFI cell). */
export function ringPath(ring: [number, number][]): string {
  // GeoJSON rings are counter-clockwise; d3's spherical polygons read that as
  // "everything except this cell", so flip any ring that covers over half the globe.
  let poly = { type: 'Polygon' as const, coordinates: [ring] };
  if (geoArea(poly) > 2 * Math.PI) poly = { type: 'Polygon', coordinates: [[...ring].reverse()] };
  return path(poly) ?? '';
}
