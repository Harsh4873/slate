import { describe, expect, it } from 'vitest';
import { createInitialState, DEFAULT_SECTION_TITLE, STARTER_INBOX_ID, type SlateState, type Task } from './model';
import { applyClearCompleted, applyRestoreTasks, buildStorageEnvelope, parseSlateState } from './store';

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

/** A state with real content, built the way the app builds one. */
function populatedState(): SlateState {
  return {
    ...createInitialState(NOW),
    tasks: [
      task({ id: 'task-reading', title: 'Finish the reading', order: 1000, due: '2026-07-12', priority: 'high' }),
      task({ id: 'task-invoice', title: 'Send the invoice', order: 2000, notes: 'Attach the signed copy.' }),
      task({ id: 'task-laundry', title: 'Laundry', order: 3000, done: true, completedAt: NOW }),
    ],
  };
}

describe('createInitialState', () => {
  it('stamps starter content at epoch 0 so tombstones and real edits always win the merge', () => {
    const initial = createInitialState();
    const epoch = new Date(0).toISOString();
    expect(initial.settings.updatedAt).toBe(epoch);
    for (const entity of [...initial.sections, ...initial.tasks]) {
      expect(entity.updatedAt).toBe(epoch);
    }
  });

  it('starts a first visit empty, with only the built-in Inbox section', () => {
    const initial = createInitialState();
    expect(initial.tasks).toEqual([]);
    expect(initial.sections).toHaveLength(1);
    expect(initial.sections[0].id).toBe(STARTER_INBOX_ID);
    expect(initial.sections[0].title).toBe(DEFAULT_SECTION_TITLE);
  });

  it('leaves the theme unset so it follows the operating system', () => {
    expect(createInitialState().settings.theme).toBe('system');
  });
});

