import { ClipboardPaste } from 'lucide-react';
import { useMemo, useState } from 'react';
import { parseMarkdownImport, type ImportedList } from '../import-markdown';
import type { Section } from '../model';
import { Modal } from '../ui';

const PLACEHOLDER = `CSCE 671
- [ ] Read the paper before Tue
- [ ] Submit the folder URL

DAILY
- [ ] gym
- [x] read`;

export function ImportModal({ sections, onClose, onImport }: {
  sections: Section[];
  onClose: () => void;
  onImport: (lists: ImportedList[]) => number;
}) {
  const [text, setText] = useState('');

  const preview = useMemo(() => parseMarkdownImport(text), [text]);

  // Which lists already exist decides whether a section is created or added to,
  // so the preview can say which — an import that silently merged into an
  // existing list would be a surprise.
  const liveTitles = useMemo(() => {
    const set = new Set<string>();
    for (const section of sections) {
      if (!section.deleted) set.add(section.title.trim().toLowerCase());
    }
    return set;
  }, [sections]);

  const rows = preview.lists.map((list) => ({
    ...list,
    exists: liveTitles.has(list.title.toLowerCase()),
  }));
  const newCount = rows.filter((row) => !row.exists).length;
  const mergeCount = rows.length - newCount;

  function runImport() {
    if (!preview.taskCount) return;
    onImport(preview.lists);
    onClose();
  }

  return (
    <Modal
      title="Import tasks"
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <span className="modal-actions-spacer" />
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={preview.taskCount === 0}
            onClick={runImport}
          >
            {preview.taskCount === 0
              ? 'Import'
              : `Import ${preview.taskCount} task${preview.taskCount === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      <div className="import-pane">
        <label className="field">
          <span className="field-label">Paste a markdown outline</span>
          <textarea
            className="import-input"
            value={text}
            placeholder={PLACEHOLDER}
            aria-label="Markdown to import"
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
          />
        </label>

        <p className="import-hint">
          A heading becomes a list and the <code>- [ ]</code> items under it become its tasks.
          Plain bullets work too, and <code>- [x]</code> imports as already done. A heading with no
          items of its own is treated as a group label and skipped.
        </p>

        {text.trim() && preview.taskCount === 0 && (
          <p className="import-empty" role="status">
            Nothing to import yet — add at least one <code>- [ ]</code> item or bullet under a heading.
          </p>
        )}

        {preview.taskCount > 0 && (
          <div className="import-preview" role="status">
            <p className="import-summary">
              <ClipboardPaste aria-hidden="true" />
              {newCount > 0 && `${newCount} new list${newCount === 1 ? '' : 's'}`}
              {newCount > 0 && mergeCount > 0 && ', '}
              {mergeCount > 0 && `${mergeCount} existing list${mergeCount === 1 ? '' : 's'} added to`}
              {` · ${preview.taskCount} task${preview.taskCount === 1 ? '' : 's'}`}
            </p>
            <ul className="import-list">
              {rows.map((row) => (
                <li key={row.title}>
                  <span className="import-list-title">{row.title}</span>
                  <span className="import-list-count">
                    {row.tasks.length} task{row.tasks.length === 1 ? '' : 's'}
                    {row.exists ? ' · adds to existing' : ''}
                  </span>
                </li>
              ))}
            </ul>
            {preview.droppedHeadings.length > 0 && (
              <p className="import-dropped">
                Skipped as group labels: {preview.droppedHeadings.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
