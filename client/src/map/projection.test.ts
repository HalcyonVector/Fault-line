import { describe, it, expect } from 'vitest';
import {
  projectEquirectangular,
  unprojectEquirectangular,
  rippleMaxRadiusPx,
  rippleDurationMs,
  geometryToSvgPath,
} from './projection';

const WIDTH = 1000;
const HEIGHT = 500;

describe('projectEquirectangular', () => {
  it('maps the corners of the lon/lat range to the corners of the viewport', () => {
    expect(projectEquirectangular(-180, 90, WIDTH, HEIGHT)).toEqual({ x: 0, y: 0 });
    expect(projectEquirectangular(180, -90, WIDTH, HEIGHT)).toEqual({ x: WIDTH, y: HEIGHT });
  });

  it('maps (0, 0) to the center of the viewport', () => {
    const p = projectEquirectangular(0, 0, WIDTH, HEIGHT);
    expect(p.x).toBeCloseTo(WIDTH / 2, 5);
    expect(p.y).toBeCloseTo(HEIGHT / 2, 5);
  });

  it('round-trips through unprojectEquirectangular', () => {
    const lon = 42.3;
    const lat = -17.6;
    const { x, y } = projectEquirectangular(lon, lat, WIDTH, HEIGHT);
    const back = unprojectEquirectangular(x, y, WIDTH, HEIGHT);
    expect(back.lon).toBeCloseTo(lon, 5);
    expect(back.lat).toBeCloseTo(lat, 5);
  });
});

describe('rippleMaxRadiusPx', () => {
  it('grows with magnitude and stays capped relative to viewport width', () => {
    const small = rippleMaxRadiusPx(2.5, WIDTH);
    const big = rippleMaxRadiusPx(9, WIDTH);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(WIDTH * 0.28);
  });
});

describe('rippleDurationMs', () => {
  it('is longer for bigger quakes', () => {
    expect(rippleDurationMs(7)).toBeGreaterThan(rippleDurationMs(3));
  });
});

describe('geometryToSvgPath', () => {
  const identityProject = (lon: number, lat: number) => ({ x: lon, y: lat });

  it('builds a closed path from a simple Polygon', () => {
    const geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] };
    const path = geometryToSvgPath(geometry, identityProject);
    expect(path.startsWith('M0.00,0.00')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain('L10.00,0.00');
  });

  it('builds a path for each polygon in a MultiPolygon', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 5]]],
      ],
    };
    const path = geometryToSvgPath(geometry, identityProject);
    expect(path.match(/M/g)?.length).toBe(2);
  });

  it('returns an empty string for an unsupported geometry type', () => {
    expect(geometryToSvgPath({ type: 'Point', coordinates: [0, 0] }, identityProject)).toBe('');
  });
});
