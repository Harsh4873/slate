import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RUNTIME_STORAGE_KEY,
  formatRemaining,
  nextPhase,
  parseRuntime,
  pauseRuntime,
  remainingMs,
  resumeRuntime,
  settleRuntime,
  startRuntime,
  type PomodoroRuntime,
} from './pomodoro';

function readStoredRuntime(): PomodoroRuntime | null {
  try {
    const raw = window.localStorage.getItem(RUNTIME_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    return parseRuntime(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeStoredRuntime(runtime: PomodoroRuntime | null): void {
  try {
    if (runtime === null) {
      window.localStorage.removeItem(RUNTIME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
    }
  } catch {
    // Storage can be blocked; the timer still works in-memory.
  }
}

export function usePomodoro(countPomodoro: (taskId: string) => void) {
  const [runtime, setRuntime] = useState<PomodoroRuntime | null>(() => readStoredRuntime());
  const [remaining, setRemaining] = useState(() => {
    const stored = readStoredRuntime();
    return stored === null ? 0 : remainingMs(stored, Date.now());
  });

  // Latest countPomodoro without re-arming effects on every render.
  const countRef = useRef(countPomodoro);
  countRef.current = countPomodoro;

  // Mirror of the live runtime, so the callbacks below can read current state
  // without doing work inside a setState updater (updaters must stay pure —
  // StrictMode invokes them twice, which would double-fire the side effects).
  const runtimeRef = useRef<PomodoroRuntime | null>(runtime);

  // The cycle position outlives any single runtime: a break ending sets the
  // runtime to null, and the streak has to survive that or a long break can
  // never be reached.
  const focusStreakRef = useRef<number>(runtime?.focusStreak ?? 0);

  // Signature of the last focus session already counted, so a StrictMode
  // double-invoke or a re-render never counts one twice.
  const lastCountedRef = useRef<string | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  // The single writer for runtime state: settles phase boundaries, keeps the
  // cycle position, persists, and publishes.
  const applyRuntime = useCallback((next: PomodoroRuntime | null, now: number) => {
    let resolved = next;
    if (resolved !== null) {
      const settled = settleRuntime(resolved, now);
      if (settled.completedFocusTaskId !== null) {
        const signature = `${settled.completedFocusTaskId}:${resolved.startedAt}`;
        if (lastCountedRef.current !== signature) {
          lastCountedRef.current = signature;
          countRef.current(settled.completedFocusTaskId);
        }
        // A finished focus advances the cycle even when the timer then ends.
        focusStreakRef.current = nextPhase('focus', resolved.focusStreak).focusStreak;
      }
      if (settled.runtime === null && resolved.phase === 'long-break') {
        focusStreakRef.current = 0;
      }
      resolved = settled.runtime;
    }
    if (resolved !== null) {
      focusStreakRef.current = resolved.focusStreak;
    }
    runtimeRef.current = resolved;
    writeStoredRuntime(resolved);
    setRuntime(resolved);
    setRemaining(resolved === null ? 0 : remainingMs(resolved, now));
    return resolved;
  }, []);

  // Settle any boundary crossed while the tab was closed.
  useEffect(() => {
    applyRuntime(readStoredRuntime(), Date.now());
  }, [applyRuntime]);

  // One interval, alive only while a runtime is active and unpaused.
  useEffect(() => {
    if (runtime === null || runtime.paused) {
      return;
    }
    const tick = () => {
      const now = Date.now();
      const settled = settleRuntime(runtime, now);
      if (settled.completedFocusTaskId !== null || settled.runtime !== runtime) {
        applyRuntime(runtime, now);
        return;
      }
      setRemaining(remainingMs(runtime, now));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [runtime, applyRuntime]);

  // Reflect the focus countdown in the document title; restore it otherwise.
  useEffect(() => {
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
    if (runtime !== null && runtime.phase === 'focus' && remaining > 0) {
      document.title = formatRemaining(remaining);
    } else {
      document.title = originalTitleRef.current;
    }
  }, [runtime, remaining]);

  // Restore the original title on unmount.
  useEffect(() => {
    return () => {
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
      }
    };
  }, []);

  const start = useCallback(
    (taskId: string) => {
      // Switching tasks abandons the current session without counting it.
      const now = Date.now();
      applyRuntime(startRuntime(taskId, now, 'focus', focusStreakRef.current), now);
    },
    [applyRuntime],
  );

  const toggle = useCallback(
    (taskId: string) => {
      const now = Date.now();
      const current = runtimeRef.current;
      if (current !== null && current.taskId === taskId) {
        applyRuntime(current.paused ? resumeRuntime(current, now) : pauseRuntime(current, now), now);
        return;
      }
      applyRuntime(startRuntime(taskId, now, 'focus', focusStreakRef.current), now);
    },
    [applyRuntime],
  );

  const stop = useCallback(() => {
    applyRuntime(null, Date.now());
  }, [applyRuntime]);

  const skip = useCallback(() => {
    // Abandon the current phase for the next one, counting nothing.
    const current = runtimeRef.current;
    if (current === null) {
      return;
    }
    const now = Date.now();
    const { phase, focusStreak } = nextPhase(current.phase, current.focusStreak);
    applyRuntime(startRuntime(current.taskId, now, phase, focusStreak), now);
  }, [applyRuntime]);

  const isRunning = useCallback(
    (taskId: string) => runtime !== null && !runtime.paused && runtime.taskId === taskId,
    [runtime],
  );

  return { runtime, remaining, start, toggle, stop, skip, isRunning };
}
