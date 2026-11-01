// Pure geometry for the 3D globe. The globe is a unit sphere: radius 1 is the
// surface, with +Y through the north pole and lon 0 / lat 0 facing +Z.

export const EARTH_RADIUS_KM = 6371;

/** Depths are drawn this many times deeper than true scale so slabs read clearly. */
export const DEPTH_EXAGGERATION = 3;

const toRad = (d: number) => (d * Math.PI) / 180;

/** Cartesian position of a lon/lat at radius `r` (1 = surface). */
export function lonLatToXYZ(lon: number, lat: number, r = 1): [number, number, number] {
  const phi = toRad(lat);
  const lambda = toRad(lon);
  return [r * Math.cos(phi) * Math.sin(lambda), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lambda)];
}

/** Inverse of lonLatToXYZ: the lon/lat a direction points at. */
export function xyzToLonLat(x: number, y: number, z: number): [number, number] {
  const r = Math.hypot(x, y, z) || 1;
  return [(Math.atan2(x, z) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, y / r))) * 180) / Math.PI];
}

/** Radius at which an event at `depthKm` is drawn, with depth exaggerated but never past the centre. */
export function depthRadius(depthKm: number, exaggeration = DEPTH_EXAGGERATION): number {
  return Math.max(0.05, 1 - (Math.max(0, depthKm) * exaggeration) / EARTH_RADIUS_KM);
}

/** Marker radius in globe units: grows with the square of magnitude, like the 2D map. */
export function markerSize(mag: number): number {
  const m = Math.max(0, mag);
  return 0.0035 + m * m * 0.00075;
}
