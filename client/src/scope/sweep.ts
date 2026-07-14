/**
 * Pure math for the scope panel's radar-style sweep and epicenter-blip
 * decay, mirroring how map/projection.ts factors the pure coordinate math
 * out of MapScene so it can be tested without a DOM or SVG.
 */

/** Current sweep angle in degrees (0 = up, clockwise), given elapsed ms and a full-rotation period. */
export function sweepAngleDeg(elapsedMs: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  const t = ((elapsedMs % periodMs) + periodMs) % periodMs;
  return (t / periodMs) * 360;
}

/** Linear fade-out opacity for a blip, 1 at birth down to 0 once it reaches `lifeMs`. */
export function blipOpacity(ageMs: number, lifeMs: number): number {
  if (lifeMs <= 0) return 0;
  if (ageMs <= 0) return 1;
  if (ageMs >= lifeMs) return 0;
  return 1 - ageMs / lifeMs;
}

export interface CartesianPoint {
  x: number;
  y: number;
}

/** Polar (0deg = up, clockwise) to cartesian, centered on (cx, cy). */
export function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number): CartesianPoint {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/**
 * Whether a blip at `blipAngleDeg` currently sits within the sweep line's
 * brightening trail (the last `trailDeg` degrees swept through), so a blip
 * can flash brighter as the sweep passes over it — classic radar-display
 * behavior.
 */
export function isWithinSweepTrail(blipAngleDeg: number, currentSweepAngleDeg: number, trailDeg: number): boolean {
  const diff = ((currentSweepAngleDeg - blipAngleDeg) % 360 + 360) % 360;
  return diff >= 0 && diff <= trailDeg;
}

/** Slows the sweep rotation under `prefers-reduced-motion` rather than freezing it outright. */
export function sweepPeriodMs(basePeriodMs: number, reducedMotion: boolean, slowFactor = 4): number {
  return reducedMotion ? basePeriodMs * Math.max(1, slowFactor) : basePeriodMs;
}
