import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSlateStore } from './store';
import { useSlateSync } from './useSlateSync';
import { useViewportLock } from './useViewportLock';
import { NoteEditor } from './views/NoteEditor';
import { NotesList } from './views/NotesList';
import { SettingsModal } from './views/SettingsModal';

const THEME_COLOR = { light: '#f2f2f7', dark: '#000000' } as const;

function readHash(): { noteId: string | null; settings: boolean } {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'settings' || hash === 'profile') return { noteId: null, settings: true };
  if (hash.startsWith('note/')) return { noteId: hash.slice(5) || null, settings: false };
  return { noteId: null, settings: false };
}

export default function App() {
  useViewportLock();
  const store = useSlateStore();
  const sync = useSlateSync(store);
  const [route, setRoute] = useState(readHash);
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => (
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  ));
  const themePreference = store.state?.settings.theme;
  const resolvedTheme = themePreference === 'dark' || themePreference === 'light'
    ? themePreference
    : systemTheme;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!store.state) return;
    document.documentElement.dataset.theme = resolvedTheme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      'content',
      THEME_COLOR[resolvedTheme],
    );
  }, [resolvedTheme, Boolean(store.state)]);

  function openNote(id: string) {
    window.location.hash = `note/${id}`;
  }

  function openList() {
    window.location.hash = '';
  }

  if (!store.state) {
    return (
      <div className="loading-screen" role="status">
        <span>Notes</span>
      </div>
    );
  }

  const state = store.state;
  const activeNote = route.noteId
    ? state.sections.find((section) => section.id === route.noteId && !section.deleted) ?? null
    : null;

  function compose() {
    const id = store.addSection('New Note');
    if (id) openNote(id);
  }

  return (
    <div className="app-shell">
      {sync.signingOut && (
        <div className="signout-scrim" role="alert" aria-busy="true">
          <LoaderCircle className="spin" aria-hidden="true" />
          <span>Finishing sync, then clearing this device…</span>
        </div>
      )}
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to notes
      </a>

      {store.storageWarning && (
        <div className="storage-warning" role="alert">
          <ShieldCheck aria-hidden="true" />
          <span>{store.storageWarning}</span>
          <button type="button" onClick={() => { window.location.hash = 'settings'; }}>Open settings</button>
        </div>
      )}

      <main id="main-content" tabIndex={-1}>
        {activeNote ? (
          <NoteEditor
            section={activeNote}
            tasks={state.tasks}
            hideCompleted={state.settings.hideCompleted}
            renameSection={store.renameSection}
            addTask={store.addTask}
            updateTask={store.updateTask}
            toggleTask={store.toggleTask}
            moveTask={store.moveTask}
            deleteTask={store.deleteTask}
            restoreTasks={store.restoreTasks}
            deleteSection={store.deleteSection}
            restoreSection={store.restoreSection}
            clearCompleted={store.clearCompleted}
            onBack={openList}
          />
        ) : (
          <>
            <NotesList
              sections={state.sections}
              tasks={state.tasks}
              onOpen={openNote}
              onCompose={compose}
              onSettings={() => { window.location.hash = 'settings'; }}
            />
          </>
        )}
      </main>

      {route.settings && (
        <SettingsModal
          state={state}
          storageMode={store.storageMode}
          updateSettings={store.updateSettings}
          replaceState={store.replaceState}
          resetState={store.resetState}
          sync={sync}
          onClose={() => {
            window.location.hash = activeNote ? `note/${activeNote.id}` : '';
          }}
        />
      )}
    </div>
  );
}
