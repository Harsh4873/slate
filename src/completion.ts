export const COMPLETION_MS = 320; // bubble + strike duration
export const COMPLETION_FALLBACK_MS = 420; // safety net if animationend never arrives

export interface PendingCompletion {
  taskId: string;
  nowDone: boolean;
  startedAt: number;
}

export function addPending(
  list: readonly PendingCompletion[],
  entry: PendingCompletion,
): PendingCompletion[] {
  // Replace any in-flight entry for the same task so a rapid double-tap
  // settles once, against the latest intent, rather than queuing two.
  const next = list.filter((item) => item.taskId !== entry.taskId);
  next.push(entry);
  return next;
}

export function removePending(
  list: readonly PendingCompletion[],
  taskId: string,
): PendingCompletion[] {
  if (!list.some((item) => item.taskId === taskId)) {
    return list as PendingCompletion[];
  }
  return list.filter((item) => item.taskId !== taskId);
}

export function hasPending(list: readonly PendingCompletion[], taskId: string): boolean {
  return list.some((item) => item.taskId === taskId);
}

export function expiredPending(
  list: readonly PendingCompletion[],
  now: number,
): PendingCompletion[] {
  return list.filter((item) => now - item.startedAt >= COMPLETION_FALLBACK_MS);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
