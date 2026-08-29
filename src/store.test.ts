import { describe, expect, it } from 'vitest';
import { createInitialState, DEFAULT_SECTION_TITLE, STARTER_INBOX_ID, type SlateState, type Task } from './model';
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
