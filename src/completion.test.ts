import { describe, expect, it } from 'vitest';
import {
  COMPLETION_FALLBACK_MS,
  addPending,
  expiredPending,
  hasPending,
  removePending,
  type PendingCompletion,
} from './completion';

function entry(taskId: string, startedAt: number, nowDone = true): PendingCompletion {
  return { taskId, nowDone, startedAt };
}

describe('completion pending list', () => {
  it('replaces a same-id entry instead of duplicating it', () => {
    const first = addPending([], entry('a', 100, true));
    const second = addPending(first, entry('a', 250, false));
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual({ taskId: 'a', nowDone: false, startedAt: 250 });
  });

  it('appends distinct ids', () => {
    const list = addPending(addPending([], entry('a', 100)), entry('b', 100));
    expect(list.map((item) => item.taskId)).toEqual(['a', 'b']);
  });

  it('returns the same reference when removing an absent id', () => {
    const list = addPending([], entry('a', 100));
    expect(removePending(list, 'missing')).toBe(list);
  });

  it('removes a present id', () => {
    const list = addPending(addPending([], entry('a', 100)), entry('b', 100));
    const next = removePending(list, 'a');
    expect(next).not.toBe(list);
    expect(next.map((item) => item.taskId)).toEqual(['b']);
  });

  it('reports presence both ways', () => {
    const list = addPending([], entry('a', 100));
    expect(hasPending(list, 'a')).toBe(true);
    expect(hasPending(list, 'b')).toBe(false);
  });

  it('expires only entries at or past the fallback deadline, preserving order', () => {
    const list = [
      entry('at', 1000),
      entry('under', 1000),
      entry('past', 1000),
      entry('fresh', 1000),
    ];
    // at: exactly the deadline; under: one ms short; past: well beyond; fresh: none elapsed.
    const now = 1000 + COMPLETION_FALLBACK_MS;
    const atDeadline = expiredPending([list[0]], now);
    expect(atDeadline.map((item) => item.taskId)).toEqual(['at']);

    const justUnder = expiredPending([list[1]], now - 1);
    expect(justUnder).toEqual([]);

    const wellPast = expiredPending([list[2]], 1000 + COMPLETION_FALLBACK_MS * 3);
    expect(wellPast.map((item) => item.taskId)).toEqual(['past']);
  });

  it('returns expired entries in their original order', () => {
    const list = [entry('first', 0), entry('second', 10), entry('third', 5)];
    const expired = expiredPending(list, COMPLETION_FALLBACK_MS + 20);
    expect(expired.map((item) => item.taskId)).toEqual(['first', 'second', 'third']);
  });
});
