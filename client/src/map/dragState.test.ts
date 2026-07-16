import { describe, it, expect } from 'vitest';
import { dragReducer, wasClick, IDLE_DRAG_STATE, DRAG_CLICK_THRESHOLD_PX } from './dragState';

describe('dragReducer', () => {
  it('starts a drag on pointerdown', () => {
    const { next, dx, dy } = dragReducer(IDLE_DRAG_STATE, { type: 'pointerdown', x: 10, y: 20 });
    expect(next.active).toBe(true);
    expect(next.startX).toBe(10);
    expect(next.startY).toBe(20);
    expect(next.moved).toBe(false);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  it('reports incremental delta on pointermove and ignores moves while inactive', () => {
    const afterDown = dragReducer(IDLE_DRAG_STATE, { type: 'pointerdown', x: 0, y: 0 }).next;
    const moved = dragReducer(afterDown, { type: 'pointermove', x: 5, y: 8 });
    expect(moved.dx).toBe(5);
    expect(moved.dy).toBe(8);
    expect(moved.next.lastX).toBe(5);
    expect(moved.next.lastY).toBe(8);

    const ignored = dragReducer(IDLE_DRAG_STATE, { type: 'pointermove', x: 100, y: 100 });
    expect(ignored.next).toEqual(IDLE_DRAG_STATE);
    expect(ignored.dx).toBe(0);
  });

  it('stays "not moved" for tiny jitter under the click threshold', () => {
    const down = dragReducer(IDLE_DRAG_STATE, { type: 'pointerdown', x: 0, y: 0 }).next;
    const tinyMove = dragReducer(down, { type: 'pointermove', x: 1, y: 1 }).next;
    expect(tinyMove.moved).toBe(false);
    const upState = dragReducer(tinyMove, { type: 'pointerup' }).next;
    expect(wasClick(upState)).toBe(true);
  });

  it('flags "moved" once total displacement exceeds the click threshold', () => {
    const down = dragReducer(IDLE_DRAG_STATE, { type: 'pointerdown', x: 0, y: 0 }).next;
    const bigMove = dragReducer(down, { type: 'pointermove', x: DRAG_CLICK_THRESHOLD_PX + 10, y: 0 }).next;
    expect(bigMove.moved).toBe(true);
    const upState = dragReducer(bigMove, { type: 'pointerup' }).next;
    expect(wasClick(upState)).toBe(false);
  });

  it('deactivates on pointerup while preserving the moved flag', () => {
    const down = dragReducer(IDLE_DRAG_STATE, { type: 'pointerdown', x: 0, y: 0 }).next;
    const moved = dragReducer(down, { type: 'pointermove', x: 50, y: 50 }).next;
    const up = dragReducer(moved, { type: 'pointerup' }).next;
    expect(up.active).toBe(false);
    expect(up.moved).toBe(true);
  });

  it('resets to idle on pointercancel', () => {
    const down = dragReducer(IDLE_DRAG_STATE, { type: 'pointerdown', x: 3, y: 4 }).next;
    const cancelled = dragReducer(down, { type: 'pointercancel' }).next;
    expect(cancelled).toEqual(IDLE_DRAG_STATE);
  });
});
