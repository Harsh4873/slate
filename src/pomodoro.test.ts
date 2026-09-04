import { describe, expect, it } from 'vitest';
import {
  FOCUS_MS,
  LONG_BREAK_MS,
  SHORT_BREAK_MS,
  elapsedMs,
  formatRemaining,
  isExpired,
  nextPhase,
  parseRuntime,
  pauseRuntime,
  remainingMs,
  resumeRuntime,
  settleRuntime,
  startRuntime,
  type PomodoroRuntime,
} from './pomodoro';

const T0 = 1_700_000_000_000;

describe('remainingMs', () => {
  it('counts down from the full duration and clamps at zero', () => {
    const runtime = startRuntime('task-1', T0);
    expect(remainingMs(runtime, T0)).toBe(FOCUS_MS);
    expect(remainingMs(runtime, T0 + 60_000)).toBe(FOCUS_MS - 60_000);
    expect(remainingMs(runtime, T0 + FOCUS_MS + 5_000)).toBe(0);
  });

  it('elapsed never exceeds duration for remaining, but tracks true wall time', () => {
    const runtime = startRuntime('task-1', T0);
    expect(elapsedMs(runtime, T0 + 90_000)).toBe(90_000);
    expect(isExpired(runtime, T0 + FOCUS_MS)).toBe(true);
    expect(isExpired(runtime, T0 + FOCUS_MS - 1)).toBe(false);
  });
});

describe('pause and resume', () => {
  it('preserves elapsed across a long real-time gap', () => {
    const started = startRuntime('task-1', T0);
    // Ten minutes of focus, then pause.
    const paused = pauseRuntime(started, T0 + 10 * 60_000);
    expect(paused.paused).toBe(true);
    expect(elapsedMs(paused, T0 + 10 * 60_000)).toBe(10 * 60_000);
    // An hour passes while paused — elapsed does not move.
    expect(elapsedMs(paused, T0 + 70 * 60_000)).toBe(10 * 60_000);
    // Resume an hour later; the clock continues from 10 minutes elapsed.
    const resumed = resumeRuntime(paused, T0 + 70 * 60_000);
    expect(resumed.paused).toBe(false);
    expect(elapsedMs(resumed, T0 + 70 * 60_000)).toBe(10 * 60_000);
    expect(elapsedMs(resumed, T0 + 75 * 60_000)).toBe(15 * 60_000);
    expect(remainingMs(resumed, T0 + 75 * 60_000)).toBe(FOCUS_MS - 15 * 60_000);
  });

  it('is idempotent', () => {
    const started = startRuntime('task-1', T0);
    const paused = pauseRuntime(started, T0 + 1_000);
    expect(pauseRuntime(paused, T0 + 5_000)).toBe(paused);
    const resumed = resumeRuntime(paused, T0 + 5_000);
    expect(resumeRuntime(resumed, T0 + 9_000)).toBe(resumed);
  });
});

describe('nextPhase', () => {
  it('advances focus into short breaks then a long break every fourth session', () => {
    expect(nextPhase('focus', 0)).toEqual({ phase: 'short-break', focusStreak: 1 });
    expect(nextPhase('focus', 1)).toEqual({ phase: 'short-break', focusStreak: 2 });
    expect(nextPhase('focus', 2)).toEqual({ phase: 'short-break', focusStreak: 3 });
    expect(nextPhase('focus', 3)).toEqual({ phase: 'long-break', focusStreak: 4 });
  });

  it('returns to focus from a break, resetting the streak only after a long break', () => {
    expect(nextPhase('short-break', 2)).toEqual({ phase: 'focus', focusStreak: 2 });
    expect(nextPhase('long-break', 4)).toEqual({ phase: 'focus', focusStreak: 0 });
  });
});

describe('settleRuntime', () => {
  it('returns the same reference when the phase has not expired', () => {
    const runtime = startRuntime('task-1', T0);
    const result = settleRuntime(runtime, T0 + 60_000);
    expect(result.runtime).toBe(runtime);
    expect(result.completedFocusTaskId).toBe(null);
  });

  it('counts an expired focus session and starts the break at the focus-end instant', () => {
    const runtime = startRuntime('task-1', T0);
    // Reopened a little after focus ended, still inside the break.
    const now = T0 + FOCUS_MS + 30_000;
    const result = settleRuntime(runtime, now);
    expect(result.completedFocusTaskId).toBe('task-1');
    expect(result.runtime).not.toBe(null);
    const next = result.runtime as PomodoroRuntime;
    expect(next.phase).toBe('short-break');
    expect(next.startedAt).toBe(T0 + FOCUS_MS); // focus-end instant, not `now`
    expect(next.focusStreak).toBe(1);
    expect(remainingMs(next, now)).toBe(SHORT_BREAK_MS - 30_000);
  });

  it('returns null when the following break has also elapsed', () => {
    const runtime = startRuntime('task-1', T0);
    const now = T0 + FOCUS_MS + SHORT_BREAK_MS + 1;
    const result = settleRuntime(runtime, now);
    expect(result.completedFocusTaskId).toBe('task-1');
    expect(result.runtime).toBe(null);
  });

  it('ends on an expired break, counting nothing', () => {
    const runtime = startRuntime('task-1', T0, 'short-break', 1);
    const result = settleRuntime(runtime, T0 + SHORT_BREAK_MS + 1);
    expect(result.runtime).toBe(null);
    expect(result.completedFocusTaskId).toBe(null);
  });
});

describe('parseRuntime', () => {
  it('round-trips a valid runtime', () => {
    const runtime = startRuntime('task-1', T0);
    const parsed = parseRuntime(JSON.parse(JSON.stringify(runtime)));
    expect(parsed).toEqual(runtime);
  });

  it('rejects malformed shapes', () => {
    const valid = startRuntime('task-1', T0);
    expect(parseRuntime(null)).toBe(null);
    expect(parseRuntime(42)).toBe(null);
    expect(parseRuntime('nope')).toBe(null);
    expect(parseRuntime({ ...valid, taskId: '' })).toBe(null);
    expect(parseRuntime({ ...valid, taskId: 5 })).toBe(null);
    expect(parseRuntime({ ...valid, phase: 'nap' })).toBe(null);
    expect(parseRuntime({ ...valid, paused: 'yes' })).toBe(null);
    expect(parseRuntime({ ...valid, startedAt: Number.NaN })).toBe(null);
    expect(parseRuntime({ ...valid, durationMs: Infinity })).toBe(null);
    expect(parseRuntime({ ...valid, durationMs: -1 })).toBe(null);
    expect(parseRuntime({ ...valid, focusStreak: -1 })).toBe(null);
  });
});

describe('formatRemaining', () => {
  it('rounds up to the next whole second and formats by magnitude', () => {
    expect(formatRemaining(FOCUS_MS)).toBe('25:00');
    expect(formatRemaining(6_100)).toBe('0:07');
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(-500)).toBe('0:00');
    expect(formatRemaining(LONG_BREAK_MS + 60 * 60_000)).toBe('1:15:00');
  });
});
