// Approximate bulk seismic wave speeds through the crust/upper mantle, used
// as a simple physically-grounded proxy (not a real travel-time-table
// lookup — see the README's Honest Limitations).
const VP_KM_PER_S = 6.5; // P (primary/compressional) wave
const VS_KM_PER_S = 3.6; // S (secondary/shear) wave

/**
 * The P-to-S arrival gap in milliseconds, treating hypocentral depth as a
 * (deliberately simplified) proxy for the travel path length: a real
 * seismogram shows the fast P wave first, then the slower S wave arrives
 * some time later — the gap grows with distance/depth because the speed
 * difference compounds over a longer path. Every triggered quake event uses
 * this to schedule its quiet "P click" and its stronger "S arrival" as two
 * genuinely separate, physically-timed sounds instead of one generic blip.
 */
export function computeSPDelay(depthKm: number): number {
  const d = Math.max(0, depthKm);
  return d * (1 / VS_KM_PER_S - 1 / VP_KM_PER_S) * 1000;
}
