// 3D globe: a translucent Earth with every event placed at its (exaggerated)
// true depth, so intermediate and deep quakes trace the subducting slabs that
// produce them. Loaded lazily; three.js never ships with the 2D map.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import countries from 'world-atlas/countries-110m.json';
import plateLines from '../data/plateBoundaries.json';
import { lonLatToXYZ, depthRadius, markerSize, DEPTH_EXAGGERATION } from './math';
import { depthColor, ageColor, PLATE_COLORS } from '../map/colors';
import { formatRelativeTime } from '../lib/format';
import type { ColorMode, MapInsets, ViewRequest } from '../map/WorldMap';
import type { PlateKind, Quake, UserLocation } from '../types';

interface Props {
  quakes: Quake[];
  selected: Quake | null;
  focusNonce: number;
  viewRequest: ViewRequest;
  onSelect: (id: string | null) => void;
  colorMode: ColorMode;
  clockMs: number;
  rangeSpanMs: number;
  showPlates: boolean;
  location: UserLocation | null;
  insets: MapInsets;
}

const CLASS_KIND: Record<string, PlateKind> = {
  SUB: 'subduction', OCB: 'convergent', CCB: 'convergent', OSR: 'divergent', CRB: 'divergent', OTF: 'transform', CTF: 'transform',
};

const HOME_DISTANCE = 3.75;

/** Line segments (pairs of points) for a set of lon/lat polylines at radius r. */
function segmentsGeometry(lines: [number, number][][], r: number): THREE.BufferGeometry {
  const pts: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [lon0, lat0] = line[i - 1];
      const [lon1, lat1] = line[i];
      if (Math.abs(lon1 - lon0) > 180) continue; // antimeridian jump in the source data
      pts.push(...lonLatToXYZ(lon0, lat0, r), ...lonLatToXYZ(lon1, lat1, r));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function landRings(): [number, number][][] {
  const topo = countries as unknown as Topology<{ land: GeometryCollection }>;
  const land = feature(topo, topo.objects.land) as unknown as { features: { geometry: { type: string; coordinates: unknown } }[] };
  const rings: [number, number][][] = [];
  for (const f of land.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') rings.push(...(g.coordinates as [number, number][][]));
    if (g.type === 'MultiPolygon') for (const poly of g.coordinates as [number, number][][][]) rings.push(...poly);
  }
  return rings;
}

function graticule(): [number, number][][] {
  const lines: [number, number][][] = [];
  for (let lon = -180; lon < 180; lon += 20) lines.push(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5] as [number, number]));
  for (let lat = -80; lat <= 80; lat += 20) lines.push(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat] as [number, number]));
  return lines;
}

/** Markers shrink as you zoom in so dense clusters separate, and grow a little when zoomed out. */
const zoomScale = (distance: number) => Math.min(1.4, Math.max(0.3, distance / HOME_DISTANCE));

interface Scene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  plates: THREE.Group;
  quakeGroup: THREE.Group;
  rescale: () => void;
  invalidate: () => void;
  marker: THREE.Mesh;
  you: THREE.Mesh;
  dispose: () => void;
}

