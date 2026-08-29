export type ThemePreference = 'dark' | 'light' | 'system';

export type TaskPriority = 'high' | 'medium' | 'low';

export interface SlateSettings {
  theme: ThemePreference;
  hideCompleted: boolean;
  updatedAt: string;
}

export interface Section {
  id: string;
  title: string;
  color: string;
  order: number;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Task {
  id: string;
  sectionId: string;
  title: string;
  notes: string;
  done: boolean;
  completedAt?: string;
  due?: string;
  priority?: TaskPriority;
  order: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface SlateState {
  version: 1;
  settings: SlateSettings;
  sections: Section[];
  tasks: Task[];
}

export const SLATE_COLORS = [
  '#3a6ea5',
  '#5c8a6a',
  '#c08a4a',
  '#8a6b9a',
  '#9a6b5c',
  '#5a8a8a',
] as const;

export const SLATE_COLOR_NAMES: Record<string, string> = {
  '#3a6ea5': 'Blue',
  '#5c8a6a': 'Sage',
  '#c08a4a': 'Amber',
  '#8a6b9a': 'Plum',
  '#9a6b5c': 'Clay',
  '#5a8a8a': 'Teal',
};

export const DEFAULT_COLOR = SLATE_COLORS[0];

export const PRIORITY_ORDER: TaskPriority[] = ['high', 'medium', 'low'];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function isPriority(value: unknown): value is TaskPriority {
  return value === 'high' || value === 'medium' || value === 'low';
}

export const DEFAULT_SECTION_TITLE = 'Inbox';

// The built-in Inbox id is part of Slate's public surface: the Gmail inbox
// integration writes tasks straight into this section by id.
export const STARTER_INBOX_ID = 'starter-inbox';

export function makeId(prefix = 'slate') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// A fresh device starts with an empty Inbox and no tasks: seeded example tasks
// were indistinguishable from real ones — they counted as open work in the
// header and read like somebody else's list to a first-time visitor.
//
// The empty Inbox section is kept because quick add and the Gmail integration
// both file into it by id. It is stamped at epoch 0, so a fresh device never
// beats a real edit — or a tombstone — of that section in the merge.
export function createInitialState(now = new Date(0).toISOString()): SlateState {
  return {
    version: 1,
    // 'system' rather than a hard 'dark': an unset preference must follow the
    // operating system. Choosing a theme in settings stores 'light' or 'dark'.
    settings: { theme: 'system', hideCompleted: false, updatedAt: now },
    sections: [
      {
        id: STARTER_INBOX_ID,
        title: DEFAULT_SECTION_TITLE,
        color: DEFAULT_COLOR,
        order: 1000,
        collapsed: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    tasks: [],
  };
}
