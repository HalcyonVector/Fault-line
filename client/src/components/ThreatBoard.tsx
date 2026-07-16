import { useMemo } from 'react';
import { feature } from 'topojson-client';
// world-atlas ships pre-built TopoJSON land data (ISC-licensed) — real
// cartography, no map-tile API/key needed. Restyled here as a tactical
// threat-board display, not an ambient hero background.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldTopology from 'world-atlas/land-110m.json';
import { geometryToSvgPath, projectEquirectangular } from '../map/projection';
import type { Quake, Site } from '../types';

const WIDTH = 720;
const HEIGHT = 340;

interface ThreatBoardProps {
  sites: Site[];
  recentQuakes: Quake[];
  onSelectSite?: (siteId: string) => void;
  selectedSiteId?: string | null;
}

function healthColorVar(health: number): string {
  if (health < 35) return 'var(--danger)';
  if (health < 70) return 'var(--warn)';
  return 'var(--cyan)';
}

function quakeRadius(mag: number): number {
  return Math.max(1.4, Math.min(7, 1 + mag * 0.7));
}

export function ThreatBoard({ sites, recentQuakes, onSelectSite, selectedSiteId }: ThreatBoardProps) {
  const landPaths = useMemo(() => {
    const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, WIDTH, HEIGHT);
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

  return (
    <section className="panel threat-board" aria-label="Global threat board">
      <header className="panel-head">
        <span className="panel-title">Threat Board</span>
        <span className="panel-sub">Live USGS feed · {sites.length} monitored sites</span>
      </header>
      <div className="threat-board-view">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="threat-board-svg" role="img" aria-label="World map with monitored sites and recent seismic activity">
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="board-ocean" />
          {landPaths.map((d, i) => (
            <path key={i} d={d} className="board-land" />
          ))}
          {recentQuakes.map((q) => {
            const p = projectEquirectangular(q.lon, q.lat, WIDTH, HEIGHT);
            return (
              <circle
                key={q.id}
                cx={p.x}
                cy={p.y}
                r={quakeRadius(q.mag)}
                className="board-quake"
                opacity={0.55}
              />
            );
          })}
          {sites.map((site) => {
            const p = projectEquirectangular(site.lon, site.lat, WIDTH, HEIGHT);
            const selected = site.id === selectedSiteId;
            return (
              <g
                key={site.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="board-site"
                onClick={() => onSelectSite?.(site.id)}
                role="button"
                tabIndex={0}
                aria-label={`${site.name}, resilience ${Math.round(site.resilience)}, health ${Math.round(site.health)}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectSite?.(site.id);
                }}
              >
                {site.overduePressure.clamped >= 0.85 && <circle r={10} className="board-site-pressure-ring" />}
                <circle r={selected ? 7 : 5} style={{ fill: healthColorVar(site.health) }} className="board-site-dot" />
                <text x={9} y={4} className="board-site-label">
                  {site.name}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="threat-board-sweep" aria-hidden="true" />
        <div className="threat-board-scanlines" aria-hidden="true" />
      </div>
    </section>
  );
}
