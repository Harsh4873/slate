import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Eraser,
  Eye,
  EyeOff,
  Flag,
  FolderPlus,
  GripVertical,
  ListTodo,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDueKey, formatFullDate, isOverdueKey, toDateKey } from '../dates';
import {
  DEFAULT_SECTION_TITLE,
  PRIORITY_LABELS,
  type Section,
  type SlateState,
  type Task,
  type TaskPriority,
} from '../model';
import { sortByOrder } from '../order';
import { capitalizeSectionTitle, matchSection, parseQuickAdd } from '../quickadd';
import type { SlateStore } from '../store';
import { ColorPicker, EmptyState, Modal, accentStyle } from '../ui';

interface TodoViewProps {
  state: SlateState;
  addSection: SlateStore['addSection'];
  renameSection: SlateStore['renameSection'];
  setSectionColor: SlateStore['setSectionColor'];
  toggleSectionCollapsed: SlateStore['toggleSectionCollapsed'];
  moveSection: SlateStore['moveSection'];
  deleteSection: SlateStore['deleteSection'];
  restoreSection: SlateStore['restoreSection'];
  clearCompleted: SlateStore['clearCompleted'];
  addTask: SlateStore['addTask'];
  addTaskToNewSection: SlateStore['addTaskToNewSection'];
  updateTask: SlateStore['updateTask'];
  toggleTask: SlateStore['toggleTask'];
  moveTask: SlateStore['moveTask'];
  deleteTask: SlateStore['deleteTask'];
  restoreTasks: SlateStore['restoreTasks'];
  updateSettings: SlateStore['updateSettings'];
}

type TaskFilter = 'all' | 'today' | 'upcoming';

const FILTER_LABELS: Record<TaskFilter, string> = {
  all: 'All',
  today: 'Today',
  upcoming: 'Upcoming',
};

interface DropTarget {
  sectionId: string;
  beforeTaskId: string | null;
}

interface UndoAction {
  label: string;
  taskIds: string[];
  sectionId?: string;
}

const NEXT_PRIORITY: Record<TaskPriority, TaskPriority | undefined> = {
  high: 'medium',
  medium: 'low',
  low: undefined,
};

function InlineText({ value, onCommit, placeholder, ariaLabel, className }: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // blur() fires the commit synchronously, before an Escape's setDraft state
  // update flushes — a ref is the only reliable cancel signal.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value]);

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(value);
      return;
    }
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else setDraft(value);
  }

  return (
    <input
      ref={inputRef}
      className={`inline-text${className ? ` ${className}` : ''}`}
      type="text"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          inputRef.current?.blur();
        }
        if (event.key === 'Escape') {
          cancelledRef.current = true;
          setDraft(value);
          inputRef.current?.blur();
        }
      }}
      maxLength={200}
    />
  );
}

function QuickAdd({ sections, onSubmit }: {
  sections: Section[];
  onSubmit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuickAdd(draft), [draft]);
  const hasText = draft.trim().length > 0;
  const targetSection = parsed.sectionQuery ? matchSection(sections, parsed.sectionQuery) : sections[0];
  const targetLabel = parsed.sectionQuery && !targetSection
    ? `new section “${capitalizeSectionTitle(parsed.sectionQuery)}”`
    : targetSection?.title || DEFAULT_SECTION_TITLE;

  function submit() {
    if (!hasText) return;
    onSubmit(draft);
    setDraft('');
    inputRef.current?.focus();
  }

  return (
    <div className="quick-add">
      <div className="quick-add-bar">
        <Plus aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          placeholder="Add a task…"
          aria-label="Add a task. Tokens: @ due date, ! priority, # section."
          maxLength={400}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape') setDraft('');
          }}
        />
        {hasText && (
          <button type="button" className="quick-add-submit" onClick={submit}>
            Add
          </button>
        )}
      </div>
      {hasText ? (
        <div className="quick-add-preview" aria-live="polite">
          <span className="quick-add-chip quick-add-chip-section">{targetLabel}</span>
          {parsed.due && <span className="quick-add-chip">{formatDueKey(parsed.due)}</span>}
          {parsed.priority && (
            <span className={`quick-add-chip quick-add-chip-${parsed.priority}`}>
              <Flag aria-hidden="true" /> {PRIORITY_LABELS[parsed.priority]}
            </span>
          )}
        </div>
      ) : (
        <p className="quick-add-hint">
          <kbd>@tomorrow</kbd> due · <kbd>!high</kbd> priority · <kbd>#section</kbd> file it
        </p>
      )}
    </div>
  );
}

