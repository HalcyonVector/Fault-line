import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { feature } from 'topojson-client';
// world-atlas ships pre-built TopoJSON land data (ISC-licensed), kept from
// the original full-viewport MapScene so this compact scope still reads
// real cartography rather than an abstract placeholder.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldTopology from 'world-atlas/land-110m.json';
import { geometryToSvgPath, projectEquirectangular } from '../map/projection';
import { sweepAngleDeg, sweepPeriodMs, blipOpacity, polarToCartesian } from '../scope/sweep';

const VIEW_SIZE = 200;
const MAP_WIDTH = 200;
const MAP_HEIGHT = 100;
const MAP_Y_OFFSET = (VIEW_SIZE - MAP_HEIGHT) / 2;
const CENTER = VIEW_SIZE / 2;
const SWEEP_RADIUS = 90;
const SWEEP_PERIOD_MS = 5000;
const BLIP_LIFE_MS = 9000;
const TICK_MS = 90;

export interface ScopeQuakeLike {
  id: string;
  lon: number;
  lat: number;
  mag: number;
  depthKm: number;
}

interface ScopePanelProps {
  quakes: ScopeQuakeLike[];
  /** 0..1 global unrest index — reddens the scope's vignette as tension rises. */
  unrest: number;
}

interface Blip {
  id: string;
  x: number;
  y: number;
  mag: number;
  bornAt: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function blipRadius(mag: number): number {
  return Math.max(2, Math.min(7, 1.6 + mag * 0.55));
}

/**
 * A compact, self-contained secondary instrument: a circular sonar/radar
 * scope with a rotating sweep line and fading epicenter blips, projected
 * from the same real land-silhouette data the old full-viewport MapScene
 * used. This is now a docked readout, not the hero of the screen — the
 * helicorder trace owns that role.
 */
export function ScopePanel({ quakes, unrest }: ScopePanelProps) {
  const [blips, setBlips] = useState<Blip[]>([]);
  const [now, setNow] = useState(() => performance.now());
  const [mountedAt] = useState(() => performance.now());
  const seenRef = useRef<Set<string>>(new Set());
  const reduced = useMemo(prefersReducedMotion, []);

  const landPaths = useMemo(() => {
    const project = (lon: number, lat: number) => {
      const p = projectEquirectangular(lon, lat, MAP_WIDTH, MAP_HEIGHT);
      return { x: p.x, y: p.y + MAP_Y_OFFSET };
    };
    try {
      const topology = worldTopology as unknown as Parameters<typeof feature>[0];
      const objects = (topology as { objects: Record<string, unknown> }).objects;
      const landObject = objects.land as Parameters<typeof feature>[1];
      const geo = feature(topology, landObject) as unknown as {
        type: string;
        features?: { geometry: { type: string; coordinates: unknown } }[];
        geometry?: { type: string; coordinates: unknown };
      };
      if (geo.type === 'FeatureCollection' && geo.features) {
        return geo.features.map((f) => geometryToSvgPath(f.geometry, project));
      }
      if (geo.geometry) return [geometryToSvgPath(geo.geometry, project)];
      return [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    const fresh = quakes.filter((q) => !seenRef.current.has(q.id));
    if (fresh.length === 0) return;
    fresh.forEach((q) => seenRef.current.add(q.id));
    const born = performance.now();
    const newBlips: Blip[] = fresh.map((q) => {
      const p = projectEquirectangular(q.lon, q.lat, MAP_WIDTH, MAP_HEIGHT);
      return { id: q.id, x: p.x, y: p.y + MAP_Y_OFFSET, mag: q.mag, bornAt: born };
    });
    setBlips((prev) => [...prev, ...newBlips]);
  }, [quakes]);

  // A single ticking clock drives both the sweep rotation and blip fade/expiry.
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setBlips((prev) => (prev.length === 0 ? prev : prev.filter((b) => now - b.bornAt < BLIP_LIFE_MS)));
  }, [now]);

  const period = sweepPeriodMs(SWEEP_PERIOD_MS, reduced);
  const angle = sweepAngleDeg(now - mountedAt, period);
  const sweepEnd = polarToCartesian(CENTER, CENTER, SWEEP_RADIUS, angle);
  const vignetteOpacity = 0.15 + Math.max(0, Math.min(1, unrest)) * 0.5;

  return (
    <div className="scope-panel">
      <div className="scope-label">Scope</div>
      <svg className="scope-svg" viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} aria-hidden="true">
        <defs>
          <clipPath id="scope-clip">
            <circle cx={CENTER} cy={CENTER} r={SWEEP_RADIUS} />
          </clipPath>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={SWEEP_RADIUS + 3} className="scope-bezel" />
        <g clipPath="url(#scope-clip)">
          <rect x={0} y={0} width={VIEW_SIZE} height={VIEW_SIZE} className="scope-ocean" />
          {landPaths.map((d, i) => (
            <path key={i} d={d} className="scope-land" />
          ))}
          {[0.34, 0.67, 1].map((f) => (
            <circle key={f} cx={CENTER} cy={CENTER} r={SWEEP_RADIUS * f} className="scope-ring" />
          ))}
          {blips.map((b) => (
            <circle
              key={b.id}
              cx={b.x}
              cy={b.y}
              r={blipRadius(b.mag)}
              className="scope-blip"
              style={{ opacity: blipOpacity(now - b.bornAt, BLIP_LIFE_MS) } as CSSProperties}
            />
          ))}
          <line x1={CENTER} y1={CENTER} x2={sweepEnd.x} y2={sweepEnd.y} className="scope-sweep-line" />
          <circle cx={CENTER} cy={CENTER} r={2.4} className="scope-sweep-origin" />
        </g>
        <circle cx={CENTER} cy={CENTER} r={SWEEP_RADIUS} className="scope-bezel-inner" />
      </svg>
      <div className="scope-vignette" style={{ opacity: vignetteOpacity }} />
    </div>
  );
}
