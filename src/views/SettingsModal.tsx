import {
  Download,
  HardDrive,
  LoaderCircle,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Upload,
  UserRound,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toDateKey } from '../dates';
import type { SlateState, ThemePreference } from '../model';
import { parseSlateState, type SlateStore, type StorageMode } from '../store';
import { Modal } from '../ui';
import type { SlateSync, SyncStatus } from '../useSlateSync';

const SYNC_LABELS: Record<SyncStatus, string> = {
  synced: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  'signed-out': 'Sign in',
  'action-needed': 'Action needed',
};

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

function formatSyncTime(timestamp?: string) {
  if (!timestamp) return 'waiting for first sync';
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'waiting for first sync';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(parsed);
}

interface SettingsModalProps {
  state: SlateState;
  storageMode: StorageMode;
  updateSettings: SlateStore['updateSettings'];
  replaceState: SlateStore['replaceState'];
  resetState: SlateStore['resetState'];
  sync: SlateSync;
  onClose: () => void;
}

export function SettingsModal({ state, storageMode, updateSettings, replaceState, resetState, sync, onClose }: SettingsModalProps) {
  const [authAction, setAuthAction] = useState<'sign-in' | 'sign-out' | null>(null);
  const [importError, setImportError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const liveSections = state.sections.filter((section) => !section.deleted).length;
  const liveTasks = state.tasks.filter((task) => !task.deleted).length;
  const signedInName = sync.user?.displayName?.trim() || sync.user?.email || 'Signed in';

  async function startSignIn() {
    if (authAction) return;
    setAuthAction('sign-in');
    try {
      await sync.signIn();
    } finally {
      setAuthAction(null);
    }
  }

  async function startSignOut() {
    if (authAction) return;
    const confirmed = window.confirm('Sign out of Slate on this device? Slate will first confirm that pending changes reached the cloud, then remove its local copy here. Your other signed-in devices keep the synced record.');
    if (!confirmed) return;
    setAuthAction('sign-out');
    try {
      await sync.signOut();
    } finally {
      setAuthAction(null);
    }
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `slate-backup-${toDateKey(new Date())}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file: File) {
    setImportError(undefined);
    try {
      const parsed = parseSlateState(JSON.parse(await file.text()));
      const scope = sync.user ? 'all of your signed-in devices' : 'this device';
      const sectionCount = parsed.sections.filter((section) => !section.deleted).length;
      const taskCount = parsed.tasks.filter((task) => !task.deleted).length;
      const confirmed = window.confirm(
        `Replace Slate on ${scope} with ${sectionCount} sections and ${taskCount} tasks from “${file.name}”? This becomes the new synced record. Export a backup first if needed.`,
      );
      if (confirmed) replaceState(parsed);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'That file could not be read as a Slate backup.');
    }
  }

  function startReset() {
    const scope = sync.user ? 'across every signed-in device' : 'on this device';
    if (window.confirm(`Reset Slate ${scope}? All sections and tasks are replaced with a fresh start. Export a backup first if needed.`)) {
      resetState();
    }
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings">
        <section className="settings-group" aria-busy={authAction !== null || sync.status === 'syncing'}>
          <div className="settings-group-heading">
            <h3>Sync</h3>
            <span className={`sync-state-pill sync-state-${sync.status}`} aria-live="polite">
              {sync.status === 'syncing' && <LoaderCircle className="spin" aria-hidden="true" />}
              {SYNC_LABELS[sync.status]}
            </span>
          </div>
          {sync.user ? (
            <>
              <div className="account-row">
                {sync.user.photoURL
                  ? <img src={sync.user.photoURL} alt="" referrerPolicy="no-referrer" />
                  : <span className="account-avatar-fallback" aria-hidden="true"><UserRound /></span>}
                <span>
                  <strong>{signedInName}</strong>
                  <small>{sync.user.email}</small>
                  <small>Last sync {formatSyncTime(sync.lastSyncedAt)}</small>
                </span>
              </div>
              {sync.message && <p role="status" className="settings-note">{sync.message}</p>}
              <button type="button" className="button button-secondary" onClick={startSignOut} disabled={authAction !== null}>
                {authAction === 'sign-out'
                  ? <><LoaderCircle className="spin" aria-hidden="true" /> Finishing sync…</>
                  : <><LogOut aria-hidden="true" /> Sign out + clear this device</>}
              </button>
            </>
          ) : (
            <>
              <p className="settings-note">Sign in once on each device. Slate keeps an instant on-device mirror, queues changes while offline, and reconciles automatically after reconnecting.</p>
              {sync.message && <p role="status" className="settings-note">{sync.message}</p>}
              <button
                type="button"
                className="button button-primary"
                onClick={startSignIn}
                disabled={authAction !== null || sync.status === 'offline'}
              >
                {authAction === 'sign-in'
                  ? <><LoaderCircle className="spin" aria-hidden="true" /> Opening Google…</>
                  : <><LogIn aria-hidden="true" /> Sign in with Google</>}
              </button>
            </>
          )}
        </section>

        <section className="settings-group">
          <div className="settings-group-heading">
            <h3>Theme</h3>
            <span className="settings-group-note">Choose how Slate appears</span>
          </div>
          <div className="theme-options" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={state.settings.theme === id}
                className={`theme-option${state.settings.theme === id ? ' selected' : ''}`}
                onClick={() => updateSettings({ theme: id })}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="settings-note">System follows your device appearance.</p>
          <button
            type="button"
            className="list-menu-item"
            onClick={() => updateSettings({ hideCompleted: !state.settings.hideCompleted })}
          >
            {state.settings.hideCompleted ? 'Show checked tasks' : 'Hide checked tasks'}
          </button>
        </section>

        <section className="settings-group">
          <div className="settings-group-heading">
            <h3>Data</h3>
            <span className="settings-group-note">
              <HardDrive aria-hidden="true" /> {liveSections} lists · {liveTasks} tasks · {storageMode === 'indexeddb' ? 'IndexedDB' : 'localStorage'}
            </span>
          </div>
          <div className="data-tools">
            <button type="button" className="button button-secondary" onClick={exportBackup}>
              <Download aria-hidden="true" /> Export backup
            </button>
            <button type="button" className="button button-secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden="true" /> Import backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importBackup(file);
              }}
            />
            <button type="button" className="button button-danger" onClick={startReset}>
              <RotateCcw aria-hidden="true" /> Reset
            </button>
          </div>
          {importError && <p className="data-error" role="alert">{importError}</p>}
          <p className="settings-note">Local-first and private: everything works offline, the cloud copy only keeps your devices aligned, and the whole record exports to one JSON file.</p>
        </section>
      </div>
    </Modal>
  );
}
