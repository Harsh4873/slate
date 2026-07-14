import type { Block } from './model';

// The planning day runs 7:30 AM to 11:30 PM in 30-minute slots.
export const SLOT_MIN = 30;
export const DAY_START_MIN = 7 * 60 + 30;
export const DAY_END_MIN = 23 * 60 + 30;
export const SLOT_COUNT = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;

export function slotStart(index: number) {
  return DAY_START_MIN + index * SLOT_MIN;
}

export function slotIndexFor(startMin: number) {
  return Math.round((startMin - DAY_START_MIN) / SLOT_MIN);
}

export function clampSlotIndex(index: number) {
  return Math.min(Math.max(index, 0), SLOT_COUNT - 1);
}

export function formatMinutes(totalMin: number) {
  const hours24 = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${`${minutes}`.padStart(2, '0')} ${meridiem}`;
}

export function formatBlockRange(block: Pick<Block, 'startMin' | 'durationMin'>) {
  return `${formatMinutes(block.startMin)} – ${formatMinutes(block.startMin + block.durationMin)}`;
}

export function isValidBlockTiming(startMin: number, durationMin: number) {
  return Number.isInteger(startMin)
    && Number.isInteger(durationMin)
    && startMin >= DAY_START_MIN
    && durationMin >= SLOT_MIN
    && durationMin % SLOT_MIN === 0
    && (startMin - DAY_START_MIN) % SLOT_MIN === 0
    && startMin + durationMin <= DAY_END_MIN;
}

export function liveBlocksForDay(blocks: Block[], dateKey: string) {
  return blocks
    .filter((block) => !block.deleted && block.dateKey === dateKey)
    .sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
}

export function blocksOverlap(
  left: Pick<Block, 'startMin' | 'durationMin'>,
  right: Pick<Block, 'startMin' | 'durationMin'>,
) {
  return left.startMin < right.startMin + right.durationMin
    && right.startMin < left.startMin + left.durationMin;
}

/** Whether a candidate block’s timing is valid for the day window. Overlaps are allowed. */
export function fitsDay(
  _dayBlocks: Block[],
  startMin: number,
  durationMin: number,
  _excludeId?: string,
) {
  return isValidBlockTiming(startMin, durationMin);
}

/** Longest duration a block at startMin can run before hitting the end of the day. */
export function maxDurationAt(_dayBlocks: Block[], startMin: number, _excludeId?: string) {
  if (startMin < DAY_START_MIN || startMin >= DAY_END_MIN) return 0;
  if ((startMin - DAY_START_MIN) % SLOT_MIN !== 0) return 0;
  return Math.max(0, DAY_END_MIN - startMin);
}

/** Every slot-aligned start where durationMin still fits inside the day window. */
export function availableStarts(_dayBlocks: Block[], durationMin: number, _excludeId?: string) {
  const starts: number[] = [];
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const startMin = slotStart(index);
    if (startMin + durationMin > DAY_END_MIN) break;
    if (isValidBlockTiming(startMin, durationMin)) starts.push(startMin);
  }
  return starts;
}

/** Snap a drag preview to the nearest slot-aligned start inside the day window. */
export function nearestValidStart(
  _dayBlocks: Block[],
  durationMin: number,
  desiredStartMin: number,
  _excludeId?: string,
) {
  if (!Number.isInteger(durationMin) || durationMin < SLOT_MIN || durationMin % SLOT_MIN !== 0) {
    return null;
  }

  const slotSpan = Math.max(1, durationMin / SLOT_MIN);
  const maxIndex = SLOT_COUNT - slotSpan;
  if (maxIndex < 0) return null;

  const rawIndex = Math.round((desiredStartMin - DAY_START_MIN) / SLOT_MIN);
  return slotStart(Math.min(Math.max(rawIndex, 0), maxIndex));
}

export type BlockLane = {
  column: number;
  columnCount: number;
};

/**
 * Pack overlapping blocks into side-by-side lanes (Apple/Google calendar style).
 * Connected overlap clusters share a column count so concurrent blocks stay legible.
 */
export function layoutDayBlocks(
  blocks: Array<Pick<Block, 'id' | 'startMin' | 'durationMin'>>,
): Map<string, BlockLane> {
  const layout = new Map<string, BlockLane>();
  if (blocks.length === 0) return layout;

  const ordered = [...blocks].sort((left, right) => (
    left.startMin - right.startMin
    || right.durationMin - left.durationMin
    || left.id.localeCompare(right.id)
  ));

  const columnEnds: number[] = [];
  const placed = ordered.map((block) => {
    const endMin = block.startMin + block.durationMin;
    let column = 0;
    while (column < columnEnds.length && columnEnds[column] > block.startMin) column += 1;
    if (column === columnEnds.length) columnEnds.push(endMin);
    else columnEnds[column] = endMin;
    return { id: block.id, startMin: block.startMin, endMin, column };
  });

  const parent = placed.map((_, index) => index);
  function find(index: number): number {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  }
  function union(left: number, right: number) {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  }

  for (let left = 0; left < placed.length; left += 1) {
    for (let right = left + 1; right < placed.length; right += 1) {
      if (placed[left].startMin < placed[right].endMin && placed[right].startMin < placed[left].endMin) {
        union(left, right);
      }
    }
  }

  const clusterWidth = new Map<number, number>();
  for (let index = 0; index < placed.length; index += 1) {
    const root = find(index);
    clusterWidth.set(root, Math.max(clusterWidth.get(root) ?? 1, placed[index].column + 1));
  }

  for (let index = 0; index < placed.length; index += 1) {
    layout.set(placed[index].id, {
      column: placed[index].column,
      columnCount: clusterWidth.get(find(index)) ?? 1,
    });
  }

  return layout;
}

/** Union of occupied minutes (overlaps counted once) for free-time summaries. */
export function busyMinutes(dayBlocks: Array<Pick<Block, 'startMin' | 'durationMin'>>) {
  if (dayBlocks.length === 0) return 0;
  const intervals = dayBlocks
    .map((block) => [block.startMin, block.startMin + block.durationMin] as const)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  let total = 0;
  let curStart = intervals[0][0];
  let curEnd = intervals[0][1];
  for (let index = 1; index < intervals.length; index += 1) {
    const [start, end] = intervals[index];
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
      continue;
    }
    total += curEnd - curStart;
    curStart = start;
    curEnd = end;
  }
  return total + (curEnd - curStart);
}

export function plannedMinutes(dayBlocks: Block[]) {
  return dayBlocks.reduce((total, block) => total + block.durationMin, 0);
}

export function formatHours(totalMin: number) {
  const hours = totalMin / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}h`;
}

/** Minutes-into-grid for the current wall-clock time, or null when outside the grid. */
export function nowOffsetMinutes(now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < DAY_START_MIN || minutes > DAY_END_MIN) return null;
  return minutes - DAY_START_MIN;
}
