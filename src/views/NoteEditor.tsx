import { Check, ChevronLeft, CircleCheck, Ellipsis, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { resolveDropFromPoint, sameDropTarget, type DropTarget } from '../drop-target';
import { STARTER_INBOX_ID, type Section, type Task } from '../model';
import { sortByOrder } from '../order';
import type { SlateStore } from '../store';

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function NoteEditor({
  section,
  tasks,
  hideCompleted,
  renameSection,
  addTask,
  updateTask,
  toggleTask,
  moveTask,
  deleteTask,
  restoreTasks,
  deleteSection,
  restoreSection,
  clearCompleted,
  onBack,
}: {
  section: Section;
  tasks: Task[];
  hideCompleted: boolean;
  renameSection: SlateStore['renameSection'];
  addTask: SlateStore['addTask'];
  updateTask: SlateStore['updateTask'];
  toggleTask: SlateStore['toggleTask'];
  moveTask: SlateStore['moveTask'];
  deleteTask: SlateStore['deleteTask'];
  restoreTasks: SlateStore['restoreTasks'];
  deleteSection: SlateStore['deleteSection'];
  restoreSection: SlateStore['restoreSection'];
  clearCompleted: SlateStore['clearCompleted'];
  onBack: () => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [undo, setUndo] = useState<{ label: string; undo?: () => void } | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const undoTimerRef = useRef<number>();
  const dragTaskIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const finishDragRef = useRef<(apply: boolean) => void>(() => {});
  const pressRef = useRef<{ x: number; y: number; taskId: string } | null>(null);
  const draggedRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const live = useMemo(
    () => sortByOrder(tasks.filter((task) => task.sectionId === section.id && !task.deleted)),
    [section.id, tasks],
  );
  const openTasks = live.filter((task) => !task.done);
  const doneTasks = live.filter((task) => task.done);
  const visible = hideCompleted ? openTasks : [...openTasks, ...doneTasks];
  const stamp = live.reduce((latest, task) => (task.updatedAt > latest ? task.updatedAt : latest), section.updatedAt);
  const canDeleteNote = section.id !== STARTER_INBOX_ID;

  useEffect(() => {
    setTitle(section.title);
  }, [section.id, section.title]);

  useEffect(() => () => window.clearTimeout(undoTimerRef.current), []);

  useEffect(() => {
    if (!focusId) return;
    const input = document.querySelector<HTMLInputElement>(`input[data-task-id="${focusId}"]`);
    input?.focus();
    setFocusId(null);
  }, [focusId, visible.length]);

  finishDragRef.current = (apply: boolean) => {
    const taskId = dragTaskIdRef.current;
    const target = dropTargetRef.current;
    dragTaskIdRef.current = null;
    dropTargetRef.current = null;
    pressRef.current = null;
    setDragTaskId(null);
    setDropTarget(null);
    document.body.classList.remove('is-dragging-task');
    document.querySelectorAll('.check-row.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
    if (apply && taskId && target) moveTask(taskId, target.sectionId, target.beforeTaskId);
  };

  function onCirclePointerDown(event: ReactPointerEvent<HTMLButtonElement>, taskId: string) {
    if (event.button !== 0) return;
    draggedRef.current = false;
    const originX = event.clientX;
    const originY = event.clientY;
    pressRef.current = { x: originX, y: originY, taskId };
    const row = event.currentTarget.closest('.check-row');

    function onMove(pointer: PointerEvent) {
      if (!pressRef.current) return;
      if (!dragTaskIdRef.current) {
        if (Math.hypot(pointer.clientX - originX, pointer.clientY - originY) < 6) return;
        draggedRef.current = true;
        dragTaskIdRef.current = taskId;
        row?.classList.add('is-dragging');
        document.body.classList.add('is-dragging-task');
        setDragTaskId(taskId);
      }
      const next = resolveDropFromPoint(pointer.clientX, pointer.clientY, taskId);
      dropTargetRef.current = next;
      setDropTarget((current) => (sameDropTarget(current, next) ? current : next));
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      finishDragRef.current(true);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function pushUndo(label: string, undoAction?: () => void) {
    window.clearTimeout(undoTimerRef.current);
    setUndo({ label, undo: undoAction });
    undoTimerRef.current = window.setTimeout(() => setUndo(null), 5000);
  }

  function commitTitle() {
    const next = title.trim() || section.title || 'New Note';
    setTitle(next);
    if (next !== section.title) renameSection(section.id, next);
  }

  function handleToggle(task: Task) {
    toggleTask(task.id);
    if (!task.done) {
      moveTask(task.id, section.id, null);
    } else {
      const firstDone = doneTasks.find((item) => item.id !== task.id);
      moveTask(task.id, section.id, firstDone?.id ?? null);
    }
  }

  function handleReturn(task: Task) {
    if (!task.title.trim() && live[live.length - 1]?.id === task.id) return;
    const id = addTask(section.id, '', { afterTaskId: task.id });
    if (id) setFocusId(id);
  }

  function handleBackspace(task: Task, event: KeyboardEvent<HTMLInputElement>) {
    if (task.title.length > 0 || event.currentTarget.selectionStart !== 0) return;
    if (live.length <= 1) return;
    event.preventDefault();
    const index = live.findIndex((item) => item.id === task.id);
    const previous = live[index - 1];
    deleteTask(task.id);
    if (previous) setFocusId(previous.id);
  }

  function handleDeleteNote() {
    const affected = live.map((task) => task.id);
    deleteSection(section.id);
    onBack();
    pushUndo(`Deleted “${section.title || 'New Note'}”`, () => restoreSection(section.id, affected));
  }

  const droppingAtEnd = dropTarget?.sectionId === section.id && dropTarget.beforeTaskId === null;

  return (
    <section className="note-editor">
      <header className="note-nav">
        <button type="button" className="notes-back" onClick={() => { commitTitle(); onBack(); }}>
          <ChevronLeft aria-hidden="true" /> Notes
        </button>
        <div className="note-menu">
          <button
            type="button"
            className="icon-button"
            aria-label="Note actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Ellipsis aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="note-menu-popover">
              <button
                type="button"
                className="note-menu-item"
                disabled={doneTasks.length === 0}
                onClick={() => {
                  clearCompleted(section.id);
                  setMenuOpen(false);
                  pushUndo('Cleared checked items', () => restoreTasks(doneTasks.map((task) => task.id)));
                }}
              >
                Clear Checked
              </button>
              {canDeleteNote && (
                <button
                  type="button"
                  className="note-menu-item note-menu-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    handleDeleteNote();
                  }}
                >
                  <Trash2 aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="note-body">
        <p className="note-stamp">{formatStamp(stamp)}</p>
        <input
        ref={titleRef}
        className="note-title"
        value={title}
        placeholder="New Note"
        aria-label="Note title"
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitTitle();
            if (visible[0]) setFocusId(visible[0].id);
            else {
              const id = addTask(section.id, '');
              if (id) setFocusId(id);
            }
          }
        }}
      />

      <ul
        className={`checklist${droppingAtEnd ? ' drop-end' : ''}`}
        data-drop-section={section.id}
      >
        {visible.length === 0 && (
          <li className="notes-empty" style={{ paddingTop: 12 }}>Tap the checklist button to start a list.</li>
        )}
        {visible.map((task) => {
          const droppingBefore = dropTarget?.beforeTaskId === task.id;
          return (
            <li
              key={task.id}
              data-drop-task={task.id}
              className={`check-row${task.done ? ' is-done' : ''}${dragTaskId === task.id ? ' is-dragging' : ''}${droppingBefore ? ' drop-before' : ''}`}
            >
              <button
                type="button"
                className="check-circle"
                role="checkbox"
                aria-checked={task.done}
                aria-label={task.done ? 'Mark as not completed' : 'Mark as completed'}
                onPointerDown={(event) => onCirclePointerDown(event, task.id)}
                onClick={() => {
                  if (draggedRef.current) return;
                  handleToggle(task);
                }}
              >
                <Check aria-hidden="true" />
              </button>
              <input
                className="check-input"
                data-task-id={task.id}
                value={task.title}
                placeholder="List item"
                aria-label="Checklist item"
                maxLength={400}
                onChange={(event) => updateTask(task.id, { title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleReturn(task);
                  }
                  if (event.key === 'Backspace') handleBackspace(task, event);
                }}
              />
            </li>
          );
        })}
      </ul>
      </div>

      <footer className="note-toolbar">
        <button
          type="button"
          className="checklist-tool"
          aria-label="Add checklist item"
          onClick={() => {
            const last = openTasks[openTasks.length - 1] ?? live[live.length - 1];
            const id = addTask(section.id, '', last ? { afterTaskId: last.id } : undefined);
            if (id) setFocusId(id);
          }}
        >
          <CircleCheck aria-hidden="true" />
        </button>
        <span />
      </footer>

      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          {undo.undo && (
            <button
              type="button"
              className="undo-toast-action"
              onClick={() => {
                undo.undo?.();
                setUndo(null);
              }}
            >
              <Undo2 aria-hidden="true" /> Undo
            </button>
          )}
          <button type="button" className="icon-button icon-button-muted" aria-label="Dismiss" onClick={() => setUndo(null)}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
