import { describe, expect, it } from 'vitest';
import {
  HOLD_MS,
  beginPress,
  endPress,
  fireHold,
  holdIsDue,
  movePress,
  movedBeyond,
  type PressState,
} from './press-gesture';

const at = (state: PressState, x: number, y: number) => ({ x: state.originX + x, y: state.originY + y });

describe('press-gesture', () => {
  it('begins in the pressing phase', () => {
    const state = beginPress('t1', 100, 200, 'mouse', true, 0);
    expect(state.phase).toBe('pressing');
    expect(state.taskId).toBe('t1');
    expect(state.originX).toBe(100);
    expect(state.originY).toBe(200);
  });

  it('starts a mouse drag from the grip past 4px, not before', () => {
    const state = beginPress('t1', 0, 0, 'mouse', true, 0);
    const move5 = movePress(state, 5, 0, 1);
    expect(move5.action).toBe('start-drag');
    expect(move5.state.phase).toBe('dragging');

    const move3 = movePress(state, 3, 0, 1);
    expect(move3.action).toBe('none');
    expect(move3.state.phase).toBe('pressing');
    expect(move3.state).toBe(state);
  });

  it('never starts a mouse drag from the row body', () => {
    const state = beginPress('t1', 0, 0, 'mouse', false, 0);
    expect(movePress(state, 5, 0, 1).action).toBe('none');
    expect(movePress(state, 500, 0, 1).action).toBe('none');
    expect(movePress(state, 500, 0, 1).state).toBe(state);
  });

  it('cancels a touch press that moves 12px before the hold, so the page scrolls', () => {
    const state = beginPress('t1', 0, 0, 'touch', false, 0);
    const result = movePress(state, 12, 0, 100);
    expect(result.action).toBe('cancel');
    expect(result.state.phase).toBe('cancelled');
  });

  it('holds a touch press that moves only 3px before the hold', () => {
    const state = beginPress('t1', 0, 0, 'touch', false, 0);
    const result = movePress(state, 3, 0, 100);
    expect(result.action).toBe('none');
    expect(result.state.phase).toBe('pressing');
    expect(result.state).toBe(state);
  });

  it('lets a touch press held past HOLD_MS become a drag, and ignores later movement', () => {
    const state = beginPress('t1', 0, 0, 'touch', false, 0);
    expect(holdIsDue(state, HOLD_MS - 1)).toBe(false);
    expect(holdIsDue(state, HOLD_MS)).toBe(true);

    const dragging = fireHold(state);
    expect(dragging.phase).toBe('dragging');

    const move = movePress(dragging, 40, 40, HOLD_MS + 50);
    expect(move.action).toBe('none');
    expect(move.state).toBe(dragging);
  });

  it('reports tapped only from pressing on release', () => {
    const pressing = beginPress('t1', 0, 0, 'touch', false, 0);
    expect(endPress(pressing).tapped).toBe(true);
    expect(endPress(pressing).state.phase).toBe('idle');

    const held = fireHold(pressing);
    expect(endPress(held).tapped).toBe(false);

    const dragged = movePress(beginPress('t2', 0, 0, 'mouse', true, 0), 10, 0, 1).state;
    expect(dragged.phase).toBe('dragging');
    expect(endPress(dragged).tapped).toBe(false);

    const cancelled = movePress(beginPress('t3', 0, 0, 'touch', false, 0), 20, 0, 10).state;
    expect(cancelled.phase).toBe('cancelled');
    expect(endPress(cancelled).tapped).toBe(false);
  });

  it('fireHold from a non-pressing phase returns the state unchanged', () => {
    const idle = endPress(beginPress('t1', 0, 0, 'touch', false, 0)).state;
    expect(fireHold(idle)).toBe(idle);
  });

  it('measures movedBeyond by true distance with an exclusive boundary', () => {
    const state = beginPress('t1', 0, 0, 'touch', false, 0);
    // exactly at the threshold is NOT beyond
    expect(movedBeyond(state, 8, 0, 8)).toBe(false);
    // just under
    expect(movedBeyond(state, 7, 0, 8)).toBe(false);
    // just over
    expect(movedBeyond(state, 9, 0, 8)).toBe(true);
  });

  it('uses diagonal (Euclidean) distance, not per-axis', () => {
    const state = beginPress('t1', 0, 0, 'touch', false, 0);
    // 6px on each axis: neither axis alone reaches 8, but the diagonal is ~8.49 > 8.
    expect(movedBeyond(state, 6, 6, 8)).toBe(true);
    // 3-4-5 triangle: distance exactly 5, threshold 5 -> not beyond (exclusive).
    const p = { ...state };
    expect(movedBeyond(p, 3, 4, 5)).toBe(false);
    expect(movedBeyond(p, 4, 4, 5)).toBe(true);
  });

  it('leaves distance helpers agnostic to origin offset', () => {
    const state = beginPress('t1', 100, 200, 'touch', false, 0);
    const p = at(state, 9, 0);
    expect(movedBeyond(state, p.x, p.y, 8)).toBe(true);
  });
});
