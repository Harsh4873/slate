import { describe, expect, it } from 'vitest';
import { createInitialState, STARTER_INBOX_ID, type Section, type SlateState, type Task } from './model';
import { applyMoveTask } from './move-task';
import { sortByOrder } from './order';

const NOW = '2026-07-12T10:00:00.000Z';
const LATER = '2026-07-12T10:00:01.000Z';
const WORK_ID = 'section-work';

function section(overrides: Partial<Section> & Pick<Section, 'id' | 'title' | 'order'>): Section {
  return {
    color: '#3a6ea5',
    collapsed: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'order' | 'sectionId'>): Task {
  return {
    notes: '',
    done: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function idsIn(state: SlateState, sectionId: string) {
  return sortByOrder(state.tasks.filter((item) => item.sectionId === sectionId && !item.deleted)).map((item) => item.id);
}

function threeInInbox(): SlateState {
  return {
    ...createInitialState(NOW),
    tasks: [
      task({ id: 'a', title: 'A', order: 1000, sectionId: STARTER_INBOX_ID }),
      task({ id: 'b', title: 'B', order: 2000, sectionId: STARTER_INBOX_ID }),
      task({ id: 'c', title: 'C', order: 3000, sectionId: STARTER_INBOX_ID }),
    ],
  };
}

describe('applyMoveTask', () => {
  it('moves a task to the bottom of its section', () => {
    const next = applyMoveTask(threeInInbox(), 'a', STARTER_INBOX_ID, null, LATER);
    expect(idsIn(next, STARTER_INBOX_ID)).toEqual(['b', 'c', 'a']);
  });

  it('inserts a task before another in the same section', () => {
    const next = applyMoveTask(threeInInbox(), 'c', STARTER_INBOX_ID, 'a', LATER);
    expect(idsIn(next, STARTER_INBOX_ID)).toEqual(['c', 'a', 'b']);
  });

  it('moves a task into another section before an existing task', () => {
    const state: SlateState = {
      ...createInitialState(NOW),
      sections: [
        ...createInitialState(NOW).sections,
        section({ id: WORK_ID, title: 'Work', order: 2000 }),
      ],
      tasks: [
        task({ id: 'a', title: 'A', order: 1000, sectionId: STARTER_INBOX_ID }),
        task({ id: 'b', title: 'B', order: 1000, sectionId: WORK_ID }),
      ],
    };
    const next = applyMoveTask(state, 'a', WORK_ID, 'b', LATER);
    expect(idsIn(next, STARTER_INBOX_ID)).toEqual([]);
    expect(idsIn(next, WORK_ID)).toEqual(['a', 'b']);
  });

  it('appends a task onto an empty section', () => {
    const state: SlateState = {
      ...createInitialState(NOW),
      sections: [
        ...createInitialState(NOW).sections,
        section({ id: WORK_ID, title: 'Work', order: 2000 }),
      ],
      tasks: [
        task({ id: 'a', title: 'A', order: 1000, sectionId: STARTER_INBOX_ID }),
      ],
    };
    const next = applyMoveTask(state, 'a', WORK_ID, null, LATER);
    expect(idsIn(next, STARTER_INBOX_ID)).toEqual([]);
    expect(idsIn(next, WORK_ID)).toEqual(['a']);
  });

  it('leaves state alone when the target section is gone', () => {
    const state = threeInInbox();
    expect(applyMoveTask(state, 'a', 'missing', null, LATER)).toBe(state);
  });
});
