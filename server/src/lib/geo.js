const EARTH_RADIUS_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance between two lon/lat points, in km. */
export function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Wrap a longitude difference into [-180, 180). */
export function wrapLon(d) {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/**
 * Approximate distance (km) from a point to a short boundary segment. Each
 * PB2002 step is at most ~100 km long, so projecting into a local
 * equirectangular frame around the point (x scaled by cos(lat)) is accurate
 * to well under a kilometre at that scale, and much cheaper than true
 * great-circle cross-track math for thousands of segments.
 */
export function pointToSegmentKm(lon, lat, lon1, lat1, lon2, lat2) {
  const k = Math.cos(toRad(lat));
  const ax = wrapLon(lon1 - lon) * k;
  const ay = lat1 - lat;
  const bx = wrapLon(lon2 - lon) * k;
  const by = lat2 - lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return Math.hypot(px, py) * 111.195;
}
