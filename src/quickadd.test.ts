import { describe, expect, it } from 'vitest';
import { capitalizeSectionTitle, matchSection, parseQuickAdd } from './quickadd';

// 2026-07-06 is a Monday, which makes the weekday expectations exact.
const MONDAY = new Date(2026, 6, 6, 12);

describe('parseQuickAdd', () => {
  it('returns plain text as the title', () => {
    expect(parseQuickAdd('Buy groceries', MONDAY)).toEqual({
      title: 'Buy groceries',
      due: undefined,
      priority: undefined,
      sectionQuery: undefined,
    });
  });

  it('parses @today and @tomorrow relative to the given day', () => {
    expect(parseQuickAdd('Pay rent @today', MONDAY).due).toBe('2026-07-06');
    expect(parseQuickAdd('Pay rent @tomorrow', MONDAY).due).toBe('2026-07-07');
    expect(parseQuickAdd('Pay rent @tmr', MONDAY).due).toBe('2026-07-07');
    expect(parseQuickAdd('Pay rent @today', MONDAY).title).toBe('Pay rent');
  });

  it('parses weekdays as the next occurrence, never today', () => {
    expect(parseQuickAdd('Gym @fri', MONDAY).due).toBe('2026-07-10');
    expect(parseQuickAdd('Gym @tuesday', MONDAY).due).toBe('2026-07-07');
    // Naming today's weekday means next week; @today covers the same day.
    expect(parseQuickAdd('Gym @mon', MONDAY).due).toBe('2026-07-13');
  });

  it('parses exact dates', () => {
    expect(parseQuickAdd('File taxes @2026-12-25', MONDAY).due).toBe('2026-12-25');
  });

  it('parses every priority spelling', () => {
    expect(parseQuickAdd('a !high', MONDAY).priority).toBe('high');
    expect(parseQuickAdd('a !H', MONDAY).priority).toBe('high');
    expect(parseQuickAdd('a !1', MONDAY).priority).toBe('high');
    expect(parseQuickAdd('a !med', MONDAY).priority).toBe('medium');
    expect(parseQuickAdd('a !2', MONDAY).priority).toBe('medium');
    expect(parseQuickAdd('a !low', MONDAY).priority).toBe('low');
    expect(parseQuickAdd('a !l', MONDAY).priority).toBe('low');
  });

  it('captures the section token for the caller to resolve', () => {
    const parsed = parseQuickAdd('Buy books #school', MONDAY);
    expect(parsed.sectionQuery).toBe('school');
    expect(parsed.title).toBe('Buy books');
  });

  it('combines tokens in any position', () => {
    const parsed = parseQuickAdd('@fri Read !low chapter four #school', MONDAY);
    expect(parsed).toEqual({
      title: 'Read chapter four',
      due: '2026-07-10',
      priority: 'low',
      sectionQuery: 'school',
    });
  });

  it('keeps unrecognised or repeated tokens in the title', () => {
    expect(parseQuickAdd('Ship @later maybe', MONDAY).title).toBe('Ship @later maybe');
    expect(parseQuickAdd('Email bob@example.com', MONDAY).title).toBe('Email bob@example.com');
    const repeated = parseQuickAdd('a !high !low', MONDAY);
    expect(repeated.priority).toBe('high');
    expect(repeated.title).toBe('a !low');
  });

  it('keeps the raw text when stripping would empty the title', () => {
    expect(parseQuickAdd('@tomorrow', MONDAY)).toEqual({ title: '@tomorrow' });
    expect(parseQuickAdd('   ', MONDAY).title).toBe('');
  });
});

describe('matchSection', () => {
  const sections = [
    { id: 'a', title: 'School' },
    { id: 'b', title: 'Side projects' },
    { id: 'c', title: 'S' },
  ];

  it('prefers exact matches over prefixes over substrings', () => {
    expect(matchSection(sections, 's')?.id).toBe('c');
    expect(matchSection(sections, 'scho')?.id).toBe('a');
    expect(matchSection(sections, 'projects')?.id).toBe('b');
  });

  it('is case-insensitive and returns undefined when nothing matches', () => {
    expect(matchSection(sections, 'SCHOOL')?.id).toBe('a');
    expect(matchSection(sections, 'work')).toBeUndefined();
    expect(matchSection(sections, '')).toBeUndefined();
  });
});

describe('capitalizeSectionTitle', () => {
  it('upper-cases only the first letter', () => {
    expect(capitalizeSectionTitle('school')).toBe('School');
    expect(capitalizeSectionTitle('side projects')).toBe('Side projects');
    expect(capitalizeSectionTitle('  errands ')).toBe('Errands');
    expect(capitalizeSectionTitle('')).toBe('');
  });
});
