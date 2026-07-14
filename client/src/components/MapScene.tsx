import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { feature } from 'topojson-client';
// world-atlas ships pre-built TopoJSON land data (ISC-licensed) so the map
// is real cartography with no external map-tile API or key, matching this
// portfolio's "the background IS the interface" ethos.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldTopology from 'world-atlas/land-110m.json';
import { geometryToSvgPath, projectEquirectangular, rippleDurationMs, rippleMaxRadiusPx } from '../map/projection';

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 500;

export interface MapQuakeLike {
  id: string;
  lon: number;
  lat: number;
  mag: number;
  depthKm: number;
}

interface MapSceneProps {
  quakes: MapQuakeLike[];
  /** 0..1 global unrest index — darkens/reddens the vignette as tension rises. */
  unrest: number;
}

interface Ripple {
  id: string;
  x: number;
  y: number;
  mag: number;
  depthKm: number;
  duration: number;
}

/** Brighter ember for shallow quakes, muted charcoal-red for deep ones — same brightness curve the audio timbre uses. */
function depthRippleColor(depthKm: number): string {
  const brightness = Math.max(0, Math.min(1, 1 / (1 + depthKm / 70)));
  const r = Math.round(120 + brightness * 130);
  const g = Math.round(45 + brightness * 70);
  const b = Math.round(40 + brightness * 35);
  return `rgba(${r}, ${g}, ${b}, ${(0.4 + brightness * 0.4).toFixed(2)})`;
}

/**
 * Full-viewport world map (equirectangular projection over real land
 * silhouettes) with expanding ripple rings at each new epicenter and a
 * global vignette that darkens/reddens with the unrest index. This is the
 * visual read-out of exactly what the audio engine is reacting to, the same
 * way Petrichor's sky is a read-out of weather/time, not a themed skin.
 */
export function MapScene({ quakes, unrest }: MapSceneProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  const landPaths = useMemo(() => {
    const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, VIEW_WIDTH, VIEW_HEIGHT);
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

    const newRipples: Ripple[] = fresh.map((q) => {
      const { x, y } = projectEquirectangular(q.lon, q.lat, VIEW_WIDTH, VIEW_HEIGHT);
      return { id: q.id, x, y, mag: q.mag, depthKm: q.depthKm, duration: rippleDurationMs(q.mag) };
    });
    setRipples((prev) => [...prev, ...newRipples]);

    newRipples.forEach((r) => {
      setTimeout(() => {
        setRipples((prev) => prev.filter((p) => p.id !== r.id));
      }, r.duration + 80);
    });
  }, [quakes]);

  const vignetteOpacity = 0.12 + Math.max(0, Math.min(1, unrest)) * 0.58;

  return (
    <div className="map-scene" aria-hidden="true">
      <svg className="map-svg" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="xMidYMid slice">
        <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} className="map-ocean" />
        {landPaths.map((d, i) => (
          <path key={i} d={d} className="map-land" />
        ))}
        {ripples.map((r) => (
          <circle
            key={r.id}
            cx={r.x}
            cy={r.y}
            className="map-ripple"
            style={
              {
                '--ripple-max': `${rippleMaxRadiusPx(r.mag, VIEW_WIDTH)}px`,
                '--ripple-duration': `${r.duration}ms`,
                '--ripple-color': depthRippleColor(r.depthKm),
              } as CSSProperties
            }
          />
        ))}
      </svg>
      <div className="map-vignette" style={{ opacity: vignetteOpacity }} />
    </div>
  );
}
