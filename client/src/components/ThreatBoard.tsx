import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { feature } from 'topojson-client';
// world-atlas ships pre-built TopoJSON land data (ISC-licensed): real
// cartography, no map-tile API/key needed. Restyled here as a tactical
// threat-board display, not an ambient hero background.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import worldTopology from 'world-atlas/land-110m.json';
import { geometryToSvgPath, projectEquirectangular } from '../map/projection';
import {
  clampPan,
  computeCoverFit,
  zoomAroundPoint,
  MAX_ZOOM_MULTIPLIER,
  type ViewTransform,
} from '../map/panZoom';
import { dragReducer, wasClick, IDLE_DRAG_STATE, type DragState } from '../map/dragState';
import type { Quake, Site } from '../types';

// Fixed "world space" the equirectangular projection lives in: a true 2:1
// (360deg lon : 180deg lat) plate-carree aspect, so a degree of longitude
// and a degree of latitude cover the same number of pixels. The container
// can be any pixel size/aspect; see `panZoom.ts` for how we fit this world
// rectangle into it without ever stretching x differently from y.
const WORLD_WIDTH = 720;
const WORLD_HEIGHT = 360;

interface ThreatBoardProps {
  sites: Site[];
  recentQuakes: Quake[];
  onSelectSite?: (siteId: string) => void;
  selectedSiteId?: string | null;
}

function healthColorVar(health: number): string {
  if (health < 35) return 'var(--danger)';
  if (health < 70) return 'var(--warn)';
  return 'var(--ochre)';
}

