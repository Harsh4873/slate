import { ChevronRight, Ellipsis, Search, SquarePen } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Section, Task } from '../model';
import { sortByOrder } from '../order';

function noteTouchedAt(section: Section, tasks: Task[]) {
  return tasks.reduce((latest, task) => (task.updatedAt > latest ? task.updatedAt : latest), section.updatedAt);
}

function formatListDate(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86400000);
  if (days === 0) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }).format(date);
}

export function NotesList({ sections, tasks, onOpen, onCompose, onSettings }: {
  sections: Section[];
  tasks: Task[];
  onOpen: (sectionId: string) => void;
  onCompose: () => void;
  onSettings: () => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const rows = useMemo(() => {
    const liveTasks = tasks.filter((task) => !task.deleted);
    return sections
      .filter((section) => !section.deleted)
      .map((section) => {
        const owned = sortByOrder(liveTasks.filter((task) => task.sectionId === section.id));
        const titled = owned.filter((task) => task.title.trim());
        const previewSource = [...titled.filter((task) => !task.done), ...titled.filter((task) => task.done)];
        const preview = previewSource.slice(0, 3).map((task) => task.title.trim()).join(', ');
        return {
          section,
          preview: preview || 'No additional text',
          touchedAt: noteTouchedAt(section, owned),
        };
      })
      .filter((row) => {
        if (!needle) return true;
        const haystack = `${row.section.title} ${row.preview}`.toLowerCase();
        return haystack.includes(needle);
      })
      .sort((left, right) => right.touchedAt.localeCompare(left.touchedAt) || left.section.title.localeCompare(right.section.title));
  }, [needle, sections, tasks]);

  return (
    <section className="notes-list">
      <div className="notes-title-block">
        <h1>Notes</h1>
        <button type="button" className="icon-button" aria-label="Settings" onClick={onSettings}>
          <Ellipsis aria-hidden="true" />
        </button>
      </div>
      <label className="notes-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Search"
          aria-label="Search notes"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="notes-groups">
        {rows.length === 0 ? (
          <p className="notes-empty">{needle ? 'No Results' : 'No Notes'}</p>
        ) : (
          <div className="notes-group">
            {rows.map((row) => (
              <button
                key={row.section.id}
                type="button"
                className="note-row"
                onClick={() => onOpen(row.section.id)}
              >
                <span className="note-row-copy">
                  <span className="note-row-title">{row.section.title || 'New Note'}</span>
                  <span className="note-row-meta">
                    <time dateTime={row.touchedAt}>{formatListDate(row.touchedAt)}</time>
                    {'  '}
                    {row.preview}
                  </span>
                </span>
                <span className="note-row-chevron" aria-hidden="true">
                  <ChevronRight />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <footer className="notes-toolbar">
        <span />
        <button type="button" className="compose-button" aria-label="New note" onClick={onCompose}>
          <SquarePen aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}
