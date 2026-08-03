import { addDays, isDateKey, toDateKey } from './dates';
import type { TaskPriority } from './model';

/**
 * Quick-add grammar. Plain words become the title; tokens are stripped out:
 *
 *   `@token` — due date: @today, @tod, @tomorrow, @tmr, @tom, a weekday
 *              (@mon … @sunday, meaning the next occurrence after today),
 *              or an exact date (@2026-08-15).
 *   `!token` — priority: !high !h !1, !med !medium !m !2, !low !l !3.
 *   `#token` — section, matched against section titles by the caller.
 *
 * Only the first recognised token of each kind counts; unrecognised tokens
 * (like an email address or "#1 priority") stay in the title. If stripping
 * would leave the title empty, the raw text is kept untouched so nothing the
 * user typed is ever lost.
 */

export interface QuickAddResult {
  title: string;
  due?: string;
  priority?: TaskPriority;
  sectionQuery?: string;
}

const PRIORITY_TOKENS: Record<string, TaskPriority> = {
  high: 'high',
  h: 'high',
  '1': 'high',
  medium: 'medium',
  med: 'medium',
  m: 'medium',
  '2': 'medium',
  low: 'low',
  l: 'low',
  '3': 'low',
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function resolveDueToken(token: string, today: Date): string | undefined {
  const lower = token.toLowerCase();
  if (lower === 'today' || lower === 'tod') return toDateKey(today);
  if (lower === 'tomorrow' || lower === 'tmr' || lower === 'tom') return toDateKey(addDays(today, 1));
  const weekday = WEEKDAYS.findIndex((day) => day === lower || day.slice(0, 3) === lower);
  if (weekday >= 0) {
    const ahead = (weekday - today.getDay() + 7) % 7 || 7;
    return toDateKey(addDays(today, ahead));
  }
  if (isDateKey(token)) return token;
  return undefined;
}

export function parseQuickAdd(input: string, today = new Date()): QuickAddResult {
  const raw = input.trim();
  const titleWords: string[] = [];
  let due: string | undefined;
  let priority: TaskPriority | undefined;
  let sectionQuery: string | undefined;

  for (const word of raw.split(/\s+/)) {
    if (word.length > 1 && word.startsWith('!') && priority === undefined) {
      const parsed = PRIORITY_TOKENS[word.slice(1).toLowerCase()];
      if (parsed) {
        priority = parsed;
        continue;
      }
    }
    if (word.length > 1 && word.startsWith('@') && due === undefined) {
      const parsed = resolveDueToken(word.slice(1), today);
      if (parsed) {
        due = parsed;
        continue;
      }
    }
    if (word.length > 1 && word.startsWith('#') && sectionQuery === undefined) {
      sectionQuery = word.slice(1);
      continue;
    }
    titleWords.push(word);
  }

  const title = titleWords.join(' ');
  if (!title) return { title: raw };
  return { title, due, priority, sectionQuery };
}

/** First letter upper-cased, for sections auto-created from a #token. */
export function capitalizeSectionTitle(query: string) {
  const trimmed = query.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

/** Case-insensitive section lookup: exact title, then prefix, then substring. */
export function matchSection<T extends { title: string }>(sections: T[], query: string): T | undefined {
  const lower = query.trim().toLowerCase();
  if (!lower) return undefined;
  return sections.find((section) => section.title.toLowerCase() === lower)
    ?? sections.find((section) => section.title.toLowerCase().startsWith(lower))
    ?? sections.find((section) => section.title.toLowerCase().includes(lower));
}
