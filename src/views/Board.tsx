import {
  Check,
  Ellipsis,
  GripVertical,
  Pause,
  Play,
  Plus,
  SkipForward,
  Timer,
  Undo2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { SLATE_COLORS, SLATE_COLOR_NAMES, STARTER_INBOX_ID, type Section, type Task } from '../model';
import { sortByOrder } from '../order';
import { formatRemaining } from '../pomodoro';
import type { SlateStore } from '../store';
import { useCompletion } from '../useCompletion';
import { useTaskDrag } from '../useTaskDrag';
import type { usePomodoro } from '../usePomodoro';

const TITLE_COMMIT_DELAY_MS = 300;

type Pomodoro = ReturnType<typeof usePomodoro>;

const PHASE_LABELS = {
  focus: 'Focus',
  'short-break': 'Short break',
  'long-break': 'Long break',
} as const;

export function Board({
  sections,
  tasks,
  settings,
  pomodoro,
  renameSection,
  setSectionColor,
  toggleSectionCollapsed,
  deleteSection,
  restoreSection,
  clearCompleted,
  addTask,
  updateTask,
  toggleTask,
  moveTask,
  deleteTask,
  restoreTasks,
}: {
  sections: Section[];
  tasks: Task[];
  settings: { hideCompleted: boolean };
  pomodoro: Pomodoro;
  renameSection: SlateStore['renameSection'];
  setSectionColor: SlateStore['setSectionColor'];
  toggleSectionCollapsed: SlateStore['toggleSectionCollapsed'];
  deleteSection: SlateStore['deleteSection'];
  restoreSection: SlateStore['restoreSection'];
  clearCompleted: SlateStore['clearCompleted'];
  addTask: SlateStore['addTask'];
  updateTask: SlateStore['updateTask'];
  toggleTask: SlateStore['toggleTask'];
  moveTask: SlateStore['moveTask'];
  deleteTask: SlateStore['deleteTask'];
  restoreTasks: SlateStore['restoreTasks'];
}) {
  const [query, setQuery] = useState('');
  const [undo, setUndo] = useState<{ label: string; undo: () => void } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const undoTimerRef = useRef<number>();

  // The completion module settles a toggle only after its animation ends, so
  // the row reflows into the done group after the sequence rather than during
  // it. When done flips true the task also moves to the end of its list; when
  // it flips false it moves ahead of the first done task.
  const settle = useCallback(
    (taskId: string, nowDone: boolean) => {
      toggleTask(taskId);
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      const sectionId = task.sectionId;
      if (nowDone) {
        moveTask(taskId, sectionId, null);
      } else {
        const firstDone = sortByOrder(
          tasks.filter((item) => item.sectionId === sectionId && item.done && !item.deleted && item.id !== taskId),
        )[0];
        moveTask(taskId, sectionId, firstDone ? firstDone.id : null);
      }
    },
    [tasks, toggleTask, moveTask],
  );

  const completion = useCompletion(settle);
  const drag = useTaskDrag(moveTask);

  useEffect(() => () => window.clearTimeout(undoTimerRef.current), []);

  // Focus a row created this render (Enter / Backspace flows): the row does not
  // exist when addTask returns, so we stash its id and focus it in an effect.
  useEffect(() => {
    if (!focusId) return;
    const input = document.querySelector<HTMLInputElement>(`input.task-text[data-task-id="${focusId}"]`);
    if (input) {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    setFocusId(null);
  }, [focusId, tasks]);

  const pushUndo = useCallback((label: string, undoAction: () => void) => {
    window.clearTimeout(undoTimerRef.current);
    setUndo({ label, undo: undoAction });
    undoTimerRef.current = window.setTimeout(() => setUndo(null), 5000);
  }, []);

  const needle = query.trim().toLowerCase();

  const liveSections = useMemo(
    () => sortByOrder(sections.filter((section) => !section.deleted)),
    [sections],
  );
  const liveTasks = useMemo(() => tasks.filter((task) => !task.deleted), [tasks]);
  const liveSectionIds = useMemo(
    () => new Set(liveSections.map((section) => section.id)),
    [liveSections],
  );

  function tasksForSection(sectionId: string): Task[] {
    const owned = sortByOrder(liveTasks.filter((task) => task.sectionId === sectionId));
    const open = owned.filter((task) => !task.done);
    const done = owned.filter((task) => task.done);
    const ordered = settings.hideCompleted ? open : [...open, ...done];
    if (!needle) return ordered;
    return ordered.filter((task) => task.title.toLowerCase().includes(needle));
  }

  // Orphan tasks: live tasks whose section is gone (tombstoned elsewhere). They
  // are unreachable otherwise, so they render in a trailing recovered list.
  const orphans = useMemo(() => {
    const found = sortByOrder(liveTasks.filter((task) => !liveSectionIds.has(task.sectionId)));
    if (!needle) return found;
    return found.filter((task) => task.title.toLowerCase().includes(needle));
  }, [liveTasks, liveSectionIds, needle]);

  const visibleSections = liveSections.filter((section) => {
    if (!needle) return true;
    return tasksForSection(section.id).length > 0;
  });

  const runtime = pomodoro.runtime;
  const timerTask = runtime ? tasks.find((task) => task.id === runtime.taskId) : undefined;

  const boardIsEmpty =
    visibleSections.every((section) => tasksForSection(section.id).length === 0) && orphans.length === 0;
  const emptyCopy = needle ? 'No matches' : 'Nothing here yet.';

  return (
    <div className="board-inner">
      <label className="board-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={query}
          placeholder="Search tasks"
          aria-label="Search tasks"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="lists">
        {visibleSections.map((section) => (
          <ListCard
            key={section.id}
            section={section}
            tasks={tasksForSection(section.id)}
            drag={drag}
            completion={completion}
            pomodoro={pomodoro}
            renameSection={renameSection}
            setSectionColor={setSectionColor}
            toggleSectionCollapsed={toggleSectionCollapsed}
            deleteSection={deleteSection}
            restoreSection={restoreSection}
            clearCompleted={clearCompleted}
            addTask={addTask}
            updateTask={updateTask}
            deleteTask={deleteTask}
            restoreTasks={restoreTasks}
            pushUndo={pushUndo}
            setFocusId={setFocusId}
            allTasks={tasks}
          />
        ))}

        {orphans.length > 0 && (
          <section className="list is-recovered">
            <header className="list-head">
              <span className="list-dot" aria-hidden="true" />
              <span className="list-title-static">Recovered tasks</span>
              <span className="list-count">{orphans.length}</span>
            </header>
            <p className="list-recovered-note">
              These tasks lost their list on another device. Move them into a list to keep them.
            </p>
            <ul className="task-list">
              {orphans.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  drag={drag}
                  completion={completion}
                  pomodoro={pomodoro}
                  updateTask={updateTask}
                  deleteTask={deleteTask}
                  restoreTasks={restoreTasks}
                  addTask={addTask}
                  pushUndo={pushUndo}
                  setFocusId={setFocusId}
                  siblings={orphans}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {boardIsEmpty && <p className="board-empty">{emptyCopy}</p>}

      {runtime && (
        <div className="timer-bar" role="status">
          <span className="timer-phase">{PHASE_LABELS[runtime.phase]}</span>
          <span className="timer-time">{formatRemaining(pomodoro.remaining)}</span>
          <span className="timer-task">{timerTask?.title.trim() || 'Untitled task'}</span>
          <button
            type="button"
            className="icon-button"
            aria-label={runtime.paused ? 'Resume timer' : 'Pause timer'}
            onClick={() => pomodoro.toggle(runtime.taskId)}
          >
            {runtime.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
          <button type="button" className="icon-button" aria-label="Skip phase" onClick={() => pomodoro.skip()}>
            <SkipForward aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" aria-label="Stop timer" onClick={() => pomodoro.stop()}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          <button
            type="button"
            className="undo-toast-action"
            onClick={() => {
              undo.undo();
              window.clearTimeout(undoTimerRef.current);
              setUndo(null);
            }}
          >
            <Undo2 aria-hidden="true" /> Undo
          </button>
          <button
            type="button"
            className="icon-button icon-button-quiet"
            aria-label="Dismiss"
            onClick={() => {
              window.clearTimeout(undoTimerRef.current);
              setUndo(null);
            }}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

type DragApi = ReturnType<typeof useTaskDrag>;
type CompletionApi = ReturnType<typeof useCompletion>;

function ListCard({
  section,
  tasks,
  drag,
  completion,
  pomodoro,
  renameSection,
  setSectionColor,
  toggleSectionCollapsed,
  deleteSection,
  restoreSection,
  clearCompleted,
  addTask,
  updateTask,
  deleteTask,
  restoreTasks,
  pushUndo,
  setFocusId,
  allTasks,
}: {
  section: Section;
  tasks: Task[];
  drag: DragApi;
  completion: CompletionApi;
  pomodoro: Pomodoro;
  renameSection: SlateStore['renameSection'];
  setSectionColor: SlateStore['setSectionColor'];
  toggleSectionCollapsed: SlateStore['toggleSectionCollapsed'];
  deleteSection: SlateStore['deleteSection'];
  restoreSection: SlateStore['restoreSection'];
  clearCompleted: SlateStore['clearCompleted'];
  addTask: SlateStore['addTask'];
  updateTask: SlateStore['updateTask'];
  deleteTask: SlateStore['deleteTask'];
  restoreTasks: SlateStore['restoreTasks'];
  pushUndo: (label: string, undo: () => void) => void;
  setFocusId: (id: string) => void;
  allTasks: Task[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [addValue, setAddValue] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const canDelete = section.id !== STARTER_INBOX_ID;
  const collapsed = section.collapsed;
  const openCount = tasks.filter((task) => !task.done).length;

  // Never overwrite the title field while it is focused: an incoming sync would
  // wipe what the user is typing.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(section.title);
  }, [section.title]);

  // Popover dismissal: outside pointerdown, Escape, and selection all close the
  // menu and return focus to its trigger.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    menuTriggerRef.current?.focus();
  }

  function commitTitle() {
    const next = title.trim();
    if (next && next !== section.title) renameSection(section.id, next);
    else if (!next) setTitle(section.title);
  }

  function addTaskToList(afterTaskId?: string) {
    const id = addTask(section.id, '', afterTaskId ? { afterTaskId } : undefined);
    if (id) setFocusId(id);
  }

  function handleDeleteList() {
    const taskIds = allTasks.filter((task) => task.sectionId === section.id && !task.deleted).map((task) => task.id);
    deleteSection(section.id);
    pushUndo(`Deleted “${section.title || 'list'}”`, () => restoreSection(section.id, taskIds));
  }

  const doneCount = tasks.filter((task) => task.done).length;
  const firstTaskId = tasks.length > 0 ? tasks[0].id : null;
  const droppingHere = drag.dropTarget?.sectionId === section.id;
  const droppingAtEnd = droppingHere && drag.dropTarget?.beforeTaskId === null && tasks.length > 0;
  // A drop at position 0: before the first row, or onto an empty/collapsed list
  // (which the drop-target module reports as beforeTaskId === null with no rows).
  const droppingAtStart =
    droppingHere &&
    (drag.dropTarget?.beforeTaskId === firstTaskId ||
      ((collapsed || tasks.length === 0) && drag.dropTarget?.beforeTaskId === null));

  return (
    // `data-drop-section` is also mirrored here on the wrapper, not only on
    // `ul.task-list`: `resolveDropFromPoint` resolves a hit to its nearest
    // `[data-drop-section]` ANCESTOR before honouring `data-drop-start`, and the
    // header is a sibling of the task list, so without this a drop onto the
    // header (position 0 / empty / collapsed list) would find no section and be
    // dropped. See the report's deviation note.
    <section className="list" data-drop-section={section.id}>
      <header
        className={`list-head${droppingAtStart ? ' drop-start' : ''}`}
        data-drop-start=""
        onClick={(event) => {
          // Click on the header background toggles collapse; controls stop
          // propagation so they are not swallowed.
          if (event.target === event.currentTarget) toggleSectionCollapsed(section.id);
        }}
      >
        <button
          type="button"
          className="list-dot"
          aria-label="List colour"
          style={{ color: section.color }}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        />
        <input
          ref={titleRef}
          className="list-title"
          data-section-id={section.id}
          value={title}
          placeholder="Untitled list"
          aria-label="List name"
          maxLength={200}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTitle();
              event.currentTarget.blur();
            }
          }}
        />
        <span className="list-count">{openCount}</span>
        <div className="list-actions">
          <button
            type="button"
            className="icon-button icon-button-quiet"
            aria-label={`Add task to ${section.title || 'list'}`}
            onClick={(event) => {
              event.stopPropagation();
              addTaskToList();
            }}
          >
            <Plus aria-hidden="true" />
          </button>
          <div className="list-menu" ref={menuRef}>
            <button
              type="button"
              ref={menuTriggerRef}
              className="icon-button icon-button-quiet"
              aria-label="List actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
            >
              <Ellipsis aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="list-menu-popover" role="menu">
                <div className="list-menu-colors">
                  {SLATE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="list-color-swatch"
                      style={{ color }}
                      aria-label={SLATE_COLOR_NAMES[color] ?? color}
                      aria-pressed={section.color === color}
                      onClick={() => {
                        setSectionColor(section.id, color);
                        closeMenu();
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="list-menu-item"
                  role="menuitem"
                  onClick={() => {
                    toggleSectionCollapsed(section.id);
                    closeMenu();
                  }}
                >
                  {collapsed ? 'Expand' : 'Collapse'}
                </button>
                <button
                  type="button"
                  className="list-menu-item"
                  role="menuitem"
                  disabled={doneCount === 0}
                  onClick={() => {
                    const doneIds = tasks.filter((task) => task.done).map((task) => task.id);
                    clearCompleted(section.id);
                    closeMenu();
                    pushUndo('Cleared checked tasks', () => restoreTasks(doneIds));
                  }}
                >
                  Clear checked
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    className="list-menu-item list-menu-danger"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      handleDeleteList();
                    }}
                  >
                    Delete list
                  </button>
                ) : (
                  <button type="button" className="list-menu-item" role="menuitem" disabled title="The Inbox is a fixed list and cannot be deleted.">
                    Delete list (Inbox is fixed)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {!collapsed && (
        <ul className={`task-list${droppingAtEnd ? ' drop-end' : ''}`} data-drop-section={section.id}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              drag={drag}
              completion={completion}
              pomodoro={pomodoro}
              updateTask={updateTask}
              deleteTask={deleteTask}
              restoreTasks={restoreTasks}
              addTask={addTask}
              pushUndo={pushUndo}
              setFocusId={setFocusId}
              siblings={tasks}
            />
          ))}
          <li className="task-add">
            <button
              type="button"
              aria-label={`Add task to ${section.title || 'list'}`}
              onClick={() => {
                if (addValue.trim()) {
                  addTask(section.id, addValue.trim());
                  setAddValue('');
                } else {
                  addTaskToList();
                }
              }}
            >
              <Plus aria-hidden="true" />
            </button>
            <input
              className="task-add-input"
              value={addValue}
              placeholder="Add a task"
              aria-label={`Add task to ${section.title || 'list'}`}
              maxLength={400}
              onChange={(event) => setAddValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const value = addValue.trim();
                  if (value) {
                    addTask(section.id, value);
                    setAddValue('');
                  }
                }
              }}
            />
          </li>
        </ul>
      )}
    </section>
  );
}

function TaskRow({
  task,
  drag,
  completion,
  pomodoro,
  updateTask,
  deleteTask,
  restoreTasks,
  addTask,
  pushUndo,
  setFocusId,
  siblings,
}: {
  task: Task;
  drag: DragApi;
  completion: CompletionApi;
  pomodoro: Pomodoro;
  updateTask: SlateStore['updateTask'];
  deleteTask: SlateStore['deleteTask'];
  restoreTasks: SlateStore['restoreTasks'];
  addTask: SlateStore['addTask'];
  pushUndo: (label: string, undo: () => void) => void;
  setFocusId: (id: string) => void;
  siblings: Task[];
}) {
  const [text, setText] = useState(task.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const commitTimerRef = useRef<number>();

  // Do not resync the draft from props while the input is focused — an incoming
  // sync would otherwise wipe what the user is typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(task.title);
  }, [task.title]);

  useEffect(() => () => window.clearTimeout(commitTimerRef.current), []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  function scheduleCommit(next: string) {
    window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      if (next !== task.title) updateTask(task.id, { title: next });
    }, TITLE_COMMIT_DELAY_MS);
  }

  function commitNow() {
    window.clearTimeout(commitTimerRef.current);
    if (text !== task.title) updateTask(task.id, { title: text });
  }

  function handleDelete() {
    setMenuOpen(false);
    deleteTask(task.id);
    pushUndo('Deleted task', () => restoreTasks([task.id]));
  }

  const dragging = drag.dragTaskId === task.id;
  const droppingBefore = drag.dropTarget?.beforeTaskId === task.id;
  const animating = completion.isAnimating(task.id);
  const timerRunning = pomodoro.isRunning(task.id);
  const tomatoes = task.pomodoroCompleted ?? 0;

  return (
    <li
      data-drop-task={task.id}
      className={`task-row${task.done ? ' is-done' : ''}${dragging ? ' is-dragging' : ''}${droppingBefore ? ' drop-before' : ''}${animating ? ' is-animating' : ''}`}
      onPointerDown={(event: ReactPointerEvent<HTMLLIElement>) => {
        // A mouse must not begin a press on the row: capturing a mouse pointer
        // here breaks caret placement and text selection in the input. Only the
        // grip drags with a mouse; touch/pen press-and-hold anywhere on the row.
        if (event.pointerType === 'mouse') return;
        drag.beginPress(event, task.id);
      }}
      onAnimationEnd={(event) => {
        // Every animation in the sequence bubbles up to this row, including the
        // ones on pseudo-elements. Settle only on the longest of them, or the
        // first to finish (fill-sweep at 180ms) would reflow the row while the
        // bubble and strikethrough are still running. Name is coupled to
        // styles.css; if it ever drifts, the module's fallback sweep still
        // settles the row, just 420ms later instead of 320ms.
        if (event.animationName !== 'check-spring') return;
        completion.onAnimationEnd(task.id);
      }}
    >
      <button
        type="button"
        className="task-check"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? 'Mark task as not done' : 'Mark task as done'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (drag.wasConsumed()) return;
          completion.begin(task.id, !task.done);
        }}
      >
        <span className="task-bubble" />
        <Check aria-hidden="true" />
      </button>
      <span
        className="task-grip"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.stopPropagation();
          drag.beginPress(event, task.id, { fromGrip: true });
        }}
      >
        <GripVertical aria-hidden="true" />
      </span>
      <input
        ref={inputRef}
        className="task-text"
        data-task-id={task.id}
        value={text}
        placeholder="Task"
        aria-label="Task"
        maxLength={400}
        onChange={(event) => {
          setText(event.target.value);
          scheduleCommit(event.target.value);
        }}
        onBlur={commitNow}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitNow();
            const id = addTask(task.sectionId, '', { afterTaskId: task.id });
            if (id) setFocusId(id);
          } else if (event.key === 'Backspace' && text.length === 0 && event.currentTarget.selectionStart === 0) {
            const index = siblings.findIndex((item) => item.id === task.id);
            const previous = siblings[index - 1];
            event.preventDefault();
            window.clearTimeout(commitTimerRef.current);
            deleteTask(task.id);
            if (previous) setFocusId(previous.id);
          }
        }}
      />
      <div className="task-trailing" ref={menuRef}>
        {tomatoes > 0 && (
          <span className="task-tomatoes" aria-label={`${tomatoes} focus ${tomatoes === 1 ? 'session' : 'sessions'} done`}>
            {Array.from({ length: tomatoes }, (_, index) => (
              <span key={index} className="task-tomato" aria-hidden="true" />
            ))}
          </span>
        )}
        <button
          type="button"
          className={`task-timer${timerRunning ? ' is-running' : ''}`}
          aria-label={timerRunning ? 'Pause focus timer' : 'Start focus timer'}
          aria-pressed={timerRunning}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => pomodoro.toggle(task.id)}
        >
          <Timer aria-hidden="true" />
        </button>
        <button
          type="button"
          ref={menuTriggerRef}
          className="icon-button icon-button-quiet task-more"
          aria-label="Task actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Ellipsis aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="list-menu-popover" role="menu">
            <button
              type="button"
              className="list-menu-item list-menu-danger"
              role="menuitem"
              onClick={handleDelete}
            >
              Delete task
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