function quakeRadius(mag: number): number {
  return Math.max(1.4, Math.min(7, 1 + mag * 0.7));
}

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerMidpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function ThreatBoard({ sites, recentQuakes, onSelectSite, selectedSiteId }: ThreatBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: WORLD_WIDTH, height: WORLD_HEIGHT });
  const [baseFit, setBaseFit] = useState<ViewTransform>(() => computeCoverFit(WORLD_WIDTH, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT));
  const [view, setView] = useState<ViewTransform>(baseFit);

  const dragRef = useRef<DragState>(IDLE_DRAG_STATE);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; midpoint: { x: number; y: number } } | null>(null);

  const minScale = baseFit.scale;
  const maxScale = baseFit.scale * MAX_ZOOM_MULTIPLIER;

  const applyContainerSize = useCallback((width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    setContainerSize({ width, height });
    const fit = computeCoverFit(WORLD_WIDTH, WORLD_HEIGHT, width, height);
    setBaseFit(fit);
    setView(fit);
  }, []);

  // Measure synchronously on mount (before paint) so the very first render
  // already reflects the panel's real size, rather than waiting on
  // ResizeObserver's first callback, which some environments (e.g. a
  // backgrounded/hidden browser tab) can defer indefinitely.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    applyContainerSize(rect.width, rect.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the map fit (and current view) responsive to the panel's actual
  // pixel size, rather than a fixed viewBox stretched by CSS.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applyContainerSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyContainerSize]);

  // Non-passive wheel listener so we can preventDefault the page scroll
  // while zooming (React's synthetic onWheel is passive by default).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((current) => {
        const zoomed = zoomAroundPoint(current, pointerX, pointerY, factor, minScale, maxScale);
        const { tx, ty } = clampPan(zoomed.tx, zoomed.ty, zoomed.scale, WORLD_WIDTH, WORLD_HEIGHT, containerSize.width, containerSize.height);
        return { scale: zoomed.scale, tx, ty };
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [minScale, maxScale, containerSize.width, containerSize.height]);

  const applyPanDelta = useCallback(
    (dx: number, dy: number) => {
      setView((current) => {
        const { tx, ty } = clampPan(current.tx + dx, current.ty + dy, current.scale, WORLD_WIDTH, WORLD_HEIGHT, containerSize.width, containerSize.height);
        return { ...current, tx, ty };
      });
    },
    [containerSize.width, containerSize.height],
  );

  const handlePointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    // setPointerCapture can throw if the browser doesn't consider this
    // pointerId "active" (defensive only, real pointer/touch input always
    // qualifies); don't let that abort the rest of the gesture tracking.
    try {
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignored: dragging still works without capture, just less robust
      // to the pointer leaving the element's bounds mid-drag.
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    activePointers.current.set(e.pointerId, point);

    if (activePointers.current.size >= 2) {
      const [a, b] = Array.from(activePointers.current.values());
      pinchRef.current = { distance: pointerDistance(a, b), midpoint: pointerMidpoint(a, b) };
      dragRef.current = { ...IDLE_DRAG_STATE };
    } else {
      dragRef.current = dragReducer(IDLE_DRAG_STATE, { type: 'pointerdown', x: point.x, y: point.y }).next;
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!activePointers.current.has(e.pointerId)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      activePointers.current.set(e.pointerId, point);

      if (activePointers.current.size >= 2) {
        const [a, b] = Array.from(activePointers.current.values());
        const distance = pointerDistance(a, b);
        const midpoint = pointerMidpoint(a, b);
        if (pinchRef.current && pinchRef.current.distance > 0) {
          const factor = distance / pinchRef.current.distance;
          setView((current) => {
            const zoomed = zoomAroundPoint(current, midpoint.x, midpoint.y, factor, minScale, maxScale);
            const { tx, ty } = clampPan(zoomed.tx, zoomed.ty, zoomed.scale, WORLD_WIDTH, WORLD_HEIGHT, containerSize.width, containerSize.height);
            return { scale: zoomed.scale, tx, ty };
          });
        }
        pinchRef.current = { distance, midpoint };
        return;
      }

      const step = dragReducer(dragRef.current, { type: 'pointermove', x: point.x, y: point.y });
      dragRef.current = step.next;
      if (step.dx !== 0 || step.dy !== 0) applyPanDelta(step.dx, step.dy);
    },
    [applyPanDelta, minScale, maxScale, containerSize.width, containerSize.height],
  );

  const endGesture = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchRef.current = null;
    if (activePointers.current.size === 0) {
      dragRef.current = dragReducer(dragRef.current, { type: 'pointerup' }).next;
    }
  }, []);

  const resetView = useCallback(() => setView(baseFit), [baseFit]);
  const zoomByStep = useCallback(
    (factor: number) => {
      setView((current) => {
        const centerX = containerSize.width / 2;
        const centerY = containerSize.height / 2;
        const zoomed = zoomAroundPoint(current, centerX, centerY, factor, minScale, maxScale);
        const { tx, ty } = clampPan(zoomed.tx, zoomed.ty, zoomed.scale, WORLD_WIDTH, WORLD_HEIGHT, containerSize.width, containerSize.height);
        return { scale: zoomed.scale, tx, ty };
      });
    },
    [containerSize.width, containerSize.height, minScale, maxScale],
  );

  const landPaths = useMemo(() => {
    const project = (lon: number, lat: number) => projectEquirectangular(lon, lat, WORLD_WIDTH, WORLD_HEIGHT);
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

  const zoomedIn = view.scale > minScale * 1.01;

  return (
    <section className="panel threat-board" aria-label="Global threat board">
      <header className="panel-head">
        <span className="panel-title">Threat Board</span>
        <span className="panel-sub">Live USGS feed · {sites.length} monitored sites · drag to pan, scroll to zoom</span>
      </header>
      <div className="threat-board-view" ref={containerRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
          className="threat-board-svg"
          role="img"
          aria-label="World map with monitored sites and recent seismic activity, draggable and zoomable"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onPointerLeave={endGesture}
        >
          <rect x={0} y={0} width={containerSize.width} height={containerSize.height} className="board-ocean" />
          <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}>
            {landPaths.map((d, i) => (
              <path key={i} d={d} className="board-land" />
            ))}
            {recentQuakes.map((q) => {
              const p = projectEquirectangular(q.lon, q.lat, WORLD_WIDTH, WORLD_HEIGHT);
              return (
                <circle
                  key={q.id}
                  cx={p.x}
                  cy={p.y}
                  r={quakeRadius(q.mag) / view.scale}
                  className="board-quake"
                  opacity={0.55}
                />
              );
            })}
            {sites.map((site) => {
              const p = projectEquirectangular(site.lon, site.lat, WORLD_WIDTH, WORLD_HEIGHT);
              const selected = site.id === selectedSiteId;
              return (
                <g
                  key={site.id}
                  transform={`translate(${p.x}, ${p.y}) scale(${1 / view.scale})`}
                  className="board-site"
                  onClick={() => {
                    if (wasClick(dragRef.current)) onSelectSite?.(site.id);
                  }}
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
          </g>
        </svg>
        <div className="threat-board-controls">
          <button type="button" className="threat-board-zoom-btn" onClick={() => zoomByStep(1.4)} title="Zoom in">
            +
          </button>
          <button type="button" className="threat-board-zoom-btn" onClick={() => zoomByStep(1 / 1.4)} title="Zoom out">
            −
          </button>
          {zoomedIn && (
            <button type="button" className="threat-board-zoom-btn threat-board-reset-btn" onClick={resetView} title="Reset view">
              ⤢
            </button>
          )}
        </div>
        <div className="threat-board-sweep" aria-hidden="true" />
      </div>
    </section>
  );
}
