import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COMPLETION_FALLBACK_MS,
  addPending,
  expiredPending,
  hasPending,
  prefersReducedMotion,
  removePending,
  type PendingCompletion,
} from './completion';

// Insertion-ordered cap on the settle guard below. Generous enough that a real
// same-tick race is always caught, small enough that it cannot grow unbounded.
const SETTLED_KEY_LIMIT = 64;

export function useCompletion(settle: (taskId: string, nowDone: boolean) => void) {
  const [pending, setPending] = useState<readonly PendingCompletion[]>([]);

  // Latest settle without re-arming the sweep on every render.
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // Mirror of the live list so callbacks read current state without doing
  // work inside a setState updater — updaters must stay pure, and StrictMode
  // invokes them twice, which would fire settle side effects twice.
  const pendingRef = useRef<readonly PendingCompletion[]>(pending);
  pendingRef.current = pending;

  // Identities already settled, so the animationend path and the fallback
  // sweep can never both settle one entry. Keyed by taskId + startedAt so a
  // later completion of the same task after re-arming is not blocked.
  const settledRef = useRef<Set<string>>(new Set<string>());

  const settleOnce = useCallback((entry: PendingCompletion) => {
    const key = `${entry.taskId}:${entry.startedAt}`;
    if (settledRef.current.has(key)) {
      return;
    }
    settledRef.current.add(key);
    // The guard only has to outlive the render that clears the entry, so the
    // set is bounded: without this it grows by one key per toggle forever.
    if (settledRef.current.size > SETTLED_KEY_LIMIT) {
      const oldest = settledRef.current.values().next();
      if (!oldest.done) {
        settledRef.current.delete(oldest.value);
      }
    }
    settleRef.current(entry.taskId, entry.nowDone);
  }, []);

  const begin = useCallback(
    (taskId: string, nowDone: boolean) => {
      // With motion off there is nothing to animate; waiting would look like a
      // stall, so settle synchronously and record nothing.
      if (prefersReducedMotion()) {
        settleRef.current(taskId, nowDone);
        return;
      }
      const entry: PendingCompletion = { taskId, nowDone, startedAt: Date.now() };
      // A re-arm supersedes any prior entry for this task; drop its settle
      // guard so the new entry can settle in turn.
      const prev = pendingRef.current.find((item) => item.taskId === taskId);
      if (prev !== undefined) {
        settledRef.current.delete(`${prev.taskId}:${prev.startedAt}`);
      }
      setPending((list) => addPending(list, entry));
    },
    [],
  );

  const onAnimationEnd = useCallback(
    (taskId: string) => {
      const entry = pendingRef.current.find((item) => item.taskId === taskId);
      if (entry === undefined) {
        return;
      }
      setPending((list) => removePending(list, taskId));
      settleOnce(entry);
    },
    [settleOnce],
  );

  const isAnimating = useCallback((taskId: string) => hasPending(pendingRef.current, taskId), []);

  // One sweep: any entry whose animationend never arrived still settles once.
  useEffect(() => {
    if (pending.length === 0) {
      return;
    }
    const sweep = () => {
      const now = Date.now();
      const expired = expiredPending(pendingRef.current, now);
      if (expired.length === 0) {
        return;
      }
      setPending((list) => {
        let next = list;
        for (const entry of expired) {
          next = removePending(next, entry.taskId);
        }
        return next;
      });
      for (const entry of expired) {
        settleOnce(entry);
      }
    };
    const id = window.setInterval(sweep, COMPLETION_FALLBACK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [pending.length, settleOnce]);

  return { begin, onAnimationEnd, isAnimating };
}
