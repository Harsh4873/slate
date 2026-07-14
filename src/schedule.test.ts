import { describe, expect, it } from 'vitest';
import type { Block } from './model';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  SLOT_COUNT,
  SLOT_MIN,
  availableStarts,
  blocksOverlap,
  busyMinutes,
  fitsDay,
  formatBlockRange,
  formatHours,
  formatMinutes,
  isValidBlockTiming,
  layoutDayBlocks,
  liveBlocksForDay,
  maxDurationAt,
  nearestValidStart,
  nowOffsetMinutes,
  plannedMinutes,
  slotIndexFor,
  slotStart,
} from './schedule';

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    dateKey: '2026-07-12',
    startMin: 9 * 60,
    durationMin: 60,
    title: 'Focus',
    color: '#8d7cff',
    createdAt: '2026-07-12T08:00:00.000Z',
    updatedAt: '2026-07-12T08:00:00.000Z',
    ...overrides,
  };
}

describe('slot geometry', () => {
  it('covers 7:30 AM through 11:30 PM in 30-minute slots', () => {
    expect(DAY_START_MIN).toBe(450);
    expect(DAY_END_MIN).toBe(1410);
    expect(SLOT_COUNT).toBe(32);
    expect(slotStart(0)).toBe(450);
    expect(slotStart(SLOT_COUNT - 1) + SLOT_MIN).toBe(DAY_END_MIN);
  });

  it('round-trips slot indices', () => {
    for (let index = 0; index < SLOT_COUNT; index += 1) {
      expect(slotIndexFor(slotStart(index))).toBe(index);
    }
  });
});

describe('time formatting', () => {
  it('formats 12-hour labels', () => {
    expect(formatMinutes(450)).toBe('7:30 AM');
    expect(formatMinutes(720)).toBe('12:00 PM');
    expect(formatMinutes(1410)).toBe('11:30 PM');
    expect(formatMinutes(0)).toBe('12:00 AM');
  });

  it('formats block ranges and durations', () => {
    expect(formatBlockRange({ startMin: 600, durationMin: 90 })).toBe('10:00 AM – 11:30 AM');
    expect(formatHours(90)).toBe('1.5h');
    expect(formatHours(120)).toBe('2h');
  });
});

describe('block timing validation', () => {
  it('accepts slot-aligned blocks inside the day window', () => {
    expect(isValidBlockTiming(450, 30)).toBe(true);
    expect(isValidBlockTiming(1380, 30)).toBe(true);
    expect(isValidBlockTiming(600, 240)).toBe(true);
  });

  it('rejects misaligned, out-of-window, or overlong blocks', () => {
    expect(isValidBlockTiming(445, 30)).toBe(false);
    expect(isValidBlockTiming(450, 45)).toBe(false);
    expect(isValidBlockTiming(420, 30)).toBe(false);
    expect(isValidBlockTiming(1410, 30)).toBe(false);
    expect(isValidBlockTiming(1380, 60)).toBe(false);
  });
});