export default function GlobeView({ quakes, selected, focusNonce, viewRequest, onSelect, colorMode, clockMs, rangeSpanMs, showPlates, location, insets }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const pickRef = useRef<{ q: Quake; pos: THREE.Vector3 }[]>([]);
  const flyRef = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t0: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ q: Quake; x: number; y: number } | null>(null);

  // ---- One-time scene setup ----------------------------------------------------
  useEffect(() => {
    const host = hostRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(...lonLatToXYZ(150, 15, HOME_DISTANCE));

    // Render on demand: only when the camera moved, an animation is running, or
    // something in the scene changed (invalidate()). Idle globes cost nothing.
    let dirty = true;
    const invalidate = () => {
      dirty = true;
    };
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 1.25;
    controls.maxDistance = 7;
    controls.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    controls.autoRotateSpeed = 0.35;
    controls.addEventListener('change', invalidate);
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      flyRef.current = null;
    });

    // Translucent shell so events inside the Earth stay visible through it.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshBasicMaterial({ color: 0x111a24, transparent: true, opacity: 0.62, depthWrite: false }),
    );
    shell.renderOrder = 2;
    scene.add(shell);

    // Faint core and a soft atmosphere rim for depth cues.
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.546, 48, 32), new THREE.MeshBasicMaterial({ color: 0x1b1410, transparent: true, opacity: 0.35, depthWrite: false }));
    scene.add(core);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // Glow only where the view ray grazes the sphere (the limb), not across the disc.
        vertexShader:
          'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
        fragmentShader:
          'varying vec3 vN; varying vec3 vP; void main(){ float rim = 1.0 - abs(dot(vN, normalize(-vP))); float i = pow(rim, 6.0); gl_FragColor = vec4(1.0, 0.42, 0.21, 1.0) * i * 0.9; }',
      }),
    );
    scene.add(atmosphere);

    const grat = new THREE.LineSegments(segmentsGeometry(graticule(), 1.0005), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 }));
    const coast = new THREE.LineSegments(segmentsGeometry(landRings(), 1.001), new THREE.LineBasicMaterial({ color: 0x5c6b7d, transparent: true, opacity: 0.85 }));
    scene.add(grat, coast);

    const plates = new THREE.Group();
    const byKind: Record<PlateKind, [number, number][][]> = { subduction: [], convergent: [], divergent: [], transform: [] };
    for (const [cls, lines] of Object.entries(plateLines as unknown as Record<string, [number, number][][]>)) byKind[CLASS_KIND[cls]].push(...lines);
    for (const kind of Object.keys(byKind) as PlateKind[]) {
      plates.add(new THREE.LineSegments(segmentsGeometry(byKind[kind], 1.002), new THREE.LineBasicMaterial({ color: PLATE_COLORS[kind], transparent: true, opacity: 0.6 })));
    }
    scene.add(plates);

    const quakeGroup = new THREE.Group();
    scene.add(quakeGroup);

    // Instance matrices are rebuilt when the zoom level changes enough to matter.
    let lastScale = zoomScale(camera.position.length());
    const rescale = () => {
      const mesh = quakeGroup.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh | undefined;
      if (!mesh) return;
      const k = zoomScale(camera.position.length());
      const m4 = new THREE.Matrix4();
      pickRef.current.forEach(({ q, pos }, i) => {
        const size = markerSize(q.mag) * k;
        m4.makeScale(size, size, size).setPosition(pos);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      lastScale = k;
      invalidate();
    };
    controls.addEventListener('change', () => {
      if (Math.abs(zoomScale(camera.position.length()) / lastScale - 1) > 0.08) rescale();
    });

    const marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }));
    marker.visible = false;
    marker.renderOrder = 10;
    scene.add(marker);

    const you = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), new THREE.MeshBasicMaterial({ color: 0x3ddcd3 }));
    you.visible = false;
    scene.add(you);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      invalidate();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const fly = flyRef.current;
      if (fly) {
        const k = Math.min(1, (t - fly.t0) / 900);
        const e = 1 - Math.pow(1 - k, 3);
        camera.position.copy(fly.from).lerp(fly.to, e).setLength(fly.from.length() + (fly.to.length() - fly.from.length()) * e);
        if (k >= 1) flyRef.current = null;
      }
      if (fly) dirty = true;
      // update() returns true while damping or auto-rotation moves the camera.
      if (controls.update()) dirty = true;
      if (!dirty) return;
      dirty = false;
      if (marker.visible) marker.lookAt(camera.position);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    sceneRef.current = {
      renderer, scene, camera, controls, plates, quakeGroup, rescale, invalidate, marker, you,
      dispose: () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ---- Camera offset so the globe centres in the area the panels leave free ----
  useEffect(() => {
    const s = sceneRef.current;
    const host = hostRef.current;
    if (!s || !host) return;
    const apply = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      s.camera.setViewOffset(w, h, (insets.right - insets.left) / 2, (insets.bottom - insets.top) / 2, w, h);
      s.invalidate();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [insets.left, insets.right, insets.top, insets.bottom]);

  // ---- Events --------------------------------------------------------------------
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.quakeGroup.children.forEach((c) => {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    s.quakeGroup.clear();
    s.invalidate();
    if (!quakes.length) {
      pickRef.current = [];
      return;
    }

    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), quakes.length);
    const stalkPts: number[] = [];
    const stalkCols: number[] = [];
    const m4 = new THREE.Matrix4();
    const color = new THREE.Color();
    const picks: { q: Quake; pos: THREE.Vector3 }[] = [];
    quakes.forEach((q, i) => {
      const r = depthRadius(q.depthKm);
      const pos = new THREE.Vector3(...lonLatToXYZ(q.lon, q.lat, r));
      const size = markerSize(q.mag);
      m4.makeScale(size, size, size).setPosition(pos);
      mesh.setMatrixAt(i, m4);
      const age = q.time === null ? 1 : (clockMs - q.time) / rangeSpanMs;
      color.setStyle(colorMode === 'depth' ? depthColor(q.depthKm) : ageColor(age));
      mesh.setColorAt(i, color);
      picks.push({ q, pos });
      // A faint stalk from the surface down to each event at depth makes depth legible.
      if (q.depthKm > 30) {
        stalkPts.push(...lonLatToXYZ(q.lon, q.lat, 1), pos.x, pos.y, pos.z);
        stalkCols.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    s.quakeGroup.add(mesh);

    if (stalkPts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(stalkPts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(stalkCols, 3));
      s.quakeGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28 })));
    }
    pickRef.current = picks;
    s.rescale();
  }, [quakes, colorMode, clockMs, rangeSpanMs]);

  useEffect(() => {
    const s = sceneRef.current;
    if (s) {
      s.plates.visible = showPlates;
      s.invalidate();
    }
  }, [showPlates]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.you.visible = !!location;
    if (location) s.you.position.set(...lonLatToXYZ(location.lon, location.lat, 1.003));
    s.invalidate();
  }, [location]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.marker.visible = !!selected;
    if (selected) {
      const size = (markerSize(selected.mag) * 1.9 + 0.006) * zoomScale(Math.min(s.camera.position.length(), 2.4));
      s.marker.position.set(...lonLatToXYZ(selected.lon, selected.lat, depthRadius(selected.depthKm)));
      s.marker.scale.setScalar(size);
    }
    s.invalidate();
  }, [selected]);

  // Fly to the selected quake, keeping the current zoom level.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !selected || !focusNonce) return;
    s.controls.autoRotate = false;
    const dist = Math.min(s.camera.position.length(), 2.4);
    flyRef.current = { from: s.camera.position.clone(), to: new THREE.Vector3(...lonLatToXYZ(selected.lon, selected.lat, dist)), t0: performance.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !viewRequest.nonce) return;
    s.controls.autoRotate = false;
    const a = viewRequest.area;
    const to = a
      ? new THREE.Vector3(...lonLatToXYZ(a.lon, a.lat, Math.min(HOME_DISTANCE, 1.35 + a.radiusKm / 1500)))
      : s.camera.position.clone().setLength(HOME_DISTANCE);
    flyRef.current = { from: s.camera.position.clone(), to, t0: performance.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest.nonce]);

  // ---- Picking: nearest event on screen within a few pixels, nearest to camera on ties ----
  const pickAt = (clientX: number, clientY: number): Quake | null => {
    const s = sceneRef.current;
    const host = hostRef.current;
    if (!s || !host) return null;
    const rect = host.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best: { q: Quake; d: number; z: number } | null = null;
    for (const { q, pos } of pickRef.current) {
      v.copy(pos).project(s.camera);
      if (v.z > 1) continue;
      const x = ((v.x + 1) / 2) * rect.width;
      const y = ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(x - (clientX - rect.left), y - (clientY - rect.top));
      const reach = 6 + markerSize(q.mag) * 500 * zoomScale(s.camera.position.length());
      if (d > reach) continue;
      const z = pos.distanceTo(s.camera.position);
      if (!best || d < best.d - 2 || (Math.abs(d - best.d) <= 2 && z < best.z)) best = { q, d, z };
    }
    return best?.q ?? null;
  };

  const down = useRef<{ x: number; y: number } | null>(null);

  const zoom = (factor: number) => {
    const s = sceneRef.current;
    if (!s) return;
    const len = Math.min(s.controls.maxDistance, Math.max(s.controls.minDistance, s.camera.position.length() * factor));
    s.camera.position.setLength(len);
    s.invalidate();
  };

  if (failed) {
    return (
      <div className="globe globe-failed">
        <p>3D needs WebGL, which this browser or device doesn't provide. The 2D map has everything else.</p>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className="globe"
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onPointerMove={(e) => {
        if (e.buttons) return setHover(null);
        const q = pickAt(e.clientX, e.clientY);
        const rect = hostRef.current!.getBoundingClientRect();
        setHover(q ? { q, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
        onSelect(pickAt(e.clientX, e.clientY)?.id ?? null);
      }}
      role="application"
      aria-label="3D globe of recent earthquakes at their true depths. Drag to rotate, scroll to zoom, click an event for details."
    >
      {hover && (
        <div className="map-tip" style={{ left: hover.x, top: hover.y }}>
          <strong>M{hover.q.mag.toFixed(1)}</strong> {hover.q.place}
          <span>
            {hover.q.time ? formatRelativeTime(hover.q.time, Date.now()) : ''} · {Math.round(hover.q.depthKm)} km deep
          </span>
        </div>
      )}
      <div className="globe-note" style={{ left: insets.left + 190, top: insets.top + 21 }}>Event depths drawn {DEPTH_EXAGGERATION}× true scale · inner sphere: Earth's core, to scale</div>
      <div className="map-zoom" style={{ right: insets.right + 14, bottom: insets.bottom + 14 }}>
        <button type="button" onClick={() => zoom(1 / 1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom out">−</button>
        <button
          type="button"
          onClick={() => {
            const s = sceneRef.current;
            if (s) flyRef.current = { from: s.camera.position.clone(), to: s.camera.position.clone().setLength(HOME_DISTANCE), t0: performance.now() };
          }}
          aria-label="Reset view"
          title="Reset view"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