describe('parseSlateState', () => {
  it('round-trips a stored state', () => {
    const parsed = parseSlateState(JSON.parse(JSON.stringify(populatedState())));
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.tasks.map((item) => item.id)).toEqual(['task-reading', 'task-invoice', 'task-laundry']);
  });

  it('rejects unsupported versions and missing collections', () => {
    expect(() => parseSlateState({ version: 2, sections: [], tasks: [] })).toThrow(/version/i);
    expect(() => parseSlateState({ version: 1, sections: [] })).toThrow(/missing/i);
    expect(() => parseSlateState(null)).toThrow();
  });

  it('ignores a legacy blocks array from the retired schedule feature', () => {
    const raw = JSON.parse(JSON.stringify(populatedState()));
    raw.blocks = [
      {
        id: 'block-legacy',
        dateKey: '2026-07-12',
        startMin: 480,
        durationMin: 60,
        title: 'Old schedule block',
        color: '#5579ad',
        createdAt: NOW,
        updatedAt: NOW,
      },
      'even unreadable entries are fine',
    ];
    const parsed = parseSlateState(raw) as unknown as Record<string, unknown>;
    expect(parsed.blocks).toBeUndefined();
    expect(parseSlateState(raw).tasks).toHaveLength(3);
  });

  it('backfills defaults for settings and invalid colors', () => {
    const raw = JSON.parse(JSON.stringify(populatedState()));
    delete raw.settings;
    raw.sections[0].color = 'rebeccapurple';
    const parsed = parseSlateState(raw);
    expect(parsed.settings.theme).toBe('system');
    expect(parsed.settings.hideCompleted).toBe(false);
    expect(parsed.sections[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('keeps valid priorities and drops unknown ones', () => {
    const raw = JSON.parse(JSON.stringify(populatedState()));
    raw.tasks[1].priority = 'urgent';
    const parsed = parseSlateState(raw);
    expect(parsed.tasks.find((item) => item.id === 'task-reading')?.priority).toBe('high');
    expect(parsed.tasks.find((item) => item.id === 'task-invoice')?.priority).toBeUndefined();
  });

  it('keeps tombstones and orphaned tasks so sync snapshots can interleave', () => {
    const raw = JSON.parse(JSON.stringify(populatedState()));
    raw.tasks[0].deleted = true;
    raw.tasks[1].sectionId = 'section-not-seen-yet';
    const parsed = parseSlateState(raw);
    expect(parsed.tasks.find((item) => item.id === 'task-reading')?.deleted).toBe(true);
    expect(parsed.tasks.find((item) => item.id === 'task-invoice')?.sectionId).toBe('section-not-seen-yet');
  });

  it('rejects duplicate ids', () => {
    const duplicated = JSON.parse(JSON.stringify(populatedState()));
    duplicated.tasks.push(duplicated.tasks[0]);
    expect(() => parseSlateState(duplicated)).toThrow(/duplicate/i);
  });

  it('rejects ids that cannot be Firestore document ids', () => {
    const bad = JSON.parse(JSON.stringify(populatedState()));
    bad.tasks[0].id = 'a/b';
    expect(() => parseSlateState(bad)).toThrow(/invalid task/i);

    const reserved = JSON.parse(JSON.stringify(populatedState()));
    reserved.sections[0].id = '__name__';
    expect(() => parseSlateState(reserved)).toThrow(/invalid/i);
  });
});

describe('buildStorageEnvelope', () => {
  it('nests everything under state and keeps no legacy blocks key', () => {
    const envelope = buildStorageEnvelope(populatedState(), new Date(NOW));
    expect(Object.keys(envelope).sort()).toEqual(['savedAt', 'state', 'storageFormat']);
    expect(envelope.storageFormat).toBe('slate-v1');
    expect(envelope.savedAt).toBe(NOW);
    expect(Object.keys(envelope.state).sort()).toEqual(['sections', 'settings', 'tasks', 'version']);
  });

  it('produces a payload Slate itself can read back', () => {
    const envelope = buildStorageEnvelope(populatedState(), new Date(NOW));
    const roundTripped = parseSlateState(JSON.parse(JSON.stringify(envelope)).state);
    expect(roundTripped.tasks).toHaveLength(3);
  });

  // The launcher's read-only Today view parses exactly this payload. The
  // snapshot is committed here and copied into the landing repo's test
  // fixtures, so a change to Slate's storage shape fails here first and tells
  // whoever makes it that a consumer has to be updated too.
  it('matches the payload fixture the Today dashboard is tested against', async () => {
    const envelope = buildStorageEnvelope(populatedState(), new Date(NOW));
    await expect(`${JSON.stringify(envelope, null, 2)}\n`)
      .toMatchFileSnapshot('../tests/fixtures/today-slate-payload.json');
  });
});

describe('clearCompleted undo contract', () => {
  const CLEAR_AT = '2026-07-12T11:00:00.000Z';
  const RESTORE_AT = '2026-07-12T12:00:00.000Z';

  function clearedState(): SlateState {
    return {
      ...createInitialState(NOW),
      tasks: [
        task({ id: 'task-alpha', title: 'alpha report', order: 1000, done: true, completedAt: NOW }),
        task({ id: 'task-beta', title: 'beta review', order: 2000, done: true, completedAt: NOW }),
        task({ id: 'task-gamma', title: 'gamma draft', order: 3000 }),
      ],
    };
  }

  // Mirrors the store's changed-tasks mutation: the records sync uploads.
  function changedTasks(previous: SlateState, next: SlateState): Task[] {
    const previousById = new Map(previous.tasks.map((item) => [item.id, item]));
    return next.tasks.filter((item) => previousById.get(item.id) !== item);
  }

  it('deletes every completed task in the section and returns those exact IDs for Undo', () => {
    const previous = clearedState();
    const { next, deletedIds } = applyClearCompleted(previous, STARTER_INBOX_ID, CLEAR_AT);
    expect(deletedIds).toEqual(['task-alpha', 'task-beta']);
    const changed = changedTasks(previous, next);
    expect(changed.map((item) => item.id).sort()).toEqual([...deletedIds].sort());
    expect(changed.every((item) => item.deleted === true)).toBe(true);
    expect(next.tasks.find((item) => item.id === 'task-gamma')?.deleted).toBeUndefined();
  });

  it('restores hidden matches when Undo uses the returned IDs (search "alpha" repro)', () => {
    const previous = clearedState();
    const { next: cleared, deletedIds } = applyClearCompleted(previous, STARTER_INBOX_ID, CLEAR_AT);
    const visibleIds = previous.tasks
      .filter((item) => item.done && !item.deleted && item.title.toLowerCase().includes('alpha'))
      .map((item) => item.id);
    expect(visibleIds).toEqual(['task-alpha']);

    // The old Undo captured only the visible IDs and stranded beta deleted.
    const partial = applyRestoreTasks(cleared, visibleIds, RESTORE_AT);
    expect(partial.tasks.find((item) => item.id === 'task-beta')?.deleted).toBe(true);

    const full = applyRestoreTasks(cleared, deletedIds, RESTORE_AT);
    expect(full.tasks.filter((item) => item.deleted)).toEqual([]);
    expect(full.tasks.find((item) => item.id === 'task-alpha')?.done).toBe(true);
    expect(full.tasks.find((item) => item.id === 'task-beta')?.done).toBe(true);
  });

  it('round-trips the unfiltered list with matching synced restore records', () => {
    const previous = clearedState();
    const { next: cleared, deletedIds } = applyClearCompleted(previous, STARTER_INBOX_ID, CLEAR_AT);
    const restored = applyRestoreTasks(cleared, deletedIds, RESTORE_AT);
    const changed = changedTasks(cleared, restored);
    expect(changed.map((item) => item.id).sort()).toEqual(['task-alpha', 'task-beta']);
    expect(changed.every((item) => item.deleted === undefined)).toBe(true);
    expect(restored.tasks.find((item) => item.id === 'task-gamma'))
      .toBe(previous.tasks.find((item) => item.id === 'task-gamma'));
  });

  it('returns an empty ID set and keeps state untouched when nothing is done', () => {
    const previous = clearedState();
    const { next, deletedIds } = applyClearCompleted(previous, 'section-other', CLEAR_AT);
    expect(deletedIds).toEqual([]);
    expect(next).toBe(previous);
  });
});
