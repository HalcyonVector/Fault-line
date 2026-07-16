import { describe, it, expect } from 'vitest';
import { computeCoverFit, clampScale, zoomAroundPoint, clampPan, MAX_ZOOM_MULTIPLIER } from './panZoom';

describe('computeCoverFit', () => {
  it('scales to fill the wider axis and crops the other when aspect ratios differ (square container)', () => {
    // World is 2:1 (wider than tall), container is a 1:1 square -> height is the binding constraint,
    // so the world overflows horizontally instead of leaving empty space above/below.
    const fit = computeCoverFit(720, 360, 500, 500);
    expect(fit.scale).toBeCloseTo(500 / 360, 5);
    expect(fit.tx).toBeLessThan(0); // world is wider than the container at this scale, centered by cropping the sides
    expect(fit.ty).toBeCloseTo(0, 5);
  });

  it('scales to fill the height and overflows left/right when the container is proportionally narrower than the world', () => {
    // World is 2:1, container is 1.8:1 (900x500) -> narrower than the world's own ratio, so height is binding.
    const fit = computeCoverFit(720, 360, 900, 500);
    expect(fit.scale).toBeCloseTo(500 / 360, 5);
    expect(fit.tx).toBeLessThan(0);
    expect(fit.ty).toBeCloseTo(0, 5);
  });

  it('never leaves empty space on either axis (always covers, unlike a "contain" fit)', () => {
    const fit = computeCoverFit(720, 360, 900, 400);
    expect(720 * fit.scale).toBeGreaterThanOrEqual(900 - 1e-6);
    expect(360 * fit.scale).toBeGreaterThanOrEqual(400 - 1e-6);
  });

  it('produces a scale that keeps x and y uniform (never distorts)', () => {
    const fit = computeCoverFit(720, 360, 900, 400);
    // A world point's screen position must scale identically in both axes.
    const scaleX = fit.scale;
    const scaleY = fit.scale;
    expect(scaleX).toBe(scaleY);
  });

  it('falls back to a safe default for degenerate input', () => {
    expect(computeCoverFit(0, 360, 500, 500)).toEqual({ scale: 1, tx: 0, ty: 0 });
    expect(computeCoverFit(720, 360, 0, 500)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});

describe('clampScale', () => {
  it('clamps within [min, max]', () => {
    expect(clampScale(0.1, 1, 10)).toBe(1);
    expect(clampScale(50, 1, 10)).toBe(10);
    expect(clampScale(5, 1, 10)).toBe(5);
  });
});

describe('zoomAroundPoint', () => {
  it('keeps the world point under the pointer fixed on screen after zooming in', () => {
    const base = { scale: 1, tx: 0, ty: 0 };
    const pointer = { x: 100, y: 50 };
    const worldXBefore = (pointer.x - base.tx) / base.scale;
    const worldYBefore = (pointer.y - base.ty) / base.scale;

    const next = zoomAroundPoint(base, pointer.x, pointer.y, 2, 0.5, 10);

    const worldXAfter = (pointer.x - next.tx) / next.scale;
    const worldYAfter = (pointer.y - next.ty) / next.scale;
    expect(worldXAfter).toBeCloseTo(worldXBefore, 6);
    expect(worldYAfter).toBeCloseTo(worldYBefore, 6);
    expect(next.scale).toBeCloseTo(2, 6);
  });

  it('does not zoom in past maxScale', () => {
    const base = { scale: 5, tx: 0, ty: 0 };
    const next = zoomAroundPoint(base, 0, 0, 10, 0.5, 10);
    expect(next.scale).toBe(10);
  });

  it('does not zoom out past minScale', () => {
    const base = { scale: 1, tx: 0, ty: 0 };
    const next = zoomAroundPoint(base, 0, 0, 0.01, 1, 10);
    expect(next.scale).toBe(1);
  });

  it('respects a sane max-zoom multiplier relative to the base fit', () => {
    const minScale = computeCoverFit(720, 360, 900, 400).scale;
    const maxScale = minScale * MAX_ZOOM_MULTIPLIER;
    const next = zoomAroundPoint({ scale: minScale, tx: 0, ty: 0 }, 0, 0, 1000, minScale, maxScale);
    expect(next.scale).toBeCloseTo(maxScale, 6);
  });
});

describe('clampPan', () => {
  it('allows free movement while the scaled world is smaller than the container', () => {
    // scaledWidth = 360, container 500 -> slack of 140px either side.
    const result = clampPan(9999, 9999, 1, 360, 200, 500, 200);
    expect(result.tx).toBeLessThanOrEqual(500 - 360);
    expect(result.tx).toBeGreaterThanOrEqual(0);
  });

  it('keeps at least part of the world on screen when zoomed in beyond the container size', () => {
    // scaledWidth/Height (2000x1000) far exceed the container (500x400).
    const dragged = clampPan(-50000, -50000, 1, 2000, 1000, 500, 400);
    expect(dragged.tx).toBeGreaterThanOrEqual(500 - 2000);
    expect(dragged.tx).toBeLessThanOrEqual(0);
    expect(dragged.ty).toBeGreaterThanOrEqual(400 - 1000);
    expect(dragged.ty).toBeLessThanOrEqual(0);
  });

  it('clamps an over-eager drag toward the origin the same way', () => {
    const dragged = clampPan(50000, 50000, 1, 2000, 1000, 500, 400);
    expect(dragged.tx).toBe(0);
    expect(dragged.ty).toBe(0);
  });
});
