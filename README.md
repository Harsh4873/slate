# Slate

Slate is the private, local-first to-do list published at `harsh.bet/slate/`. This repository is the standalone source for the app and its GitHub Pages deployment.

## Product model

- **One screen.** The whole app is the list: a quick-add bar, filters, and sections. Settings (sync, theme, backup) live in a dialog behind the gear icon.
- **Quick add** — one input that files tasks anywhere: `@today` / `@tomorrow` / `@fri` / `@2026-08-15` set the due date, `!high` / `!med` / `!low` (or `!1` `!2` `!3`) set priority, and `#section` targets a section by name (creating it if it does not exist). Unrecognised tokens stay in the title; a live preview shows exactly where the task will land.
- **Sections** — Notion-style groups with inline-editable titles, per-section colors, collapse, drag-and-drop task reordering (within and across sections), and clear-completed.
- **Tasks** — due dates with overdue highlighting, three-level priorities (flag click cycles them), notes, and a details dialog for everything else.
- **Move without opening anything** — every row has a move menu (folder icon) with Due today / Due tomorrow / Clear due and a move-to-section list; on touch, swipe a row right to set it due today or left to open the same menu. Both offer Undo.
- **Filters + search** — All / Today (due or overdue) / Upcoming chips with live counts, substring search across titles and notes (`/` focuses it), and a synced hide-completed toggle.
- **Undo, not confirm** — deleting a task or section and clearing completed apply instantly and offer a 6-second Undo toast; restores propagate to every synced device because they outrank the tombstones.
- **Profile-free chrome** — Google sign-in for automatic sync, dark / light / system theme, JSON export/import, and full reset, all inside the settings dialog. An unset theme preference follows the operating system, resolved before first paint.
- **Empty means empty** — a first visit shows an empty Inbox and an onboarding panel, never seeded example tasks that would count as real open work.

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
