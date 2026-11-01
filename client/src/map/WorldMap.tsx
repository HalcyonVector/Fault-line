import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useElementSize } from '../hooks/useElementSize';
import { computeContainFit, clampPan, zoomAroundPoint, centerOn, type ViewTransform } from './panZoom';
import { dragReducer, IDLE_DRAG_STATE, wasClick } from './dragState';
import {
  WORLD_WIDTH, WORLD_HEIGHT, SPHERE_PATH, GRATICULE_PATH, LAND_PATH, BORDERS_PATH, PLATE_PATHS,
  project, unproject, circlePath, linesPath, ringPath,
} from './geography';
import { depthColor, ageColor, magRadius, mmiColor, PLATE_COLORS } from './colors';
import { CONTOUR_LEVELS, radiusForMmi, mmiRoman } from '../seismology/intensity';
import { aftershockZoneKm } from '../seismology/aftershocks';
import { formatRelativeTime } from '../lib/format';
import type { CityImpact } from '../lib/cities';
import type { ObservedShaking, PlateKind, Quake, ShakingSource, UserLocation } from '../types';

export type ColorMode = 'depth' | 'age';

export type ViewRequest = { nonce: number; area: { lon: number; lat: number; radiusKm: number } | null };

export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  quakes: Quake[];
  selected: Quake | null;
  /** Bumped whenever the app wants the map to fly to the selected quake. */
  focusNonce: number;
  /** Zoom out to the whole world, or frame an area; acted on whenever `nonce` changes. */
  viewRequest: ViewRequest;
  onSelect: (id: string | null) => void;
  colorMode: ColorMode;
  /** "Now" for age coloring and fresh-event pulses: the playback cursor when replaying. */
  clockMs: number;
  rangeSpanMs: number;
  /** Events this recent (relative to clockMs) pulse. */
  pulseWindowMs: number;
  location: UserLocation | null;
  picking: boolean;
  onPick: (lon: number, lat: number) => void;
  showPlates: boolean;
  showShaking: boolean;
  shakingSource: ShakingSource;
  observed: ObservedShaking | null;
  impacts: CityImpact[];
  insets: MapInsets;
}

const MAX_ZOOM = 28;
const PLATE_ORDER: PlateKind[] = ['divergent', 'transform', 'convergent', 'subduction'];

