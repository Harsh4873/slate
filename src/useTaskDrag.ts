import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { resolveDropFromPoint, sameDropTarget, type DropTarget } from './drop-target';
import {
  HOLD_MS,
  beginPress as beginPressState,
  fireHold,
  movePress,
  type PressPointer,
  type PressState,
} from './press-gesture';

const AUTOSCROLL_EDGE_PX = 56;
const AUTOSCROLL_MAX_PX = 18;

function scrollableAncestor(start: Element | null): Element | null {
  let node: Element | null = start;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (scrolls && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

function pointerKind(event: ReactPointerEvent<HTMLElement>): PressPointer {
  return event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse';
}

export function useTaskDrag(
  moveTask: (taskId: string, sectionId: string, beforeTaskId: string | null) => void,
): {
  dragTaskId: string | null;
  dropTarget: DropTarget | null;
  beginPress(event: ReactPointerEvent<HTMLElement>, taskId: string, options?: { fromGrip?: boolean }): void;
  wasConsumed(): boolean;
} {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTargetState] = useState<DropTarget | null>(null);

  const pressRef = useRef<PressState | null>(null);
  const dragTaskIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const rowElRef = useRef<HTMLElement | null>(null);
  const captureElRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const consumedRef = useRef(false);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollElRef = useRef<Element | null>(null);
  const scrollVelRef = useRef(0);

  const moveTaskRef = useRef(moveTask);
  moveTaskRef.current = moveTask;

  const setDropTarget = useCallback((next: DropTarget | null) => {
    if (sameDropTarget(dropTargetRef.current, next)) return;
    dropTargetRef.current = next;
    setDropTargetState(next);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const stopAutoscroll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    scrollVelRef.current = 0;
  }, []);

  const enterDragChrome = useCallback((taskId: string) => {
    dragTaskIdRef.current = taskId;
    setDragTaskId(taskId);
    document.body.classList.add('is-dragging-task');
    rowElRef.current?.classList.add('is-dragging');
    // Capture only once a drag is real. Capturing a touch pointer at press-start
    // can suppress native scrolling, which would break the scroll-wins rule for a
    // pre-hold swipe; a mouse captures at press-start instead (it never scrolls).
    const el = captureElRef.current;
    const pointerId = pointerIdRef.current;
    if (el && pointerId !== null && !el.hasPointerCapture?.(pointerId)) {
      el.setPointerCapture?.(pointerId);
    }
  }, []);

  const runAutoscroll = useCallback(() => {
    rafRef.current = null;
    const container = scrollElRef.current;
    const { y } = lastPointRef.current;

    let top: number;
    let bottom: number;
    if (container) {
      const rect = container.getBoundingClientRect();
      top = rect.top;
      bottom = rect.bottom;
    } else {
      top = 0;
      bottom = window.innerHeight;
    }

    let velocity = 0;
    if (y < top + AUTOSCROLL_EDGE_PX) {
      const proximity = (top + AUTOSCROLL_EDGE_PX - y) / AUTOSCROLL_EDGE_PX;
      velocity = -AUTOSCROLL_MAX_PX * Math.min(1, Math.max(0, proximity));
    } else if (y > bottom - AUTOSCROLL_EDGE_PX) {
      const proximity = (y - (bottom - AUTOSCROLL_EDGE_PX)) / AUTOSCROLL_EDGE_PX;
      velocity = AUTOSCROLL_MAX_PX * Math.min(1, Math.max(0, proximity));
    }

    scrollVelRef.current = velocity;
    if (velocity === 0) return;

    if (container) container.scrollTop += velocity;
    else window.scrollBy(0, velocity);

    // Re-resolve the target after the surface shifted under the pointer.
    const dragId = dragTaskIdRef.current;
    if (dragId) {
      const { x } = lastPointRef.current;
      setDropTarget(resolveDropFromPoint(x, y, dragId));
    }
    rafRef.current = requestAnimationFrame(runAutoscroll);
  }, [setDropTarget]);

  const maybeAutoscroll = useCallback(() => {
    if (rafRef.current === null && scrollVelRef.current === 0) {
      rafRef.current = requestAnimationFrame(runAutoscroll);
    }
  }, [runAutoscroll]);

  const teardown = useCallback(() => {
    clearHoldTimer();
    stopAutoscroll();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('contextmenu', onContextMenu, true);

    const captureEl = captureElRef.current;
    const pointerId = pointerIdRef.current;
    if (captureEl && pointerId !== null && captureEl.hasPointerCapture?.(pointerId)) {
      captureEl.releasePointerCapture(pointerId);
    }

    document.body.classList.remove('is-dragging-task');
    rowElRef.current?.classList.remove('is-dragging');
    rowElRef.current?.classList.remove('is-pressing');

    pressRef.current = null;
    dragTaskIdRef.current = null;
    dropTargetRef.current = null;
    rowElRef.current = null;
    captureElRef.current = null;
    pointerIdRef.current = null;

    setDragTaskId(null);
    setDropTargetState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearHoldTimer, stopAutoscroll]);

  const onPointerMove = useCallback((event: globalThis.PointerEvent) => {
    const state = pressRef.current;
    if (!state) return;
    lastPointRef.current = { x: event.clientX, y: event.clientY };

    if (state.phase === 'dragging') {
      const dragId = dragTaskIdRef.current;
      if (dragId) setDropTarget(resolveDropFromPoint(event.clientX, event.clientY, dragId));
      maybeAutoscroll();
      return;
    }

    const { state: next, action } = movePress(state, event.clientX, event.clientY, event.timeStamp);
    pressRef.current = next;

    if (action === 'start-drag') {
      clearHoldTimer();
      consumedRef.current = true;
      enterDragChrome(next.taskId);
      scrollElRef.current = scrollableAncestor(rowElRef.current);
      setDropTarget(resolveDropFromPoint(event.clientX, event.clientY, next.taskId));
    } else if (action === 'cancel') {
      // Touch moved before the hold: hand the gesture back so the page scrolls.
      teardown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearHoldTimer, enterDragChrome, maybeAutoscroll, setDropTarget, teardown]);

  const onPointerUp = useCallback(() => {
    const state = pressRef.current;
    const wasDragging = state?.phase === 'dragging';
    const dragId = dragTaskIdRef.current;
    const target = dropTargetRef.current;
    if (wasDragging) consumedRef.current = true;
    if (wasDragging && dragId && target) {
      moveTaskRef.current(dragId, target.sectionId, target.beforeTaskId);
    }
    teardown();
  }, [teardown]);

  const onPointerCancel = useCallback(() => {
    teardown();
  }, [teardown]);

  const onKeyDown = useCallback((event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape' && pressRef.current?.phase === 'dragging') {
      teardown();
    }
  }, [teardown]);

  const onContextMenu = useCallback((event: globalThis.Event) => {
    // A touch hold otherwise opens the browser menu mid-press.
    if (pressRef.current) event.preventDefault();
  }, []);

  const fireHoldNow = useCallback(() => {
    holdTimerRef.current = null;
    const state = pressRef.current;
    if (!state || state.phase !== 'pressing') return;
    const next = fireHold(state);
    pressRef.current = next;
    consumedRef.current = true;
    enterDragChrome(next.taskId);
    scrollElRef.current = scrollableAncestor(rowElRef.current);
    const { x, y } = lastPointRef.current;
    setDropTarget(resolveDropFromPoint(x, y, next.taskId));
  }, [enterDragChrome, setDropTarget]);

  const beginPress = useCallback(
    (event: ReactPointerEvent<HTMLElement>, taskId: string, options?: { fromGrip?: boolean }) => {
      if (event.button !== 0) return;
      // A previous gesture that never cleaned up must not leak listeners.
      if (pressRef.current) teardown();

      const pointer = pointerKind(event);
      const fromGrip = options?.fromGrip ?? false;
      const el = event.currentTarget;

      consumedRef.current = false;
      pressRef.current = beginPressState(taskId, event.clientX, event.clientY, pointer, fromGrip, event.timeStamp);
      lastPointRef.current = { x: event.clientX, y: event.clientY };
      rowElRef.current = el.closest('.task-row');
      // Suppress the iOS selection bubble and callout for the duration of the
      // press. The CSS for this exists but nothing applied it, so a long-press
      // on touch raised the OS text-selection UI mid-gesture.
      rowElRef.current?.classList.add('is-pressing');
      captureElRef.current = el;
      pointerIdRef.current = event.pointerId;
      scrollElRef.current = null;

      if (pointer === 'mouse') el.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('contextmenu', onContextMenu, true);

      if (pointer === 'touch' || pointer === 'pen') {
        clearHoldTimer();
        holdTimerRef.current = setTimeout(fireHoldNow, HOLD_MS);
      }
    },
    [clearHoldTimer, fireHoldNow, onContextMenu, onKeyDown, onPointerCancel, onPointerMove, onPointerUp, teardown],
  );

  const wasConsumed = useCallback(() => consumedRef.current, []);

  useEffect(() => teardown, [teardown]);

  return { dragTaskId, dropTarget, beginPress, wasConsumed };
}