function SectionMenu({ section, isFirst, isLast, hasCompleted, moveSection, setSectionColor, onClearCompleted, onDelete }: {
  section: Section;
  isFirst: boolean;
  isLast: boolean;
  hasCompleted: boolean;
  moveSection: SlateStore['moveSection'];
  setSectionColor: SlateStore['setSectionColor'];
  onClearCompleted: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="section-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-button icon-button-quiet"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Section options for ${section.title || 'untitled section'}`}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && (
        <div className="section-menu-popover">
          <div className="section-menu-colors">
            <ColorPicker
              value={section.color}
              onChange={(color) => setSectionColor(section.id, color)}
              idPrefix={`section-color-${section.id}`}
            />
          </div>
          <button type="button" className="section-menu-item" disabled={isFirst} onClick={() => { moveSection(section.id, -1); setOpen(false); }}>
            <ArrowUp aria-hidden="true" /> Move up
          </button>
          <button type="button" className="section-menu-item" disabled={isLast} onClick={() => { moveSection(section.id, 1); setOpen(false); }}>
            <ArrowDown aria-hidden="true" /> Move down
          </button>
          <button type="button" className="section-menu-item" disabled={!hasCompleted} onClick={() => { onClearCompleted(); setOpen(false); }}>
            <Eraser aria-hidden="true" /> Clear completed
          </button>
          <button type="button" className="section-menu-item section-menu-danger" onClick={() => { onDelete(); setOpen(false); }}>
            <Trash2 aria-hidden="true" /> Delete section
          </button>
        </div>
      )}
    </div>
  );
}

function TaskDetailsModal({ task, sections, onClose, updateTask, toggleTask, onDelete, moveStep, canMoveUp, canMoveDown }: {
  task: Task;
  sections: Section[];
  onClose: () => void;
  updateTask: SlateStore['updateTask'];
  toggleTask: SlateStore['toggleTask'];
  onDelete: () => void;
  moveStep: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [notes, setNotes] = useState(task.notes);

  function commitNotes() {
    if (notes !== task.notes) updateTask(task.id, { notes });
  }

  const priorityChoices: Array<{ value: TaskPriority | undefined; label: string }> = [
    { value: undefined, label: 'None' },
    { value: 'low', label: PRIORITY_LABELS.low },
    { value: 'medium', label: PRIORITY_LABELS.medium },
    { value: 'high', label: PRIORITY_LABELS.high },
  ];

  return (
    <Modal
      title="Task details"
      onClose={() => {
        commitNotes();
        onClose();
      }}
      footer={(
        <div className="modal-actions">
          <button
            type="button"
            className="button button-danger"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <Trash2 aria-hidden="true" /> Delete task
          </button>
          <span className="modal-actions-spacer" />
          <button type="button" className="button button-primary" onClick={() => { commitNotes(); onClose(); }}>Done</button>
        </div>
      )}
    >
      <div className="task-details">
        <label className={`task-details-check${task.done ? ' is-done' : ''}`}>
          <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} />
          <span>{task.done ? 'Completed' : 'Mark complete'}</span>
        </label>

        <label className="field">
          <span className="field-label">Title</span>
          <input
            type="text"
            defaultValue={task.title}
            aria-label="Task title"
            maxLength={200}
            onBlur={(event) => {
              const trimmed = event.target.value.trim();
              if (trimmed && trimmed !== task.title) updateTask(task.id, { title: trimmed });
              else if (!trimmed) event.target.value = task.title;
            }}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Due date</span>
            <input
              type="date"
              value={task.due ?? ''}
              onChange={(event) => updateTask(task.id, { due: event.target.value || undefined })}
            />
          </label>
          <label className="field">
            <span className="field-label">Section</span>
            <select
              value={task.sectionId}
              onChange={(event) => updateTask(task.id, { sectionId: event.target.value })}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.title || 'Untitled section'}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span className="field-label" id={`task-priority-${task.id}`}>Priority</span>
          <div className="priority-options" role="radiogroup" aria-labelledby={`task-priority-${task.id}`}>
            {priorityChoices.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={task.priority === value}
                className={`priority-option${task.priority === value ? ' selected' : ''}${value ? ` priority-${value}` : ''}`}
                onClick={() => updateTask(task.id, { priority: value })}
              >
                {value && <Flag aria-hidden="true" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label" id="task-position-label">Position in section</span>
          <div className="task-move-row" role="group" aria-labelledby="task-position-label">
            <button type="button" className="button button-secondary" onClick={() => moveStep(-1)} disabled={!canMoveUp}>
              <ArrowUp aria-hidden="true" /> Move up
            </button>
            <button type="button" className="button button-secondary" onClick={() => moveStep(1)} disabled={!canMoveDown}>
              <ArrowDown aria-hidden="true" /> Move down
            </button>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            rows={5}
            value={notes}
            placeholder="Links, subtasks, context…"
            onChange={(event) => setNotes(event.target.value)}
            onBlur={commitNotes}
          />
        </label>
      </div>
    </Modal>
  );
}

export function TodoView({
  state,
  addSection,
  renameSection,
  setSectionColor,
  toggleSectionCollapsed,
  moveSection,
  deleteSection,
  restoreSection,
  clearCompleted,
  addTask,
  addTaskToNewSection,
  updateTask,
  toggleTask,
  moveTask,
  deleteTask,
  restoreTasks,
  updateSettings,
}: TodoViewProps) {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [query, setQuery] = useState('');
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  // Rows are only draggable while the grip is pressed, so text selection and
  // caret placement inside the inline inputs keep working.
  const [armedTaskId, setArmedTaskId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<number>();
  const searchRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim().toLowerCase();
  const filterActive = filter !== 'all' || trimmedQuery.length > 0;
  const todayKey = toDateKey(new Date());

  const sections = useMemo(() => sortByOrder(state.sections.filter((section) => !section.deleted)), [state.sections]);
  const tasksBySection = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const section of sections) grouped.set(section.id, []);
    for (const task of state.tasks) {
      if (task.deleted) continue;
      grouped.get(task.sectionId)?.push(task);
    }
    for (const [sectionId, tasks] of grouped) grouped.set(sectionId, sortByOrder(tasks));
    return grouped;
  }, [sections, state.tasks]);

  const hideCompleted = state.settings.hideCompleted;
  const liveTasks = useMemo(() => state.tasks.filter((task) => !task.deleted), [state.tasks]);
  const openCount = liveTasks.reduce((count, task) => count + (task.done ? 0 : 1), 0);
  const doneCount = liveTasks.length - openCount;
  const filterCounts: Record<TaskFilter, number> = useMemo(() => {
    const open = liveTasks.filter((task) => !task.done);
    return {
      all: open.length,
      today: open.filter((task) => task.due && task.due <= todayKey).length,
      upcoming: open.filter((task) => task.due && task.due > todayKey).length,
    };
  }, [liveTasks, todayKey]);

  const matchesView = useMemo(() => {
    return (task: Task) => {
      if (filter === 'today' && !(task.due && task.due <= todayKey)) return false;
      if (filter === 'upcoming' && !(task.due && task.due > todayKey)) return false;
      if (trimmedQuery
        && !task.title.toLowerCase().includes(trimmedQuery)
        && !task.notes.toLowerCase().includes(trimmedQuery)) return false;
      return true;
    };
  }, [filter, todayKey, trimmedQuery]);

  const detailsTask = detailsTaskId
    ? state.tasks.find((task) => task.id === detailsTaskId && !task.deleted) ?? null
    : null;
  // A concurrent delete-section on another device can strand live tasks whose
  // section is now a tombstone; surface them instead of hiding them forever.
  const orphanTasks = useMemo(() => {
    const liveSectionIds = new Set(sections.map((section) => section.id));
    return sortByOrder(state.tasks.filter((task) => !task.deleted && !liveSectionIds.has(task.sectionId)));
  }, [sections, state.tasks]);

  const detailsSiblings = detailsTask
    ? (tasksBySection.get(detailsTask.sectionId) ?? [])
    : [];
  const detailsIndex = detailsTask
    ? detailsSiblings.findIndex((task) => task.id === detailsTask.id)
    : -1;

  useEffect(() => () => window.clearTimeout(undoTimerRef.current), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function pushUndo(action: UndoAction) {
    window.clearTimeout(undoTimerRef.current);
    setUndo(action);
    undoTimerRef.current = window.setTimeout(() => setUndo(null), 6000);
  }

  function dismissUndo() {
    window.clearTimeout(undoTimerRef.current);
    setUndo(null);
  }

  function applyUndo() {
    if (!undo) return;
    if (undo.sectionId) restoreSection(undo.sectionId, undo.taskIds);
    else restoreTasks(undo.taskIds);
    dismissUndo();
  }

  function handleDeleteTask(task: Task) {
    deleteTask(task.id);
    pushUndo({ label: `Deleted “${task.title || 'Untitled task'}”`, taskIds: [task.id] });
  }

  function handleDeleteSection(section: Section) {
    const affected = (tasksBySection.get(section.id) ?? []).map((task) => task.id);
    deleteSection(section.id);
    pushUndo({
      label: `Deleted “${section.title || 'Untitled section'}”${affected.length ? ` and ${affected.length} ${affected.length === 1 ? 'task' : 'tasks'}` : ''}`,
      sectionId: section.id,
      taskIds: affected,
    });
  }

  function handleClearCompleted(section: Section) {
    const cleared = (tasksBySection.get(section.id) ?? []).filter((task) => task.done).map((task) => task.id);
    if (!cleared.length) return;
    clearCompleted(section.id);
    pushUndo({ label: `Cleared ${cleared.length} completed ${cleared.length === 1 ? 'task' : 'tasks'}`, taskIds: cleared });
  }

  function cyclePriority(task: Task) {
    updateTask(task.id, { priority: task.priority ? NEXT_PRIORITY[task.priority] : 'high' });
  }

  function submitQuickAdd(raw: string) {
    const parsed = parseQuickAdd(raw);
    if (!parsed.title.trim()) return;
    const extras = { due: parsed.due, priority: parsed.priority };
    if (parsed.sectionQuery) {
      const target = matchSection(sections, parsed.sectionQuery);
      if (target) addTask(target.id, parsed.title, extras);
      else addTaskToNewSection(capitalizeSectionTitle(parsed.sectionQuery), parsed.title, extras);
      return;
    }
    if (sections.length) addTask(sections[0].id, parsed.title, extras);
    else addTaskToNewSection(DEFAULT_SECTION_TITLE, parsed.title, extras);
  }

  function moveTaskStep(task: Task, direction: -1 | 1) {
    const siblings = tasksBySection.get(task.sectionId) ?? [];
    const index = siblings.findIndex((item) => item.id === task.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const beforeTaskId = direction === -1
      ? siblings[targetIndex].id
      : siblings[targetIndex + 1]?.id ?? null;
    moveTask(task.id, task.sectionId, beforeTaskId);
  }

  function endDrag() {
    setDraggingTaskId(null);
    setDropTarget(null);
    setArmedTaskId(null);
  }

  function onDropAt(target: DropTarget) {
    if (draggingTaskId) moveTask(draggingTaskId, target.sectionId, target.beforeTaskId);
    endDrag();
  }

  function taskRow(task: Task, section: Section | null, visible: Task[]) {
    const draggable = section !== null && !filterActive;
    const isDropBefore = draggable && dropTarget?.sectionId === section.id && dropTarget.beforeTaskId === task.id;
    return (
      <li
        key={task.id}
        className={`task-row${task.done ? ' is-done' : ''}${draggingTaskId === task.id ? ' is-dragging' : ''}${isDropBefore ? ' drop-before' : ''}`}
        draggable={draggable && armedTaskId === task.id}
        onDragStart={(event) => {
          if (!draggable) return;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', task.id);
          setDraggingTaskId(task.id);
        }}
        onDragEnd={endDrag}
        onDragOver={(event) => {
          if (!draggable || !draggingTaskId || draggingTaskId === task.id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          const before = event.clientY < rect.top + rect.height / 2;
          // Resolve neighbours against the VISIBLE sequence (open before done,
          // completed possibly hidden) so the indicator matches the drop.
          const index = visible.findIndex((item) => item.id === task.id);
          const beforeTaskId = before ? task.id : visible[index + 1]?.id ?? null;
          setDropTarget({ sectionId: section.id, beforeTaskId });
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dropTarget) onDropAt(dropTarget);
        }}
      >
        {draggable && (
          <span
            className="task-grip"
            aria-hidden="true"
            onPointerDown={() => setArmedTaskId(task.id)}
            onPointerUp={() => { if (!draggingTaskId) setArmedTaskId(null); }}
          >
            <GripVertical />
          </span>
        )}
        <button
          type="button"
          className="task-checkbox"
          role="checkbox"
          aria-checked={task.done}
          aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title || 'untitled task'}`}
          onClick={() => toggleTask(task.id)}
        >
          <Check aria-hidden="true" />
        </button>
        <InlineText
          value={task.title}
          onCommit={(title) => updateTask(task.id, { title })}
          placeholder="Untitled task"
          ariaLabel={`Task title: ${task.title || 'untitled'}`}
          className="task-title"
        />
        {task.priority && (
          <button
            type="button"
            className={`priority-flag priority-${task.priority}`}
            title={`Priority: ${PRIORITY_LABELS[task.priority]} — click to change`}
            aria-label={`Priority ${PRIORITY_LABELS[task.priority]} for ${task.title || 'untitled task'}. Click to change.`}
            onClick={() => cyclePriority(task)}
          >
            <Flag aria-hidden="true" />
          </button>
        )}
        {task.due && (
          <span className={`due-chip${!task.done && isOverdueKey(task.due) ? ' due-chip-overdue' : ''}`}>
            {formatDueKey(task.due)}
          </span>
        )}
        {task.notes && <span className="task-note-flag" title="Has notes" aria-label="Has notes"><NotebookPen aria-hidden="true" /></span>}
        <span className="task-actions">
          {!task.priority && (
            <button
              type="button"
              className="icon-button icon-button-quiet"
              aria-label={`Set priority for ${task.title || 'untitled task'}`}
              title="Set priority"
              onClick={() => cyclePriority(task)}
            >
              <Flag aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="icon-button icon-button-quiet"
            aria-label={`Open details for ${task.title || 'untitled task'}`}
            title="Details"
            onClick={() => setDetailsTaskId(task.id)}
          >
            <NotebookPen aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button icon-button-quiet"
            aria-label={`Delete ${task.title || 'untitled task'}`}
            title="Delete"
            onClick={() => handleDeleteTask(task)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </span>
      </li>
    );
  }

  const visibleOrphans = orphanTasks.filter(matchesView).filter((task) => !(hideCompleted && task.done));
  let anyVisible = visibleOrphans.length > 0;

  const sectionCards = sections.map((section, sectionIndex) => {
    const tasks = tasksBySection.get(section.id) ?? [];
    const matching = tasks.filter(matchesView);
    const openTasks = matching.filter((task) => !task.done);
    const doneTasks = matching.filter((task) => task.done);
    const visibleTasks = hideCompleted ? openTasks : [...openTasks, ...doneTasks];
    if (filterActive && visibleTasks.length === 0) return null;
    anyVisible = anyVisible || visibleTasks.length > 0 || !filterActive;
    const isEndDropTarget = dropTarget?.sectionId === section.id && dropTarget.beforeTaskId === null;
    const showBody = filterActive || !section.collapsed;

    return (
      <section className="todo-section" key={section.id} style={accentStyle(section.color)}>
        <header className="todo-section-header">
          <button
            type="button"
            className={`collapse-toggle${section.collapsed && !filterActive ? '' : ' is-open'}`}
            onClick={() => toggleSectionCollapsed(section.id)}
            aria-expanded={showBody}
            aria-label={`${showBody ? 'Collapse' : 'Expand'} ${section.title || 'untitled section'}`}
            disabled={filterActive}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <span className="section-dot" aria-hidden="true" />
          <InlineText
            value={section.title}
            onCommit={(title) => renameSection(section.id, title)}
            placeholder="Untitled section"
            ariaLabel={`Section title: ${section.title || 'untitled'}`}
            className="section-title"
          />
          <span className="section-count">
            {openTasks.length ? `${openTasks.length} open` : matching.length ? 'done' : 'empty'}
          </span>
          <SectionMenu
            section={section}
            isFirst={sectionIndex === 0}
            isLast={sectionIndex === sections.length - 1}
            hasCompleted={tasks.some((task) => task.done)}
            moveSection={moveSection}
            setSectionColor={setSectionColor}
            onClearCompleted={() => handleClearCompleted(section)}
            onDelete={() => handleDeleteSection(section)}
          />
        </header>

        {showBody && (
          <div
            className={`todo-section-body${isEndDropTarget ? ' drop-end' : ''}`}
            onDragOver={(event) => {
              if (!draggingTaskId) return;
              if ((event.target as HTMLElement).closest('.task-row')) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTarget({ sectionId: section.id, beforeTaskId: null });
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dropTarget) onDropAt(dropTarget);
            }}
          >
            {visibleTasks.length > 0 && (
              <ul className="task-list">
                {visibleTasks.map((task) => taskRow(task, section, visibleTasks))}
              </ul>
            )}
            {visibleTasks.length === 0 && matching.length > 0 && hideCompleted && (
              <p className="todo-section-note">All {matching.length} tasks here are completed and hidden.</p>
            )}
            {!filterActive && (
              <div className="add-task-row">
                <AddTaskInput onAdd={(title) => addTask(section.id, title)} sectionTitle={section.title} />
              </div>
            )}
          </div>
        )}
      </section>
    );
  });

  return (
    <section className="view todo-view">
      <header className="todo-header">
        <div className="todo-header-text">
          <span className="eyebrow">{formatFullDate(new Date())}</span>
          <h1 tabIndex={-1}>To-Do</h1>
        </div>
        <div className="todo-progress" aria-label={`${doneCount} of ${liveTasks.length} tasks done`}>
          <span>{openCount} open · {doneCount} done</span>
          <div className="progress-track" aria-hidden="true">
            <i style={{ width: liveTasks.length ? `${Math.round((doneCount / liveTasks.length) * 100)}%` : '0%' }} />
          </div>
        </div>
      </header>

      <QuickAdd sections={sections} onSubmit={submitQuickAdd} />

      <div className="todo-toolbar">
        <div className="filter-chips" role="group" aria-label="Filter tasks">
          {(Object.keys(FILTER_LABELS) as TaskFilter[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`filter-chip${filter === id ? ' selected' : ''}`}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {FILTER_LABELS[id]}
              {filterCounts[id] > 0 && <span className="filter-count">{filterCounts[id]}</span>}
            </button>
          ))}
        </div>
        <div className="toolbar-tools">
          <div className="search-box">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search"
              aria-label="Search tasks (shortcut: /)"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setQuery('');
                  event.currentTarget.blur();
                }
              }}
            />
            {query && (
              <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                <X aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            className="icon-button"
            title={hideCompleted ? 'Show completed' : 'Hide completed'}
            aria-label={hideCompleted ? 'Show completed tasks' : 'Hide completed tasks'}
            aria-pressed={hideCompleted}
            onClick={() => updateSettings({ hideCompleted: !hideCompleted })}
          >
            {hideCompleted ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="icon-button"
            title="New section"
            aria-label="New section"
            onClick={() => addSection('New section')}
          >
            <FolderPlus aria-hidden="true" />
          </button>
        </div>
      </div>

      {sections.length === 0 && orphanTasks.length === 0 && (
        <div className="panel todo-empty-panel">
          <ListTodo aria-hidden="true" />
          <h3>A clean slate</h3>
          <p>Type in the bar above to add your first task — it lands in an “{DEFAULT_SECTION_TITLE}” section automatically. Sections keep classes, projects, and errands apart.</p>
        </div>
      )}

      <div className="todo-sections">
        {sectionCards}

        {visibleOrphans.length > 0 && (
          <section className="todo-section todo-section-recovered">
            <header className="todo-section-header">
              <span className="section-dot" aria-hidden="true" />
              <h2 className="section-title-static">Recovered tasks</h2>
              <span className="section-count">{visibleOrphans.length} stranded</span>
            </header>
            <div className="todo-section-body">
              <p className="todo-section-note">
                These tasks belonged to a section that was deleted on another device.
                Reassign them from task details, or delete them.
              </p>
              <ul className="task-list">
                {visibleOrphans.map((task) => taskRow(task, null, visibleOrphans))}
              </ul>
            </div>
          </section>
        )}

        {filterActive && !anyVisible && sections.length > 0 && (
          <div className="panel">
            <EmptyState
              icon={<Search />}
              title="No matching tasks"
              copy={trimmedQuery ? `Nothing ${filter === 'all' ? '' : `in ${FILTER_LABELS[filter]} `}matches “${query.trim()}”.` : `Nothing is ${filter === 'today' ? 'due today or overdue' : 'due later'}. Add a due date with @today or @tomorrow.`}
              action={(
                <button type="button" className="button button-secondary" onClick={() => { setFilter('all'); setQuery(''); }}>
                  Clear filters
                </button>
              )}
            />
          </div>
        )}
      </div>

      {detailsTask && (
        <TaskDetailsModal
          task={detailsTask}
          sections={sections}
          onClose={() => setDetailsTaskId(null)}
          updateTask={updateTask}
          toggleTask={toggleTask}
          onDelete={() => handleDeleteTask(detailsTask)}
          moveStep={(direction) => moveTaskStep(detailsTask, direction)}
          canMoveUp={detailsIndex > 0}
          canMoveDown={detailsIndex >= 0 && detailsIndex < detailsSiblings.length - 1}
        />
      )}

      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          <button type="button" className="undo-toast-action" onClick={applyUndo}>
            <Undo2 aria-hidden="true" /> Undo
          </button>
          <button type="button" className="icon-button icon-button-quiet" aria-label="Dismiss" onClick={dismissUndo}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

function AddTaskInput({ onAdd, sectionTitle }: { onAdd: (title: string) => void; sectionTitle: string }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  function commit(keepFocus: boolean) {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft('');
      return;
    }
    const trimmed = draft.trim();
    if (trimmed) onAdd(trimmed);
    setDraft('');
    if (keepFocus) inputRef.current?.focus();
  }

  return (
    <>
      <Plus aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder="Add here"
        aria-label={`New task in ${sectionTitle || 'untitled section'}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(true);
          }
          if (event.key === 'Escape') {
            cancelledRef.current = true;
            setDraft('');
            inputRef.current?.blur();
          }
        }}
        maxLength={200}
      />
    </>
  );
}
