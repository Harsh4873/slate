export type PressPhase = 'idle' | 'pressing' | 'dragging' | 'cancelled';
export type PressPointer = 'mouse' | 'touch' | 'pen';

export const HOLD_MS = 450; // touch hold before a drag begins
export const MOVE_CANCEL_PX = 8; // touch movement before the hold that hands over to scrolling
export const MOUSE_DRAG_PX = 4; // mouse movement from the grip that starts a drag

export interface PressState {
  phase: PressPhase;
  taskId: string;
  originX: number;
  originY: number;
  pointer: PressPointer;
  fromGrip: boolean;
  startedAt: number;
}

export type PressAction = 'none' | 'start-drag' | 'cancel';

export function beginPress(
  taskId: string,
  x: number,
  y: number,
  pointer: PressPointer,
  fromGrip: boolean,
  now: number,
): PressState {
  return {
    phase: 'pressing',
    taskId,
    originX: x,
    originY: y,
    pointer,
    fromGrip,
    startedAt: now,
  };
}

export function movedBeyond(state: PressState, x: number, y: number, px: number): boolean {
  const dx = x - state.originX;
  const dy = y - state.originY;
  // True distance, not per-axis. Boundary is exclusive: exactly px is not "beyond".
  return dx * dx + dy * dy > px * px;
}

export function movePress(
  state: PressState,
  x: number,
  y: number,
  now: number,
): { state: PressState; action: PressAction } {
  if (state.phase !== 'pressing') {
    // dragging or cancelled (or idle): nothing to decide here.
    return { state, action: 'none' };
  }

  if (state.pointer === 'mouse') {
    if (state.fromGrip && movedBeyond(state, x, y, MOUSE_DRAG_PX)) {
      return { state: { ...state, phase: 'dragging' }, action: 'start-drag' };
    }
    // A mouse press on the row body is a click, not a drag.
    return { state, action: 'none' };
  }

  // touch or pen
  if (!holdIsDue(state, now) && movedBeyond(state, x, y, MOVE_CANCEL_PX)) {
    // The page must scroll: hand the gesture back before the hold fires.
    return { state: { ...state, phase: 'cancelled' }, action: 'cancel' };
  }
  return { state, action: 'none' };
}

export function holdIsDue(state: PressState, now: number): boolean {
  return now - state.startedAt >= HOLD_MS;
}

export function fireHold(state: PressState): PressState {
  if (state.phase !== 'pressing') return state;
  return { ...state, phase: 'dragging' };
}

export function endPress(state: PressState): { state: PressState; tapped: boolean } {
  const tapped = state.phase === 'pressing';
  return { state: { ...state, phase: 'idle' }, tapped };
}
