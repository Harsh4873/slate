import { CalendarClock, CopyPlus, Eraser, ListChecks, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatCompactDate, formatDueKey, formatFullDate, isToday, toDateKey } from '../dates';
import { DEFAULT_COLOR, type Block, type SlateState, type Task } from '../model';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  SLOT_COUNT,
  SLOT_MIN,
  availableStarts,
  busyMinutes,
  clampSlotIndex,
  formatBlockRange,
  formatHours,
  formatMinutes,
  layoutDayBlocks,
  liveBlocksForDay,
  maxDurationAt,
  nearestValidStart,
  nowOffsetMinutes,
  plannedMinutes,
  slotIndexFor,
  slotStart,
} from '../schedule';
import type { SlateStore } from '../store';
import { ColorPicker, DateSwitcher, EmptyState, Modal, SectionHeading, accentStyle } from '../ui';

const SLOT_HEIGHT = 44;
const LONG_PRESS_MS = 380;
const ARM_MOVE_PX = 8;
const CANCEL_PRESS_PX = 12;

type EditorState =
  | { mode: 'create'; startMin: number; durationMin: number }
  | { mode: 'edit'; block: Block };

type MoveDrag = {
  blockId: string;
  startMin: number;
  durationMin: number;
  title: string;
  color: string;
  previewStartMin: number;
};

interface ScheduleViewProps {
  state: SlateState;
  saveBlock: SlateStore['saveBlock'];
  deleteBlock: SlateStore['deleteBlock'];
  copyDayBlocks: SlateStore['copyDayBlocks'];
  clearDayBlocks: SlateStore['clearDayBlocks'];
  toggleTask: SlateStore['toggleTask'];
}

function BlockEditor({ editor, dayBlocks, dateKey, onClose, saveBlock, deleteBlock }: {
  editor: EditorState;
  dayBlocks: Block[];
  dateKey: string;
  onClose: () => void;
  saveBlock: SlateStore['saveBlock'];
  deleteBlock: SlateStore['deleteBlock'];
}) {
  const editingId = editor.mode === 'edit' ? editor.block.id : undefined;
  const [title, setTitle] = useState(editor.mode === 'edit' ? editor.block.title : '');
  const [startMin, setStartMin] = useState(editor.mode === 'edit' ? editor.block.startMin : editor.startMin);
  const [durationMin, setDurationMin] = useState(editor.mode === 'edit' ? editor.block.durationMin : editor.durationMin);
  const [color, setColor] = useState(editor.mode === 'edit' ? editor.block.color : DEFAULT_COLOR);

  const startOptions = useMemo(() => {
    const options = new Set(availableStarts(dayBlocks, SLOT_MIN, editingId));
    options.add(startMin);
    return [...options].sort((left, right) => left - right);
  }, [dayBlocks, editingId, startMin]);

  const maxDuration = Math.max(SLOT_MIN, maxDurationAt(dayBlocks, startMin, editingId));
  const clampedDuration = Math.min(durationMin, maxDuration);

  function moveStart(nextStart: number) {
    // Keep the DESIRED duration; clampedDuration bounds what is shown and
    // saved, so passing through a tight gap does not shrink the block.
    setStartMin(nextStart);
  }

  function submit() {
    saveBlock({
      id: editingId,
      dateKey,
      startMin,
      durationMin: clampedDuration,
      title: title.trim() || 'Untitled block',
      color,
    });
    onClose();
  }

  return (
    <Modal
      title={editor.mode === 'edit' ? 'Edit block' : 'New block'}
      onClose={onClose}
      footer={(
        <div className="modal-actions">
          {editor.mode === 'edit' && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                deleteBlock(editor.block.id);
                onClose();
              }}
            >
              <Trash2 aria-hidden="true" /> Delete
            </button>
          )}
          <span className="modal-actions-spacer" />
          <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-primary" onClick={submit}>
            {editor.mode === 'edit' ? 'Save block' : 'Add block'}
          </button>
        </div>
      )}
    >
      <form
        className="block-editor"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field-label">Title</span>
          <input
            type="text"
            value={title}
            placeholder="Deep work, gym, dinner…"
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Starts</span>
            <select value={startMin} onChange={(event) => moveStart(Number(event.target.value))}>
              {startOptions.map((option) => (
                <option key={option} value={option}>{formatMinutes(option)}</option>
              ))}
            </select>
          </label>

          <div className="field">
            <span className="field-label" id="block-duration-label">Duration</span>
            <div className="stepper" role="group" aria-labelledby="block-duration-label">
              <button
                type="button"
                onClick={() => setDurationMin((current) => Math.max(SLOT_MIN, current - SLOT_MIN))}
                disabled={clampedDuration <= SLOT_MIN}
                aria-label="Shorten by 30 minutes"
              >
                −
              </button>
              <strong>{formatHours(clampedDuration)}</strong>
              <button
                type="button"
                onClick={() => setDurationMin((current) => Math.min(maxDuration, current + SLOT_MIN))}
                disabled={clampedDuration >= maxDuration}
                aria-label="Extend by 30 minutes"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Color</span>
          <ColorPicker value={color} onChange={setColor} idPrefix="block-color" />
        </div>

        <p className="field-hint">
          {formatMinutes(startMin)} – {formatMinutes(startMin + clampedDuration)}
        </p>
      </form>
    </Modal>
  );
}

