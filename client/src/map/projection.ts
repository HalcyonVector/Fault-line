export interface ProjectedPoint {
  x: number;
  y: number;
}

/** Plain equirectangular (plate carree) projection: lon/lat -> pixel space for a `width`x`height` viewport. */
export function projectEquirectangular(lon: number, lat: number, width: number, height: number): ProjectedPoint {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

/** Inverse of projectEquirectangular — pixel space back to lon/lat. */
export function unprojectEquirectangular(x: number, y: number, width: number, height: number): { lon: number; lat: number } {
  const lon = (x / width) * 360 - 180;
  const lat = 90 - (y / height) * 180;
  return { lon, lat };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Ripple ring's maximum radius in pixels, scaled by magnitude and capped relative to the viewport width. */
export function rippleMaxRadiusPx(magnitude: number, width: number): number {
  const raw = 10 + magnitude * magnitude * 1.3;
  return clamp(raw, 10, width * 0.28);
}

/** Ripple ring's full expand-and-fade duration in ms, scaled by magnitude. */
export function rippleDurationMs(magnitude: number): number {
  return 1100 + Math.max(0, magnitude) * 550;
}

/**
 * A simple GeoJSON Polygon/MultiPolygon ring walker: projects every
 * [lon, lat] coordinate pair through `project` and joins the result into an
 * SVG path `d` string. Pulled out as a pure function (rather than left
 * inline in the MapScene component) so the coordinate-to-path math itself
 * has a unit test independent of any real land-atlas data or DOM.
 */
export function geometryToSvgPath(
  geometry: { type: string; coordinates: unknown },
  project: (lon: number, lat: number) => ProjectedPoint,
): string {
  function ringToPath(ring: [number, number][]): string {
    return ring
      .map(([lon, lat], i) => {
        const { x, y } = project(lon, lat);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ') + ' Z';
  }

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as [number, number][][];
    return rings.map(ringToPath).join(' ');
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates as [number, number][][][];
    return polygons.map((rings) => rings.map(ringToPath).join(' ')).join(' ');
  }

  return '';
}
