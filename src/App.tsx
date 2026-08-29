import {
  LoaderCircle,
  Settings2,
  ShieldCheck,
  SquareCheckBig,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSlateStore } from './store';
import { useSlateSync } from './useSlateSync';
import { SettingsModal } from './views/SettingsModal';
import { TodoView } from './views/TodoView';

function SlateLogo() {
  return (
    <span className="slate-logo" aria-hidden="true">
      <i className="slate-logo-bar" />
      <i className="slate-logo-check"><SquareCheckBig /></i>
    </span>
  );
}

export default function App() {
  const store = useSlateStore();
  const sync = useSlateSync(store);
  // Old bookmarks may still point at the retired #profile view; honour them
  // by opening the settings dialog they were looking for.
  const [settingsOpen, setSettingsOpen] = useState(() => ['#profile', '#settings'].includes(window.location.hash));

  useEffect(() => {
    // Slate is intentionally a single, low-contrast light surface on phones.
    // This keeps the interface predictable even if an older backup stored a
    // dark-theme preference.
    document.documentElement.dataset.theme = 'light';
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', '#f6f8fb');
  }, []);

  if (!store.state) {
    return (
      <div className="loading-screen" role="status">
        <SlateLogo />
        <span>Opening your local-first to-do list…</span>
      </div>
    );
  }

  const state = store.state;
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
        <span className="brand-link">
          <SlateLogo />
          <span><strong>Slate</strong><small>Simple lists</small></span>
        </span>

        <div className="header-tools">
          <button type="button" className="theme-toggle" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
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
          replaceState={store.replaceState}
          resetState={store.resetState}
          sync={sync}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
