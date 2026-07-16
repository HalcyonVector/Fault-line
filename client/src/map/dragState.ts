/**
 * Pure drag-state reducer for the Threat Board map's click-vs-drag
 * disambiguation. Pointer events (down/move/up) feed in; it tracks whether
 * the gesture has moved past a small pixel threshold, and hands back the
 * incremental screen-space delta to apply as a pan. A site marker's click
 * handler consults `wasClick` on the state produced by the matching
 * `pointerup` to decide whether the release was a genuine tap (fire
 * `onSelectSite`) or the end of a drag (don't).
 */

export interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

export const IDLE_DRAG_STATE: DragState = {
  active: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  moved: false,
};

export type DragPointerEvent =
  | { type: 'pointerdown'; x: number; y: number }
  | { type: 'pointermove'; x: number; y: number }
  | { type: 'pointerup' }
  | { type: 'pointercancel' };

export interface DragStep {
  next: DragState;
  /** Incremental screen-space movement since the last event, to add to a pan translate. */
  dx: number;
  dy: number;
}

/** Below this many pixels of total movement, a gesture still counts as a click, not a drag. */
export const DRAG_CLICK_THRESHOLD_PX = 4;

/** Advance a `DragState` by one pointer event, returning the next state and any pan delta. */
export function dragReducer(state: DragState, event: DragPointerEvent): DragStep {
  switch (event.type) {
    case 'pointerdown':
      return {
        next: { active: true, startX: event.x, startY: event.y, lastX: event.x, lastY: event.y, moved: false },
        dx: 0,
        dy: 0,
      };
    case 'pointermove': {
      if (!state.active) return { next: state, dx: 0, dy: 0 };
      const dx = event.x - state.lastX;
      const dy = event.y - state.lastY;
      const totalDx = event.x - state.startX;
      const totalDy = event.y - state.startY;
      const moved = state.moved || Math.hypot(totalDx, totalDy) > DRAG_CLICK_THRESHOLD_PX;
      return { next: { ...state, lastX: event.x, lastY: event.y, moved }, dx, dy };
    }
    case 'pointerup':
      return { next: { ...state, active: false }, dx: 0, dy: 0 };
    case 'pointercancel':
      return { next: { ...IDLE_DRAG_STATE }, dx: 0, dy: 0 };
    default:
      return { next: state, dx: 0, dy: 0 };
  }
}

/** True if the gesture that produced `state` should be treated as a click rather than a pan/drag. */
export function wasClick(state: DragState): boolean {
  return !state.moved;
}
