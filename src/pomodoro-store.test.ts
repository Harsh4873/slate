import { describe, expect, it } from 'vitest';
import { createInitialState, STARTER_INBOX_ID, type SlateState, type Task } from './model';
import { buildStorageEnvelope, parseSlateState } from './store';

const NOW = '2026-07-12T10:00:00.000Z';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'order'>): Task {
  return {
    sectionId: STARTER_INBOX_ID,
    notes: '',
    done: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A state with a single task, round-tripped through JSON like a real load. */
function stateWith(taskOverrides: Partial<Task>): SlateState {
  const raw = {
    ...createInitialState(NOW),
    tasks: [task({ id: 'task-focus', title: 'Deep work', order: 1000, ...taskOverrides })],
  };
  return JSON.parse(JSON.stringify(raw)) as SlateState;
}

function parseSingle(taskOverrides: Partial<Task>): Task {
  const parsed = parseSlateState(stateWith(taskOverrides));
  const found = parsed.tasks.find((item) => item.id === 'task-focus');
  if (!found) throw new Error('task-focus missing from parsed state');
  return found;
}

describe('parseSlateState pomodoroCompleted', () => {
  it('keeps a positive integer through a round-trip', () => {
    const parsed = parseSingle({ pomodoroCompleted: 3 });
    expect(parsed.pomodoroCompleted).toBe(3);
  });

  it('drops zero, negatives, non-integers, NaN, strings and null, leaving no key', () => {
    for (const value of [0, -1, 2.5, NaN, '4' as unknown as number, null as unknown as number]) {
      const parsed = parseSingle({ pomodoroCompleted: value });
      expect('pomodoroCompleted' in parsed).toBe(false);
    }
  });

  it('parses a task with no pomodoroCompleted (backward compatible)', () => {
    const parsed = parseSingle({});
    expect('pomodoroCompleted' in parsed).toBe(false);
    expect(parsed.title).toBe('Deep work');
  });

  it('loads a legacy copy carrying both a blocks array and pomodoroCompleted', () => {
    const raw = stateWith({ pomodoroCompleted: 5 }) as unknown as Record<string, unknown>;
    raw.blocks = [{ id: 'block-legacy', title: 'Old block', createdAt: NOW, updatedAt: NOW }];
    const parsed = parseSlateState(raw) as unknown as Record<string, unknown>;
    expect(parsed.blocks).toBeUndefined();
    const found = (parsed.tasks as Task[]).find((item) => item.id === 'task-focus');
    expect(found?.pomodoroCompleted).toBe(5);
  });
});

describe('buildStorageEnvelope', () => {
  it('adds no top-level state key for pomodoro-free tasks', () => {
    const envelope = buildStorageEnvelope(parseSlateState(stateWith({})));
    expect(Object.keys(envelope.state).sort()).toEqual(['sections', 'settings', 'tasks', 'version']);
  });
});