export function ScheduleView({ state, saveBlock, deleteBlock, copyDayBlocks, clearDayBlocks, toggleTask }: ScheduleViewProps) {
  const [date, setDate] = useState(() => new Date());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [dragRange, setDragRange] = useState<{ anchor: number; end: number } | null>(null);
  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ anchor: number; end: number; pointerId: number } | null>(null);
  const moveDragRef = useRef<{
    blockId: string;
    pointerId: number;
    grabOffsetY: number;
    originStartMin: number;
    durationMin: number;
    title: string;
    color: string;
    previewStartMin: number;
    armed: boolean;
    moved: boolean;
    startClientY: number;
    startClientX: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const dateKey = toDateKey(date);
  const viewingToday = isToday(date);
  const dayBlocks = useMemo(() => liveBlocksForDay(state.blocks, dateKey), [state.blocks, dateKey]);
  const yesterdayKey = toDateKey(addDays(date, -1));
  const yesterdayBlocks = useMemo(() => liveBlocksForDay(state.blocks, yesterdayKey), [state.blocks, yesterdayKey]);

  useEffect(() => {
    if (!viewingToday) return;
    setNowTick(new Date());
    const timer = window.setInterval(() => setNowTick(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [viewingToday]);

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
  }, []);

  const occupiedSlots = useMemo(() => {
    const occupied = new Set<number>();
    for (const block of dayBlocks) {
      if (moveDrag && block.id === moveDrag.blockId) continue;
      const first = slotIndexFor(block.startMin);
      const span = block.durationMin / SLOT_MIN;
      for (let offset = 0; offset < span; offset += 1) occupied.add(first + offset);
    }
    return occupied;
  }, [dayBlocks, moveDrag]);

  const displayBlocks = useMemo(() => (
    dayBlocks.map((block) => (
      moveDrag && block.id === moveDrag.blockId
        ? { ...block, startMin: moveDrag.previewStartMin }
        : block
    ))
  ), [dayBlocks, moveDrag]);

  const blockLanes = useMemo(() => layoutDayBlocks(displayBlocks), [displayBlocks]);

  const todayKey = toDateKey(new Date());
  const focusTasks = useMemo(() => {
    const open = state.tasks.filter((task): task is Task => !task.deleted && !task.done && Boolean(task.due) && (task.due as string) <= todayKey);
    return open.sort((left, right) => (left.due as string).localeCompare(right.due as string) || left.order - right.order);
  }, [state.tasks, todayKey]);

  const planned = plannedMinutes(dayBlocks);
  const busy = busyMinutes(dayBlocks);
  const daySpan = DAY_END_MIN - slotStart(0);
  const nowOffset = viewingToday ? nowOffsetMinutes(nowTick) : null;

  function slotIndexFromClientY(clientY: number) {
    const grid = gridRef.current;
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    return clampSlotIndex(Math.floor((clientY - rect.top) / SLOT_HEIGHT));
  }

  function previewStartFromClientY(clientY: number, grabOffsetY: number, durationMin: number, blockId: string) {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const topY = clientY - rect.top - grabOffsetY;
    const desiredStartMin = DAY_START_MIN + (topY / SLOT_HEIGHT) * SLOT_MIN;
    return nearestValidStart(dayBlocks, durationMin, desiredStartMin, blockId);
  }

  /** Grow the selection from the anchor; overlaps are fine, only stay inside the grid. */
  function clampDragEnd(_anchor: number, rawEnd: number) {
    return clampSlotIndex(rawEnd);
  }

  function openCreateEditor(fromIndex: number, toIndex: number) {
    const first = Math.min(fromIndex, toIndex);
    const last = Math.max(fromIndex, toIndex);
    setEditor({
      mode: 'create',
      startMin: slotStart(first),
      durationMin: (last - first + 1) * SLOT_MIN,
    });
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function armMoveDrag() {
    const pending = moveDragRef.current;
    if (!pending || pending.armed) return;
    pending.armed = true;
    setMoveDrag({
      blockId: pending.blockId,
      startMin: pending.originStartMin,
      durationMin: pending.durationMin,
      title: pending.title,
      color: pending.color,
      previewStartMin: pending.previewStartMin,
    });
    try {
      navigator.vibrate?.(12);
    } catch {
      // Vibration is best-effort on phones that support it.
    }
  }

  function onBlockPointerDown(event: React.PointerEvent<HTMLButtonElement>, block: Block) {
    if (event.button !== 0) return;
    if (moveDragRef.current || dragStateRef.current) return;
    event.stopPropagation();

    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const blockTop = slotIndexFor(block.startMin) * SLOT_HEIGHT + 2;
    const grabOffsetY = event.clientY - rect.top - blockTop;

    moveDragRef.current = {
      blockId: block.id,
      pointerId: event.pointerId,
      grabOffsetY,
      originStartMin: block.startMin,
      durationMin: block.durationMin,
      title: block.title,
      color: block.color,
      previewStartMin: block.startMin,
      armed: false,
      moved: false,
      startClientY: event.clientY,
      startClientX: event.clientX,
    };

    const isTouchLike = event.pointerType === 'touch' || event.pointerType === 'pen';
    if (isTouchLike) {
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        armMoveDrag();
      }, LONG_PRESS_MS);
    }

    const onMove = (moveEvent: PointerEvent) => {
      const pending = moveDragRef.current;
      if (!pending || moveEvent.pointerId !== pending.pointerId) return;

      const dx = moveEvent.clientX - pending.startClientX;
      const dy = moveEvent.clientY - pending.startClientY;
      const distance = Math.hypot(dx, dy);

      if (!pending.armed) {
        if (isTouchLike) {
          if (distance > CANCEL_PRESS_PX) {
            // Finger slid before the long-press — let the page scroll instead.
            teardownMoveListeners();
            moveDragRef.current = null;
            clearLongPressTimer();
          }
          return;
        }
        if (distance < ARM_MOVE_PX) return;
        armMoveDrag();
      }

      moveEvent.preventDefault();
      const nextStart = previewStartFromClientY(
        moveEvent.clientY,
        pending.grabOffsetY,
        pending.durationMin,
        pending.blockId,
      );
      if (nextStart === null) return;
      if (nextStart !== pending.previewStartMin) {
        pending.previewStartMin = nextStart;
        pending.moved = nextStart !== pending.originStartMin;
        setMoveDrag({
          blockId: pending.blockId,
          startMin: pending.originStartMin,
          durationMin: pending.durationMin,
          title: pending.title,
          color: pending.color,
          previewStartMin: nextStart,
        });
      } else if (Math.abs(dy) > ARM_MOVE_PX) {
        pending.moved = pending.previewStartMin !== pending.originStartMin;
      }
    };

    const teardownMoveListeners = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
    };

    const onTouchMove = (touchEvent: TouchEvent) => {
      if (!moveDragRef.current?.armed) return;
      touchEvent.preventDefault();
    };

    const finish = (cancelled: boolean) => {
      clearLongPressTimer();
      teardownMoveListeners();
      const pending = moveDragRef.current;
      moveDragRef.current = null;
      setMoveDrag(null);
      if (!pending || cancelled) return;

      if (!pending.armed) {
        setEditor({ mode: 'edit', block });
        return;
      }

      if (pending.moved && pending.previewStartMin !== pending.originStartMin) {
        saveBlock({
          id: pending.blockId,
          dateKey,
          startMin: pending.previewStartMin,
          durationMin: pending.durationMin,
          title: pending.title,
          color: pending.color,
        });
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      finish(false);
    };

    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== event.pointerId) return;
      finish(true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function onSlotPointerDown(event: React.PointerEvent<HTMLDivElement>, index: number) {
    if (event.pointerType !== 'mouse') return; // touch keeps native scrolling; tap-create handles it
    if (moveDragRef.current) return;
    event.preventDefault();
    dragStateRef.current = { anchor: index, end: index, pointerId: event.pointerId };
    setDragRange({ anchor: index, end: index });

    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || moveEvent.pointerId !== drag.pointerId) return;
      const end = clampDragEnd(drag.anchor, slotIndexFromClientY(moveEvent.clientY));
      if (end !== drag.end) {
        drag.end = end;
        setDragRange({ anchor: drag.anchor, end });
      }
    };
    const onUp = (upEvent: PointerEvent) => {
      const drag = dragStateRef.current;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (!drag || upEvent.pointerId !== drag.pointerId) return;
      dragStateRef.current = null;
      setDragRange(null);
      openCreateEditor(drag.anchor, drag.end);
    };
    const onCancel = () => {
      dragStateRef.current = null;
      setDragRange(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  const selection = dragRange
    ? { first: Math.min(dragRange.anchor, dragRange.end), last: Math.max(dragRange.anchor, dragRange.end) }
    : null;

  return (
    <section className="view schedule-view">
      <SectionHeading
        eyebrow="Time-boxed day"
        title={formatFullDate(date)}
        copy={dayBlocks.length
          ? `${dayBlocks.length} block${dayBlocks.length === 1 ? '' : 's'} · ${formatHours(planned)} planned · ${formatHours(Math.max(0, daySpan - busy))} free`
          : 'Nothing planned yet. Click a slot — or drag across a few — to box out time.'}
        action={(
          <DateSwitcher
            eyebrow={viewingToday ? 'Today' : formatDueKey(dateKey)}
            label={formatCompactDate(date)}
            onPrevious={() => setDate((current) => addDays(current, -1))}
            onNext={() => setDate((current) => addDays(current, 1))}
            onToday={() => setDate(new Date())}
            todayDisabled={viewingToday}
          />
        )}
      />

      <div className="schedule-layout">
        <div className="schedule-panel panel">
          <div className="schedule-toolbar">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => copyDayBlocks(yesterdayKey, dateKey)}
              disabled={yesterdayBlocks.length === 0}
              title="Copy yesterday's blocks onto this day"
            >
              <CopyPlus aria-hidden="true" /> Copy yesterday
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                if (window.confirm(`Clear all ${dayBlocks.length} blocks on ${formatFullDate(date)}?`)) {
                  clearDayBlocks(dateKey);
                }
              }}
              disabled={dayBlocks.length === 0}
            >
              <Eraser aria-hidden="true" /> Clear day
            </button>
          </div>

          <div className="schedule-body">
            <div className="schedule-gutter" aria-hidden="true" style={{ height: SLOT_COUNT * SLOT_HEIGHT }}>
              {Array.from({ length: SLOT_COUNT }, (_, index) => {
                const minutes = slotStart(index);
                if (index !== 0 && minutes % 60 !== 0) return null;
                return (
                  <span key={minutes} className="schedule-gutter-label" style={{ top: index * SLOT_HEIGHT }}>
                    {formatMinutes(minutes)}
                  </span>
                );
              })}
            </div>

            <div
              className={`schedule-grid${moveDrag ? ' is-moving-block' : ''}`}
              ref={gridRef}
              style={{ height: SLOT_COUNT * SLOT_HEIGHT }}
              role="group"
              aria-label={`Schedule for ${formatFullDate(date)}, 7:30 AM to 11:30 PM in 30 minute slots`}
            >
              {Array.from({ length: SLOT_COUNT }, (_, index) => {
                const minutes = slotStart(index);
                const occupied = occupiedSlots.has(index);
                const inSelection = selection && index >= selection.first && index <= selection.last;
                return (
                  <div
                    key={minutes}
                    className={`schedule-slot${minutes % 60 === 0 ? ' schedule-slot-hour' : ''}${inSelection ? ' schedule-slot-selected' : ''}`}
                    style={{ top: index * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                    onPointerDown={(event) => onSlotPointerDown(event, index)}
                  >
                    {!occupied && (
                      <button
                        type="button"
                        className="schedule-slot-add"
                        onClick={() => openCreateEditor(index, index)}
                        aria-label={`Add block at ${formatMinutes(minutes)}`}
                      >
                        <Plus aria-hidden="true" />
                        <span>{formatMinutes(minutes)}</span>
                      </button>
                    )}
                  </div>
                );
              })}

              {displayBlocks.map((block) => {
                const isMoving = moveDrag?.blockId === block.id;
                const lane = blockLanes.get(block.id) ?? { column: 0, columnCount: 1 };
                const laneGap = 3;
                const edgeInset = 8;
                const overlapping = lane.columnCount > 1;
                return (
                  <button
                    key={block.id}
                    type="button"
                    className={`schedule-block${isMoving ? ' is-dragging' : ''}${overlapping ? ' is-overlapping' : ''}`}
                    style={{
                      ...accentStyle(block.color),
                      top: slotIndexFor(block.startMin) * SLOT_HEIGHT + 2,
                      height: (block.durationMin / SLOT_MIN) * SLOT_HEIGHT - 4,
                      left: `calc(${edgeInset}px + (100% - ${edgeInset * 2}px) * ${lane.column / lane.columnCount})`,
                      width: `calc((100% - ${edgeInset * 2}px) / ${lane.columnCount} - ${laneGap}px)`,
                      zIndex: isMoving ? 8 : 4 + lane.column,
                    }}
                    onPointerDown={(event) => {
                      const source = dayBlocks.find((item) => item.id === block.id);
                      if (source) onBlockPointerDown(event, source);
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                    onClick={(event) => {
                      // Tap-to-edit is handled in pointerup; ignore the synthetic click after a press.
                      event.preventDefault();
                    }}
                  >
                    <strong>{block.title}</strong>
                    <span>{formatBlockRange(block)}</span>
                  </button>
                );
              })}

              {selection && (
                <div
                  className="schedule-selection"
                  aria-hidden="true"
                  style={{
                    top: selection.first * SLOT_HEIGHT,
                    height: (selection.last - selection.first + 1) * SLOT_HEIGHT,
                  }}
                >
                  {formatMinutes(slotStart(selection.first))} – {formatMinutes(slotStart(selection.last) + SLOT_MIN)}
                </div>
              )}

              {nowOffset !== null && (
                <div
                  className="schedule-now"
                  style={{ top: (nowOffset / SLOT_MIN) * SLOT_HEIGHT }}
                  aria-label={`Current time ${formatMinutes(nowOffset + slotStart(0))}`}
                >
                  <i />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="schedule-aside">
          <div className="panel aside-panel">
            <div className="panel-heading">
              <h2><ListChecks aria-hidden="true" /> Due today</h2>
              <span className="panel-heading-note">{focusTasks.length ? `${focusTasks.length} open` : 'All clear'}</span>
            </div>
            {focusTasks.length === 0 ? (
              <EmptyState
                icon={<CalendarClock />}
                title="Nothing due"
                copy="Tasks with a due date of today (or overdue) appear here so the day plan and the list stay honest together."
              />
            ) : (
              <ul className="focus-list">
                {focusTasks.map((task) => (
                  <li key={task.id} className="focus-task">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleTask(task.id)}
                      aria-label={`Mark ${task.title || 'untitled task'} done`}
                    />
                    <span className="focus-task-title">{task.title || 'Untitled task'}</span>
                    <span className={`due-chip${task.due && task.due < todayKey ? ' due-chip-overdue' : ''}`}>
                      {task.due ? formatDueKey(task.due) : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <a className="aside-link" href="#todo">Open the full list →</a>
          </div>
        </aside>
      </div>

      {editor && (
        <BlockEditor
          editor={editor}
          dayBlocks={dayBlocks}
          dateKey={dateKey}
          onClose={() => setEditor(null)}
          saveBlock={saveBlock}
          deleteBlock={deleteBlock}
        />
      )}
    </section>
  );
}
