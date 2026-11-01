import type { PlateKind } from '../types';

type Stop = [number, [number, number, number]];

function ramp(stops: Stop[], v: number): string {
  if (v <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i];
    const [x0, c0] = stops[i - 1];
    if (v <= x1) {
      const t = (v - x0) / (x1 - x0);
      return rgb([0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * t) as [number, number, number]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

/** Depth color: hot and bright for shallow events, cooling to violet for deep ones. */
export const DEPTH_STOPS: Stop[] = [
  [0, [255, 214, 102]],
  [35, [255, 153, 64]],
  [70, [255, 92, 56]],
  [300, [222, 49, 112]],
  [700, [124, 77, 255]],
];
export function depthColor(depthKm: number): string {
  return ramp(DEPTH_STOPS, Math.max(0, depthKm));
}

/** Age color: fresh events glow, older ones fade toward slate. `t` is 0 (now) .. 1 (start of range). */
const AGE_STOPS: Stop[] = [
  [0, [255, 245, 214]],
  [0.04, [255, 183, 77]],
  [0.25, [255, 107, 53]],
  [0.6, [168, 70, 92]],
  [1, [70, 82, 102]],
];
export function ageColor(t: number): string {
  return ramp(AGE_STOPS, Math.min(1, Math.max(0, t)));
}

/** USGS ShakeMap intensity colors, I..X. */
const MMI_COLORS = ['#ffffff', '#bfccff', '#a0e6ff', '#80ffff', '#7aff93', '#ffff00', '#ffc800', '#ff9100', '#ff0000', '#c80000'];
export function mmiColor(mmi: number): string {
  return MMI_COLORS[Math.min(9, Math.max(0, Math.round(mmi) - 1))];
}

export const PLATE_COLORS: Record<PlateKind, string> = {
  subduction: '#ff6b35',
  convergent: '#f2b84b',
  divergent: '#3ddbd9',
  transform: '#b197fc',
};

export const PLATE_KIND_LABEL: Record<PlateKind | 'intraplate', string> = {
  subduction: 'Subduction',
  convergent: 'Collision',
  divergent: 'Spreading / rift',
  transform: 'Transform',
  intraplate: 'Intraplate',
};

/** Marker radius in screen pixels: grows with the square of magnitude so big events read as big. */
export function magRadius(mag: number): number {
  const m = Math.max(0, mag);
  return 1.6 + m * m * 0.32;
}

/** Badge color for a magnitude chip in lists. */
export function magTone(mag: number): 'minor' | 'light' | 'moderate' | 'strong' | 'major' {
  if (mag >= 7) return 'major';
  if (mag >= 6) return 'strong';
  if (mag >= 4.5) return 'moderate';
  if (mag >= 2.5) return 'light';
  return 'minor';
}
