/**
 * Pure screen<->world transform math for the Threat Board's interactive map.
 *
 * The map keeps a fixed "world space" coordinate system (the equirectangular
 * projection's own width/height, see `projection.ts`) and renders it inside
 * a container of whatever pixel size the panel happens to be. Rather than
 * stretching the world's aspect ratio to fill the container (which distorts
 * geography), we compute a uniform `scale` plus a `tx`/`ty` pixel offset and
 * apply it as an SVG `translate(...) scale(...)` transform on a content
 * group. Panning and zooming only ever adjust `scale`/`tx`/`ty`; the world's
 * own coordinate system, and therefore its aspect ratio, never changes.
 */

export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

/** How far past the default fill-the-container view a user may zoom in. */
export const MAX_ZOOM_MULTIPLIER = 14;

/**
 * The "cover" fit: the smallest uniform scale at which the world rectangle
 * fills the container completely on both axes, centered, with any overflow
 * cropped rather than shown as empty space. This is both the initial view
 * and the minimum zoom level, matching how Google Maps always fills its
 * viewport edge to edge; you pan to reveal whichever part of the world got
 * cropped instead of ever seeing letterboxed dead space around a shrunken map.
 */
export function computeCoverFit(
  worldWidth: number,
  worldHeight: number,
  containerWidth: number,
  containerHeight: number,
): ViewTransform {
  if (worldWidth <= 0 || worldHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const scale = Math.max(containerWidth / worldWidth, containerHeight / worldHeight);
  const tx = (containerWidth - worldWidth * scale) / 2;
  const ty = (containerHeight - worldHeight * scale) / 2;
  return { scale, tx, ty };
}

/** Clamp a zoom scale to [minScale, maxScale]. */
export function clampScale(scale: number, minScale: number, maxScale: number): number {
  return Math.max(minScale, Math.min(maxScale, scale));
}

/**
 * Zoom by `factor`, keeping the world point currently under
 * (`pointerX`, `pointerY`, in container-pixel coordinates) fixed on
 * screen, the way Google Maps anchors a scroll/pinch zoom to the cursor
 * rather than the container's center.
 */
export function zoomAroundPoint(
  current: ViewTransform,
  pointerX: number,
  pointerY: number,
  factor: number,
  minScale: number,
  maxScale: number,
): ViewTransform {
  const nextScale = clampScale(current.scale * factor, minScale, maxScale);
  const appliedFactor = nextScale / current.scale;
  const tx = pointerX - (pointerX - current.tx) * appliedFactor;
  const ty = pointerY - (pointerY - current.ty) * appliedFactor;
  return { scale: nextScale, tx, ty };
}

/**
 * Keep the panned world content from being dragged entirely out of view:
 * clamp `tx`/`ty` so at least one edge of the scaled world rectangle always
 * stays within the container's bounds (matching how Google Maps lets you
 * pan freely but not lose the map entirely off-screen).
 */
export function clampPan(
  tx: number,
  ty: number,
  scale: number,
  worldWidth: number,
  worldHeight: number,
  containerWidth: number,
  containerHeight: number,
): { tx: number; ty: number } {
  const scaledWidth = worldWidth * scale;
  const scaledHeight = worldHeight * scale;

  const minTx = Math.min(0, containerWidth - scaledWidth);
  const maxTx = Math.max(0, containerWidth - scaledWidth);
  const minTy = Math.min(0, containerHeight - scaledHeight);
  const maxTy = Math.max(0, containerHeight - scaledHeight);

  return {
    tx: Math.min(maxTx, Math.max(minTx, tx)),
    ty: Math.min(maxTy, Math.max(minTy, ty)),
  };
}