describe('day occupancy', () => {
  const day = [
    makeBlock({ id: 'block-a', startMin: 540, durationMin: 60 }),
    makeBlock({ id: 'block-b', startMin: 720, durationMin: 90 }),
  ];

  it('detects overlap in both directions', () => {
    expect(blocksOverlap({ startMin: 540, durationMin: 60 }, { startMin: 570, durationMin: 60 })).toBe(true);
    expect(blocksOverlap({ startMin: 540, durationMin: 60 }, { startMin: 600, durationMin: 30 })).toBe(false);
  });

  it('allows overlapping placements when timing is valid', () => {
    expect(fitsDay(day, 570, 30)).toBe(true);
    expect(fitsDay(day, 600, 120)).toBe(true);
    expect(fitsDay(day, 600, 150)).toBe(true);
    expect(fitsDay(day, 1380, 60)).toBe(false);
  });

  it('caps duration at the end of day only', () => {
    expect(maxDurationAt(day, 600)).toBe(DAY_END_MIN - 600);
    expect(maxDurationAt(day, 810)).toBe(DAY_END_MIN - 810);
    expect(maxDurationAt(day, 750)).toBe(DAY_END_MIN - 750);
    expect(maxDurationAt(day, 720, 'block-b')).toBe(DAY_END_MIN - 720);
  });

  it('lists every slot-aligned start that fits the day window', () => {
    const starts = availableStarts(day, 60);
    expect(starts).toContain(450);
    expect(starts).toContain(540);
    expect(starts).toContain(600);
    expect(starts).toContain(510);
    expect(starts).toContain(1350);
    expect(starts).not.toContain(1380);
  });

  it('snaps a drag preview to the nearest in-window start', () => {
    expect(nearestValidStart(day, 60, 605)).toBe(600);
    expect(nearestValidStart(day, 60, 550, 'block-a')).toBe(540);
    expect(nearestValidStart(day, 60, 200)).toBe(450);
    expect(nearestValidStart(day, 60, 2000)).toBe(DAY_END_MIN - 60);
  });

  it('filters, sorts, and totals a day of blocks', () => {
    const blocks = [
      makeBlock({ id: 'later', startMin: 900 }),
      makeBlock({ id: 'earlier', startMin: 480 }),
      makeBlock({ id: 'deleted', startMin: 600, deleted: true }),
      makeBlock({ id: 'other-day', dateKey: '2026-07-13' }),
    ];
    const live = liveBlocksForDay(blocks, '2026-07-12');
    expect(live.map((block) => block.id)).toEqual(['earlier', 'later']);
    expect(plannedMinutes(live)).toBe(120);
  });

  it('counts overlapping busy time once', () => {
    const overlapping = [
      makeBlock({ id: 'a', startMin: 600, durationMin: 60 }),
      makeBlock({ id: 'b', startMin: 630, durationMin: 60 }),
    ];
    expect(plannedMinutes(overlapping)).toBe(120);
    expect(busyMinutes(overlapping)).toBe(90);
  });
});

describe('overlap layout', () => {
  it('keeps solitary blocks full width', () => {
    const layout = layoutDayBlocks([
      makeBlock({ id: 'solo', startMin: 600, durationMin: 60 }),
    ]);
    expect(layout.get('solo')).toEqual({ column: 0, columnCount: 1 });
  });

  it('packs concurrent blocks into side-by-side lanes', () => {
    const layout = layoutDayBlocks([
      makeBlock({ id: 'a', startMin: 600, durationMin: 60 }),
      makeBlock({ id: 'b', startMin: 630, durationMin: 60 }),
    ]);
    expect(layout.get('a')?.columnCount).toBe(2);
    expect(layout.get('b')?.columnCount).toBe(2);
    expect(layout.get('a')?.column).not.toBe(layout.get('b')?.column);
  });

  it('keeps separate clusters independent', () => {
    const layout = layoutDayBlocks([
      makeBlock({ id: 'morning-a', startMin: 540, durationMin: 60 }),
      makeBlock({ id: 'morning-b', startMin: 540, durationMin: 30 }),
      makeBlock({ id: 'evening', startMin: 900, durationMin: 60 }),
    ]);
    expect(layout.get('morning-a')?.columnCount).toBe(2);
    expect(layout.get('morning-b')?.columnCount).toBe(2);
    expect(layout.get('evening')).toEqual({ column: 0, columnCount: 1 });
  });
});

describe('now indicator', () => {
  it('maps wall-clock time inside the window and hides outside it', () => {
    expect(nowOffsetMinutes(new Date(2026, 6, 12, 7, 29))).toBeNull();
    expect(nowOffsetMinutes(new Date(2026, 6, 12, 7, 30))).toBe(0);
    expect(nowOffsetMinutes(new Date(2026, 6, 12, 12, 0))).toBe(270);
    expect(nowOffsetMinutes(new Date(2026, 6, 12, 23, 30))).toBe(960);
    expect(nowOffsetMinutes(new Date(2026, 6, 12, 23, 31))).toBeNull();
  });
});
