export type PomodoroPhase = 'focus' | 'short-break' | 'long-break';

export const FOCUS_MS = 25 * 60_000;
export const SHORT_BREAK_MS = 5 * 60_000;
export const LONG_BREAK_MS = 15 * 60_000;
export const SESSIONS_BEFORE_LONG_BREAK = 4;
export const RUNTIME_STORAGE_KEY = 'slate-pomodoro-runtime-v1';

export interface PomodoroRuntime {
  taskId: string;
  phase: PomodoroPhase;
  startedAt: number; // epoch ms this run segment began
  durationMs: number; // total length of this phase
  elapsedBeforePauseMs: number; // elapsed accumulated across previous segments
  paused: boolean;
  focusStreak: number; // completed focus phases since the last long break
}

export function phaseDuration(phase: PomodoroPhase): number {
  switch (phase) {
    case 'short-break':
      return SHORT_BREAK_MS;
    case 'long-break':
      return LONG_BREAK_MS;
    default:
      return FOCUS_MS;
  }
}

export function startRuntime(
  taskId: string,
  now: number,
  phase: PomodoroPhase = 'focus',
  focusStreak = 0,
): PomodoroRuntime {
  return {
    taskId,
    phase,
    startedAt: now,
    durationMs: phaseDuration(phase),
    elapsedBeforePauseMs: 0,
    paused: false,
    focusStreak,
  };
}

export function elapsedMs(runtime: PomodoroRuntime, now: number): number {
  if (runtime.paused) {
    return runtime.elapsedBeforePauseMs;
  }
  return runtime.elapsedBeforePauseMs + (now - runtime.startedAt);
}

export function remainingMs(runtime: PomodoroRuntime, now: number): number {
  return Math.max(0, runtime.durationMs - elapsedMs(runtime, now));
}

export function isExpired(runtime: PomodoroRuntime, now: number): boolean {
  return elapsedMs(runtime, now) >= runtime.durationMs;
}

export function pauseRuntime(runtime: PomodoroRuntime, now: number): PomodoroRuntime {
  if (runtime.paused) {
    return runtime;
  }
  return {
    ...runtime,
    elapsedBeforePauseMs: elapsedMs(runtime, now),
    paused: true,
  };
}

export function resumeRuntime(runtime: PomodoroRuntime, now: number): PomodoroRuntime {
  if (!runtime.paused) {
    return runtime;
  }
  return {
    ...runtime,
    startedAt: now,
    paused: false,
  };
}

export function nextPhase(
  phase: PomodoroPhase,
  focusStreak: number,
): { phase: PomodoroPhase; focusStreak: number } {
  if (phase === 'focus') {
    const streak = focusStreak + 1;
    const isLong = streak % SESSIONS_BEFORE_LONG_BREAK === 0;
    return { phase: isLong ? 'long-break' : 'short-break', focusStreak: streak };
  }
  // Leaving a break returns to focus; only a long break resets the streak.
  return { phase: 'focus', focusStreak: phase === 'long-break' ? 0 : focusStreak };
}

export function settleRuntime(
  runtime: PomodoroRuntime,
  now: number,
): { runtime: PomodoroRuntime | null; completedFocusTaskId: string | null } {
  if (!isExpired(runtime, now)) {
    return { runtime, completedFocusTaskId: null };
  }

  if (runtime.phase === 'focus') {
    const { phase, focusStreak } = nextPhase(runtime.phase, runtime.focusStreak);
    // The break begins the instant focus ended, not `now`.
    const focusEndedAt = runtime.startedAt + runtime.durationMs - runtime.elapsedBeforePauseMs;
    const breakRuntime: PomodoroRuntime = {
      taskId: runtime.taskId,
      phase,
      startedAt: focusEndedAt,
      durationMs: phaseDuration(phase),
      elapsedBeforePauseMs: 0,
      paused: false,
      focusStreak,
    };
    // If the break has also already elapsed, do not auto-start a focus phase.
    if (isExpired(breakRuntime, now)) {
      return { runtime: null, completedFocusTaskId: runtime.taskId };
    }
    return { runtime: breakRuntime, completedFocusTaskId: runtime.taskId };
  }

  // An expired break just ends.
  return { runtime: null, completedFocusTaskId: null };
}

export function parseRuntime(raw: unknown): PomodoroRuntime | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;

  if (typeof value.taskId !== 'string' || value.taskId.length === 0) {
    return null;
  }
  if (
    value.phase !== 'focus' &&
    value.phase !== 'short-break' &&
    value.phase !== 'long-break'
  ) {
    return null;
  }
  if (typeof value.paused !== 'boolean') {
    return null;
  }

  const startedAt = value.startedAt;
  const durationMs = value.durationMs;
  const elapsedBeforePauseMs = value.elapsedBeforePauseMs;
  const focusStreak = value.focusStreak;
  if (
    typeof startedAt !== 'number' ||
    typeof durationMs !== 'number' ||
    typeof elapsedBeforePauseMs !== 'number' ||
    typeof focusStreak !== 'number' ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(durationMs) ||
    !Number.isFinite(elapsedBeforePauseMs) ||
    !Number.isFinite(focusStreak)
  ) {
    return null;
  }
  if (durationMs < 0 || elapsedBeforePauseMs < 0 || focusStreak < 0) {
    return null;
  }

  return {
    taskId: value.taskId,
    phase: value.phase,
    startedAt,
    durationMs,
    elapsedBeforePauseMs,
    paused: value.paused,
    focusStreak,
  };
}

export function formatRemaining(ms: number): string {
  const totalSeconds = ms <= 0 ? 0 : Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}
