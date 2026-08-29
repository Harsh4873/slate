import {
  LoaderCircle,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSlateStore } from './store';
import { useSlateSync } from './useSlateSync';
import { SettingsModal } from './views/SettingsModal';
import { TodoView } from './views/TodoView';

const THEME_COLOR = { light: '#f2f2f7', dark: '#000000' } as const;

export default function App() {
  const store = useSlateStore();
  const sync = useSlateSync(store);
  // Old bookmarks may still point at the retired #profile view; honour them
  // by opening the settings dialog they were looking for.
  const [settingsOpen, setSettingsOpen] = useState(() => ['#profile', '#settings'].includes(window.location.hash));
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
    // index.html applies the stored preference before paint. Wait for Slate's
    // async storage hydration before reconciling it, so IndexedDB-backed
    // preferences never briefly fall back to the operating-system theme.
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
        Skip to tasks
      </a>

      <header className="app-header">
        <span className="brand-link">Slate</span>
        <div className="header-tools">
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {resolvedTheme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings" title="Open settings">
            <Settings2 aria-hidden="true" />
          </button>
        </div>
      </header>

      {store.storageWarning && (
        <div className="storage-warning" role="alert">
          <ShieldCheck aria-hidden="true" />
          <span>{store.storageWarning}</span>
          <button type="button" onClick={() => setSettingsOpen(true)}>Open data tools</button>
        </div>
      )}

      <main id="main-content" tabIndex={-1}>
        <TodoView
          state={state}
          addSection={store.addSection}
          renameSection={store.renameSection}
          setSectionColor={store.setSectionColor}
          toggleSectionCollapsed={store.toggleSectionCollapsed}
          moveSection={store.moveSection}
          deleteSection={store.deleteSection}
          restoreSection={store.restoreSection}
          clearCompleted={store.clearCompleted}
          addTask={store.addTask}
          addTaskToNewSection={store.addTaskToNewSection}
          updateTask={store.updateTask}
          toggleTask={store.toggleTask}
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
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
