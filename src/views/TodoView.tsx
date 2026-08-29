import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Eraser,
  Flag,
  FolderPlus,
  ListTodo,
  MoreHorizontal,
  Plus,
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
  deleteTask: SlateStore['deleteTask'];
  restoreTasks: SlateStore['restoreTasks'];
}

type TaskFilter = 'all' | 'today';

const FILTER_LABELS: Record<TaskFilter, string> = {
  all: 'All',
  today: 'Today',
};

interface UndoAction {
  label: string;
  undo?: () => void;
}

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

function QuickAdd({ onSubmit, onCancel }: {
  onSubmit: (raw: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasText = draft.trim().length > 0;

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
          aria-label="Add a task"
          maxLength={400}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape' && hasText) {
              setDraft('');
              onCancel();
            }
          }}
        />
        {hasText && (
          <button type="button" className="quick-add-submit" onClick={submit}>
            Add
          </button>
        )}
      </div>
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

function TaskDetailsModal({ task, sections, onClose, onCancel, updateTask, toggleTask, onDelete }: {
  task: Task;
  sections: Section[];
  onClose: () => void;
  onCancel: () => void;
  updateTask: SlateStore['updateTask'];
  toggleTask: SlateStore['toggleTask'];
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [due, setDue] = useState(task.due ?? '');
  const [sectionId, setSectionId] = useState(task.sectionId);
  const [priority, setPriority] = useState<TaskPriority | undefined>(task.priority);
  const [done, setDone] = useState(task.done);

  function cancel() {
    onCancel();
    onClose();
  }

  function save() {
    const nextTitle = title.trim() || task.title;
    const patch: Partial<Pick<Task, 'title' | 'notes' | 'due' | 'priority' | 'sectionId'>> = {};
    if (nextTitle !== task.title) patch.title = nextTitle;
    if (notes !== task.notes) patch.notes = notes;
    if (due !== (task.due ?? '')) patch.due = due || undefined;
    if (sectionId !== task.sectionId) patch.sectionId = sectionId;
    if (priority !== task.priority) patch.priority = priority;
    if (Object.keys(patch).length) updateTask(task.id, patch);
    if (done !== task.done) toggleTask(task.id);
    onClose();
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
      onClose={cancel}
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
          <button type="button" className="button button-secondary" onClick={cancel}>Cancel</button>
          <button type="button" className="button button-primary" onClick={save}>Save</button>
        </div>
      )}
    >
      <div className="task-details">
        <label className={`task-details-check${done ? ' is-done' : ''}`}>
          <input type="checkbox" checked={done} onChange={() => setDone((current) => !current)} />
          <span>{done ? 'Completed' : 'Mark complete'}</span>
        </label>

        <label className="field">
          <span className="field-label">Title</span>
          <input
            type="text"
            value={title}
            aria-label="Task title"
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Due date</span>
            <input
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Section</span>
            <select
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
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
                aria-checked={priority === value}
                className={`priority-option${priority === value ? ' selected' : ''}${value ? ` priority-${value}` : ''}`}
                onClick={() => setPriority(value)}
              >
                {value && <Flag aria-hidden="true" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            rows={5}
            value={notes}
            placeholder="Links, subtasks, context…"
            onChange={(event) => setNotes(event.target.value)}
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
  deleteTask,
  restoreTasks,
}: TodoViewProps) {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<number>();

  const filterActive = filter !== 'all';
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

  const liveTasks = useMemo(() => state.tasks.filter((task) => !task.deleted), [state.tasks]);
  const openCount = liveTasks.reduce((count, task) => count + (task.done ? 0 : 1), 0);
  const doneCount = liveTasks.length - openCount;
  const filterCounts: Record<TaskFilter, number> = useMemo(() => {
    const open = liveTasks.filter((task) => !task.done);
    return {
      all: open.length,
      today: open.filter((task) => task.due && task.due <= todayKey).length,
    };
  }, [liveTasks, todayKey]);

  const matchesView = useMemo(() => {
    return (task: Task) => {
      if (filter === 'today' && !(task.due && task.due <= todayKey)) return false;
      return true;
    };
  }, [filter, todayKey]);

  const detailsTask = detailsTaskId
    ? state.tasks.find((task) => task.id === detailsTaskId && !task.deleted) ?? null
    : null;
  // A concurrent delete-section on another device can strand live tasks whose
  // section is now a tombstone; surface them instead of hiding them forever.
  const orphanTasks = useMemo(() => {
    const liveSectionIds = new Set(sections.map((section) => section.id));
    return sortByOrder(state.tasks.filter((task) => !task.deleted && !liveSectionIds.has(task.sectionId)));
  }, [sections, state.tasks]);

  useEffect(() => () => window.clearTimeout(undoTimerRef.current), []);

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
    if (!undo?.undo) return;
    undo.undo();
    dismissUndo();
  }

  function showNotice(label: string) {
    pushUndo({ label });
  }

  function handleDeleteTask(task: Task) {
    deleteTask(task.id);
    pushUndo({ label: `Deleted “${task.title || 'Untitled task'}”`, undo: () => restoreTasks([task.id]) });
  }

  function handleDeleteSection(section: Section) {
    const affected = (tasksBySection.get(section.id) ?? []).map((task) => task.id);
    deleteSection(section.id);
    pushUndo({
      label: `Deleted “${section.title || 'Untitled section'}”${affected.length ? ` and ${affected.length} ${affected.length === 1 ? 'task' : 'tasks'}` : ''}`,
      undo: () => restoreSection(section.id, affected),
    });
  }

  function handleClearCompleted(section: Section) {
    const cleared = (tasksBySection.get(section.id) ?? []).filter((task) => task.done).map((task) => task.id);
    if (!cleared.length) return;
    clearCompleted(section.id);
    pushUndo({ label: `Cleared ${cleared.length} completed ${cleared.length === 1 ? 'task' : 'tasks'}`, undo: () => restoreTasks(cleared) });
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

  function taskRow(task: Task) {
    return (
      <li
        key={task.id}
        className={`task-row${task.done ? ' is-done' : ''}`}
      >
        <div className="task-row-content">
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
          {task.due && (
            <span className={`due-chip${!task.done && isOverdueKey(task.due) ? ' due-chip-overdue' : ''}`}>
              {formatDueKey(task.due)}
            </span>
          )}
          <button
            type="button"
            className="task-details-button"
            aria-label={`Open details for ${task.title || 'untitled task'}`}
            onClick={() => setDetailsTaskId(task.id)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </li>
    );
  }

  const visibleOrphans = orphanTasks.filter(matchesView);
  let anyVisible = visibleOrphans.length > 0;

  const sectionCards = sections.map((section, sectionIndex) => {
    const tasks = tasksBySection.get(section.id) ?? [];
    const matching = tasks.filter(matchesView);
    const openTasks = matching.filter((task) => !task.done);
    const doneTasks = matching.filter((task) => task.done);
    const visibleTasks = [...openTasks, ...doneTasks];
    if (filterActive && visibleTasks.length === 0) return null;
    anyVisible = anyVisible || visibleTasks.length > 0 || !filterActive;
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
          <div className="todo-section-body">
            {visibleTasks.length > 0 && (
              <ul className="task-list">
                {visibleTasks.map(taskRow)}
              </ul>
            )}
            {!filterActive && (
              <div className="add-task-row">
                <AddTaskInput
                  onAdd={(title) => addTask(section.id, title)}
                  onCancel={() => showNotice('Task entry cleared')}
                  sectionTitle={section.title}
                />
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

      <QuickAdd onSubmit={submitQuickAdd} onCancel={() => showNotice('Task entry cleared')} />

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

      {/* Nothing stored yet reads as empty, not as somebody's list: the panel
          replaces the example tasks a first visit used to be seeded with. */}
      {liveTasks.length === 0 && orphanTasks.length === 0 && (
        <div className="panel todo-empty-panel">
          <ListTodo aria-hidden="true" />
          <h3>A clean slate</h3>
          <p>Add one task above to get started.</p>
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
                {visibleOrphans.map(taskRow)}
              </ul>
            </div>
          </section>
        )}

        {filterActive && !anyVisible && sections.length > 0 && (
          <div className="panel">
            <EmptyState
              icon={<ListTodo />}
              title="Nothing due today"
              copy="Open a task to set a due date, or add a new task when you are ready."
              action={(
                <button type="button" className="button button-secondary" onClick={() => setFilter('all')}>
                  Show all tasks
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
          onCancel={() => showNotice('No changes were saved')}
          updateTask={updateTask}
          toggleTask={toggleTask}
          onDelete={() => handleDeleteTask(detailsTask)}
        />
      )}

      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          {undo.undo && (
            <button type="button" className="undo-toast-action" onClick={applyUndo}>
              <Undo2 aria-hidden="true" /> Undo
            </button>
          )}
          <button type="button" className="icon-button icon-button-quiet" aria-label="Dismiss" onClick={dismissUndo}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

function AddTaskInput({ onAdd, onCancel, sectionTitle }: {
  onAdd: (title: string) => void;
  onCancel: () => void;
  sectionTitle: string;
}) {
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
            if (draft.trim()) onCancel();
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
