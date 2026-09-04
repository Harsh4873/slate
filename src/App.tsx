import { LoaderCircle, Moon, Plus, Settings2, ShieldCheck, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePomodoro } from './usePomodoro';
import { useSlateStore } from './store';
import { useSlateSync } from './useSlateSync';
import { useViewportLock } from './useViewportLock';
import { Board } from './views/Board';
import { SettingsModal } from './views/SettingsModal';

const THEME_COLOR = { light: '#f5f6f8', dark: '#0e1014' } as const;

function readSettingsRoute(): boolean {
  const hash = window.location.hash.replace(/^#/, '');
  return hash === 'settings' || hash === 'profile';
}

export default function App() {
  useViewportLock();
  const store = useSlateStore();
  const sync = useSlateSync(store);
  const pomodoro = usePomodoro(store.countPomodoro);
  const [settingsOpen, setSettingsOpen] = useState(readSettingsRoute);
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
    const onHash = () => setSettingsOpen(readSettingsRoute());
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

  if (!store.state) {
    return (
      <div className="loading-screen" role="status">
        <span>Slate</span>
      </div>
    );
  }

  const state = store.state;

  function toggleTheme() {
    store.updateSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' });
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
        Skip to lists
      </a>

      <header className="app-bar">
        <h1 className="app-title">Slate</h1>
        <div className="app-bar-tools">
          <button
            type="button"
            className="icon-button add-list"
            aria-label="New list"
            onClick={() => {
              const id = store.addSection('');
              if (id) {
                setTimeout(() => {
                  document.querySelector<HTMLInputElement>(`input.list-title[data-section-id="${id}"]`)?.focus();
                }, 0);
              }
            }}
          >
            <Plus aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={resolvedTheme === 'dark'}
            onClick={toggleTheme}
          >
            {resolvedTheme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Settings"
            onClick={() => { window.location.hash = 'settings'; }}
          >
            <Settings2 aria-hidden="true" />
          </button>
        </div>
      </header>

      {store.storageWarning && (
        <div className="storage-warning" role="alert">
          <ShieldCheck aria-hidden="true" />
          <span>{store.storageWarning}</span>
          <button type="button" onClick={() => { window.location.hash = 'settings'; }}>Open settings</button>
        </div>
      )}

      <main id="main-content" className="board" tabIndex={-1}>
        <Board
          sections={state.sections}
          tasks={state.tasks}
          settings={state.settings}
          pomodoro={pomodoro}
          renameSection={store.renameSection}
          setSectionColor={store.setSectionColor}
          toggleSectionCollapsed={store.toggleSectionCollapsed}
          deleteSection={store.deleteSection}
          restoreSection={store.restoreSection}
          clearCompleted={store.clearCompleted}
          addTask={store.addTask}
          updateTask={store.updateTask}
          toggleTask={store.toggleTask}
          moveTask={store.moveTask}
          deleteTask={store.deleteTask}
          restoreTasks={store.restoreTasks}
        />
      </main>

      {settingsOpen && (
        <SettingsModal
          state={state}
          storageMode={store.storageMode}
          updateSettings={store.updateSettings}
          replaceState={store.replaceState}
          resetState={store.resetState}
          sync={sync}
          onClose={() => { window.location.hash = ''; }}
        />
      )}
    </div>
  );
}
