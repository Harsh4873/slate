# Slate

Slate is the private, local-first checklist published at `harsh.bet/slate/`. This repository is the standalone source for the app and its GitHub Pages deployment.

## Product model

- **Notes list.** Folders of checklists, searched and opened like Apple Notes.
- **A note is a checklist.** Title at the top, then circular checks. Return adds the next item. Tap the circle to check it off; checked items move to the bottom.
- **Drag to reorder** by pulling a circle, including to the end of the list.
- **Compose** creates a new note. Inbox stays as the built-in note Gmail can file into.
- **Settings** (ellipsis) — Google sign-in for sync, Light / Dark / System, hide checked items, export / import / reset.
- **Empty means empty** — a first visit is an empty Inbox note, never sample tasks.

## Architecture

- React 18 + Vite + TypeScript, no runtime dependencies beyond `firebase` and `lucide-react`.
- Local-first store (`src/store.ts`): state lives in localStorage (`slate-todo-state-v1`) and IndexedDB (`slate-todo` → `slate-state` → `current`) as a `{ storageFormat, savedAt, state }` envelope built by `buildStorageEnvelope` — dual-write, newest copy wins on load, corrupt copies preserved under `slate-recovery-*` keys. Opening Slate persists a snapshot, so simply visiting connects the device. The app is fully usable signed-out and offline.
- That envelope is a public read surface: the launcher's `/today/` dashboard parses it. `tests/fixtures/today-slate-payload.json` is generated from `buildStorageEnvelope` by `src/store.test.ts` and mirrored in the `harsh4873.github.io` repository, which asserts it can still be read.
- Sync (`src/sync-core.ts` + `src/useSlateSync.ts`): per-document last-write-wins on `updatedAt` with deterministic tie-breaks. Every section and task is its own Firestore document under `slate_users/{vaultId}`; deletes are tombstones so they propagate instead of resurrecting. The two provisioned verified-Google identities resolve to the same private vault, mirroring Daymark.
- Quick-add parsing (`src/quickadd.ts`) remains a pure module for the Gmail integration and tests; it is not shown in the Notes UI.
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
