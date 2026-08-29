# Slate

Slate is the private, local-first to-do list published at `harsh.bet/slate/`. This repository is the standalone source for the app and its GitHub Pages deployment.

## Product model

- **One screen.** The list is the app: add a task, switch All / Today, open settings from the gear.
- **Quick add** — type a task and press Add. Optional tokens still work if you already use them (`@today`, `#section`) but they are not advertised in the chrome.
- **Lists** — named groups with a color dot, collapse, and clear-completed. Extra lists sit behind the folder button.
- **Tasks** — a title, optional due date, optional notes. Drag the handle to reorder, including to the bottom of a list, or drop a task onto another list.
- **Filters** — All, or Today (due or overdue).
- **Undo, not confirm** — deletes and clear-completed offer a short Undo. Cancelled edits say that nothing was saved.
- **Settings** — Google sign-in for sync, Light / Dark / System, export / import / reset. An unset theme follows the operating system, applied before first paint. The sun/moon control flips Light and Dark.
- **Empty means empty** — a first visit is an empty Inbox, never sample tasks.

## Architecture

- React 18 + Vite + TypeScript, no runtime dependencies beyond `firebase` and `lucide-react`.
- Local-first store (`src/store.ts`): state lives in localStorage (`slate-todo-state-v1`) and IndexedDB (`slate-todo` → `slate-state` → `current`) as a `{ storageFormat, savedAt, state }` envelope built by `buildStorageEnvelope` — dual-write, newest copy wins on load, corrupt copies preserved under `slate-recovery-*` keys. Opening Slate persists a snapshot, so simply visiting connects the device. The app is fully usable signed-out and offline.
- That envelope is a public read surface: the launcher's `/today/` dashboard parses it. `tests/fixtures/today-slate-payload.json` is generated from `buildStorageEnvelope` by `src/store.test.ts` and mirrored in the `harsh4873.github.io` repository, which asserts it can still be read.
- Sync (`src/sync-core.ts` + `src/useSlateSync.ts`): per-document last-write-wins on `updatedAt` with deterministic tie-breaks. Every section and task is its own Firestore document under `slate_users/{vaultId}`; deletes are tombstones so they propagate instead of resurrecting. The two provisioned verified-Google identities resolve to the same private vault, mirroring Daymark.
- Quick-add parsing (`src/quickadd.ts`) is a pure module with unit tests.
- Sign-out waits for pending writes, then clears the local mirror (`src/signout.ts`, same tested contract as Daymark).
- The retired schedule feature's `blocks` are ignored everywhere: stored copies and backups that still carry a `blocks` array load fine (the array is dropped), and the cloud `blocks` subcollection is neither read nor written.

## Firestore rules

Slate shares the `pickledgerpro` Firebase project and canonical private owner vault with the other private harsh.bet apps. Both approved identities resolve to `slate_users/{vaultId}` and unprovisioned identities fail closed. **`firestore.rules` carries the complete project ruleset** because deploying rules replaces the whole policy. The `slate_users/{vaultId}/blocks` rule is intentionally kept so legacy schedule data stays readable. The Pages workflow does not deploy these rules. When intentionally updating the shared backend, deploy with:

```
firebase deploy --only firestore:rules
```

Keep this file identical to `firestore.rules` in the Daymark, Fare, and Research repositories whenever any app's rules change.

## Development

```
npm ci
npm run dev        # local dev server
npm test           # unit tests (sync merge, quick-add parsing, ordering, storage parsing, sign-out)
npm run typecheck
npm run build      # tsc + vite build with base /slate/
npm run test:rules # firestore rules tests (requires the firebase emulator)
```

## Publishing

Push `main` to run the standalone Pages workflow. It tests, typechecks, builds with the `/slate/` base, validates the artifact, and deploys it.