export function WorldMap(props: Props) {
  const { quakes, selected, focusNonce, viewRequest, onSelect, colorMode, clockMs, rangeSpanMs, pulseWindowMs, location, picking, onPick, showPlates, showShaking, shakingSource, observed, impacts, insets } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(containerRef);
  // Default view: the whole world fitted into the area the floating panels leave uncovered.
  const fit = useMemo(() => {
    const f = computeContainFit(WORLD_WIDTH, WORLD_HEIGHT, Math.max(1, width - insets.left - insets.right), Math.max(1, height - insets.top - insets.bottom));
    return { scale: f.scale, tx: f.tx + insets.left, ty: f.ty + insets.top };
  }, [width, height, insets.left, insets.right, insets.top, insets.bottom]);
  const [view, setView] = useState<ViewTransform | null>(null);
  const [hover, setHover] = useState<Quake | null>(null);
  const drag = useRef(IDLE_DRAG_STATE);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const anim = useRef<number | null>(null);

  const minScale = fit.scale;
  const maxScale = fit.scale * MAX_ZOOM;
  const v = view ?? fit;

  const clampView = useCallback(
    (t: ViewTransform): ViewTransform => {
      const scale = Math.min(maxScale, Math.max(minScale, t.scale));
      return { scale, ...clampPan(t.tx, t.ty, scale, WORLD_WIDTH, WORLD_HEIGHT, width, height) };
    },
    [minScale, maxScale, width, height],
  );

  // Refit when the container changes size (first layout, window resize, rotation).
  useEffect(() => {
    if (width > 0 && height > 0) setView((cur) => (cur && cur.scale > fit.scale * 1.001 ? clampView(cur) : null));
  }, [width, height, fit.scale, clampView]);

  const animateTo = useCallback(
    (target: ViewTransform) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const from = view ?? fit;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        setView(clampView(target));
        return;
      }
      const start = performance.now();
      const dur = 650;
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        setView(
          clampView({
            scale: from.scale + (target.scale - from.scale) * e,
            tx: from.tx + (target.tx - from.tx) * e,
            ty: from.ty + (target.ty - from.ty) * e,
          }),
        );
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [view, fit, clampView],
  );

  // Fly to the selected quake when asked, centering it in the area the panels leave visible.
  useEffect(() => {
    if (!selected || !focusNonce || width === 0) return;
    const p = project(selected.lon, selected.lat);
    if (!p) return;
    const visW = Math.max(100, width - insets.left - insets.right);
    const visH = Math.max(100, height - insets.top - insets.bottom);
    const zoneKm = Math.max(radiusForMmi(selected.mag, selected.depthKm, 4), aftershockZoneKm(selected.mag), 450);
    // Zoom so the felt-shaking footprint spans about 70% of the visible area, with regional context around it.
    const radiusWorld = (zoneKm / 111.195) * (WORLD_WIDTH / 360) * 0.87;
    const scale = Math.min(maxScale, Math.max(minScale * 1.5, (0.35 * Math.min(visW, visH)) / radiusWorld));
    const c = centerOn(p[0], p[1], scale, visW, visH);
    animateTo({ scale, tx: c.tx + insets.left, ty: c.ty + insets.top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  useEffect(() => {
    if (!viewRequest.nonce) return;
    const a = viewRequest.area;
    const p = a ? project(a.lon, a.lat) : null;
    if (!a || !p) return animateTo(fit);
    const visW = Math.max(100, width - insets.left - insets.right);
    const visH = Math.max(100, height - insets.top - insets.bottom);
    const radiusWorld = (a.radiusKm / 111.195) * (WORLD_WIDTH / 360) * 0.87;
    const scale = Math.min(maxScale, Math.max(minScale, (0.28 * Math.min(visW, visH)) / radiusWorld));
    const c = centerOn(p[0], p[1], scale, visW, visH);
    animateTo({ scale, tx: c.tx + insets.left, ty: c.ty + insets.top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest.nonce]);

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const zoomBy = useCallback(
    (factor: number, px = width / 2, py = height / 2) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      setView((cur) => clampView(zoomAroundPoint(cur ?? fit, px, py, factor, minScale, maxScale)));
    },
    [width, height, fit, clampView, minScale, maxScale],
  );

  // Non-passive wheel listener so the page doesn't scroll while zooming the map.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = localPoint(e);
      zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), x, y);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if (anim.current) cancelAnimationFrame(anim.current);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      drag.current = { ...drag.current, moved: true };
    } else {
      drag.current = dragReducer(drag.current, { type: 'pointerdown', ...p }).next;
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = localPoint(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2 && pinchDist.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomBy(d / pinchDist.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist.current = d;
      return;
    }
    if (drag.current.active) {
      const step = dragReducer(drag.current, { type: 'pointermove', ...p });
      drag.current = step.next;
      if (step.next.moved && (step.dx || step.dy)) {
        setView((cur) => {
          const c = cur ?? fit;
          return clampView({ ...c, tx: c.tx + step.dx, ty: c.ty + step.dy });
        });
        setHover(null);
      }
      return;
    }
    const id = (e.target as Element).getAttribute?.('data-id');
    setHover(id ? quakes.find((q) => q.id === id) ?? null : null);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (!drag.current.active) return;
    drag.current = dragReducer(drag.current, { type: 'pointerup' }).next;
    if (!wasClick(drag.current) || pointers.current.size > 0) return;
    // Pointer capture retargets events to the container, so hit-test the release point ourselves.
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const id = hit?.getAttribute('data-id');
    if (picking) {
      const { x, y } = localPoint(e);
      const ll = unproject((x - v.tx) / v.scale, (y - v.ty) / v.scale);
      if (ll) onPick(ll[0], ll[1]);
      return;
    }
    onSelect(id ?? null);
  };

  const onPointerCancel = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinchDist.current = null;
    drag.current = dragReducer(drag.current, { type: 'pointercancel' }).next;
  };

  const zoomLevel = v.scale / Math.max(1e-6, minScale);
  // Markers grow gently when zoomed in, so dense clusters separate without dots ballooning.
  const markerScale = (1 + Math.log2(Math.max(1, zoomLevel)) * 0.12) / v.scale;

  const contours = useMemo(() => {
    if (!selected || !showShaking || shakingSource !== 'estimate') return [];
    return CONTOUR_LEVELS.map((level) => {
      const r = radiusForMmi(selected.mag, selected.depthKm, level);
      return { level, r, d: circlePath(selected.lon, selected.lat, r) };
    }).filter((c) => c.r > 0);
  }, [selected, showShaking, shakingSource]);

  const observedLayer = useMemo(() => {
    if (!selected || !showShaking || !observed || observed.eventId !== selected.id) return null;
    if (shakingSource === 'shakemap' && observed.shakemap) {
      return { kind: 'shakemap' as const, items: observed.shakemap.contours.map((c) => ({ key: `sm${c.mmi}`, value: c.mmi, d: linesPath(c.lines) })) };
    }
    if (shakingSource === 'dyfi' && observed.dyfi) {
      return { kind: 'dyfi' as const, items: observed.dyfi.cells.map((c, i) => ({ key: `dy${i}`, value: c.cdi, d: ringPath(c.ring) })) };
    }
    return null;
  }, [selected, showShaking, shakingSource, observed]);

  const zonePath = useMemo(() => (selected ? circlePath(selected.lon, selected.lat, aftershockZoneKm(selected.mag)) : ''), [selected]);
  const selectedPt = selected ? project(selected.lon, selected.lat) : null;
  const locationPt = location ? project(location.lon, location.lat) : null;
  const hoverPt = hover ? project(hover.lon, hover.lat) : null;

  return (
    <div
      ref={containerRef}
      className={`map${picking ? ' map-picking' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={(e) => {
        const { x, y } = localPoint(e);
        zoomBy(2, x, y);
      }}
      role="application"
      aria-label="World map of recent earthquakes. Drag to pan, scroll or pinch to zoom, click an event for details."
    >
      {width > 0 && (
        <svg width={width} height={height} className="map-svg">
          <defs>
            <radialGradient id="ocean" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#111a24" />
              <stop offset="100%" stopColor="#090d13" />
            </radialGradient>
          </defs>
          <g transform={`translate(${v.tx},${v.ty}) scale(${v.scale})`}>
            <StaticBase showPlates={showPlates} />

            {contours.map((c) => (
              <path key={c.level} d={c.d} className="contour" style={{ fill: mmiColor(c.level), stroke: mmiColor(c.level) }} />
            ))}
            {observedLayer?.kind === 'dyfi' &&
              observedLayer.items.map((c) => <path key={c.key} d={c.d} className="dyfi-cell" style={{ fill: mmiColor(c.value) }} />)}
            {observedLayer?.kind === 'shakemap' &&
              observedLayer.items.map((c) => <path key={c.key} d={c.d} className="shakemap-line" style={{ stroke: mmiColor(c.value) }} />)}
            {selected && <path d={zonePath} className="zone" />}

            <QuakeLayer quakes={quakes} colorMode={colorMode} clockMs={clockMs} rangeSpanMs={rangeSpanMs} pulseWindowMs={pulseWindowMs} markerScale={markerScale} />

            {selected && contours.map((c) => {
              const p = project(selected.lon, Math.min(89, selected.lat + c.r / 111.195));
              // Skip labels on rings too small on screen to label without colliding with the marker.
              const ringPx = p && selectedPt ? Math.abs(selectedPt[1] - p[1]) * v.scale : 0;
              return p && ringPx > 30 ? (
                <text key={c.level} x={p[0]} y={p[1]} className="contour-label" style={{ fontSize: 11 / v.scale, fill: mmiColor(c.level) }} dy={-3 / v.scale}>
                  {mmiRoman(c.level)}
                </text>
              ) : null;
            })}

            {impacts.map((c) => {
              const p = project(c.lon, c.lat);
              return p ? (
                <g key={`${c.name}-${c.country}`} className="city">
                  <circle cx={p[0]} cy={p[1]} r={2.6 / v.scale} />
                  <text x={p[0] + 5 / v.scale} y={p[1] + 3.5 / v.scale} style={{ fontSize: 11 / v.scale }}>
                    {c.name}
                  </text>
                </g>
              ) : null;
            })}

            {selectedPt && selected && (
              <g className="selected-marker" transform={`translate(${selectedPt[0]},${selectedPt[1]}) scale(${1 / v.scale})`}>
                <circle r={magRadius(selected.mag) * (1 + Math.log2(Math.max(1, zoomLevel)) * 0.12) + 5} className="selected-ring" />
                <circle r={magRadius(selected.mag) * (1 + Math.log2(Math.max(1, zoomLevel)) * 0.12) + 5} className="selected-ring selected-ring-pulse" />
              </g>
            )}

            {locationPt && (
              <g className="you" transform={`translate(${locationPt[0]},${locationPt[1]}) scale(${1 / v.scale})`}>
                <circle r={13} className="you-halo" />
                <circle r={4.5} className="you-dot" />
                <text x={9} y={-8}>You</text>
              </g>
            )}
          </g>
        </svg>
      )}

      {hover && hoverPt && !drag.current.active && (
        <div className="map-tip" style={{ left: hoverPt[0] * v.scale + v.tx, top: hoverPt[1] * v.scale + v.ty }}>
          <strong>M{hover.mag.toFixed(1)}</strong> {hover.place}
          <span>
            {hover.time ? formatRelativeTime(hover.time, Date.now()) : ''} · {Math.round(hover.depthKm)} km deep
          </span>
        </div>
      )}

      <div className="map-zoom" style={{ right: insets.right + 14, bottom: insets.bottom + 14 }}>
        <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => animateTo(fit)} aria-label="Reset view" title="Reset view">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      {picking && <div className="map-picking-hint">Click anywhere on the map to set your location · Esc to cancel</div>}
    </div>
  );
}

/** Ocean, graticule, land, borders and plate boundaries: never changes after mount, only the parent transform does. */
const StaticBase = memo(function StaticBase({ showPlates }: { showPlates: boolean }) {
  return (
    <>
      <path d={SPHERE_PATH} fill="url(#ocean)" />
      <path d={GRATICULE_PATH} className="graticule" />
      <path d={LAND_PATH} className="land" />
      <path d={BORDERS_PATH} className="borders" />
      {showPlates &&
        PLATE_ORDER.map((kind) => (
          <path key={kind} d={PLATE_PATHS[kind]} className={`plate plate-${kind}`} style={{ stroke: PLATE_COLORS[kind] }} />
        ))}
      <path d={SPHERE_PATH} className="sphere-edge" />
    </>
  );
});

interface LayerProps {
  quakes: Quake[];
  colorMode: ColorMode;
  clockMs: number;
  rangeSpanMs: number;
  pulseWindowMs: number;
  markerScale: number;
}

/** Every event as a circle in world space; memoized so panning (which only moves the parent group) never re-renders it. */
const QuakeLayer = memo(function QuakeLayer({ quakes, colorMode, clockMs, rangeSpanMs, pulseWindowMs, markerScale }: LayerProps) {
  const sorted = useMemo(() => [...quakes].sort((a, b) => a.mag - b.mag), [quakes]);
  return (
    <g className="quakes">
      {sorted.map((q) => {
        const p = project(q.lon, q.lat);
        if (!p) return null;
        const age = q.time === null ? 1 : (clockMs - q.time) / rangeSpanMs;
        const color = colorMode === 'depth' ? depthColor(q.depthKm) : ageColor(age);
        const r = magRadius(q.mag) * markerScale;
        const fresh = q.time !== null && clockMs - q.time >= 0 && clockMs - q.time < pulseWindowMs;
        return (
          <g key={q.id}>
            {fresh && <circle cx={p[0]} cy={p[1]} r={r} className="pulse" style={{ stroke: color }} />}
            {q.mag >= 5.5 && <circle cx={p[0]} cy={p[1]} r={r * 1.9} className="halo" style={{ fill: color }} />}
            <circle
              cx={p[0]}
              cy={p[1]}
              r={r}
              data-id={q.id}
              className={`quake${q.mag >= 6 ? ' quake-big' : ''}`}
              style={{ fill: color }}
            />
          </g>
        );
      })}
    </g>
  );
});
