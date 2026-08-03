# Slate

Slate is the private, local-first to-do list published at `harsh.bet/slate/`. This repository is the standalone source for the app and its GitHub Pages deployment.

## Product model

- **One screen.** The whole app is the list: a quick-add bar, filters, and sections. Settings (sync, theme, backup) live in a dialog behind the gear icon.
- **Quick add** — one input that files tasks anywhere: `@today` / `@tomorrow` / `@fri` / `@2026-08-15` set the due date, `!high` / `!med` / `!low` (or `!1` `!2` `!3`) set priority, and `#section` targets a section by name (creating it if it does not exist). Unrecognised tokens stay in the title; a live preview shows exactly where the task will land.
- **Sections** — Notion-style groups with inline-editable titles, per-section colors, collapse, drag-and-drop task reordering (within and across sections), and clear-completed.
- **Tasks** — due dates with overdue highlighting, three-level priorities (flag click cycles them), notes, and a details dialog for everything else.
- **Filters + search** — All / Today (due or overdue) / Upcoming chips with live counts, substring search across titles and notes (`/` focuses it), and a synced hide-completed toggle.
- **Undo, not confirm** — deleting a task or section and clearing completed apply instantly and offer a 6-second Undo toast; restores propagate to every synced device because they outrank the tombstones.
- **Profile-free chrome** — Google sign-in for automatic sync, dark / light / system theme, JSON export/import, and full reset, all inside the settings dialog.

## Architecture

- React 18 + Vite + TypeScript, no runtime dependencies beyond `firebase` and `lucide-react`.
- Local-first store (`src/store.ts`): state lives in localStorage and IndexedDB (dual-write, newest copy wins on load, corrupt copies preserved under `slate-recovery-*` keys). The app is fully usable signed-out and offline.
- Sync (`src/sync-core.ts` + `src/useSlateSync.ts`): per-document last-write-wins on `updatedAt` with deterministic tie-breaks. Every section and task is its own Firestore document under `slate_users/{uid}`; deletes are tombstones so they propagate instead of resurrecting. Access is restricted to the owner's verified Google account, mirroring Daymark.
- Quick-add parsing (`src/quickadd.ts`) is a pure module with unit tests.
- Sign-out waits for pending writes, then clears the local mirror (`src/signout.ts`, same tested contract as Daymark).
- The retired schedule feature's `blocks` are ignored everywhere: stored copies and backups that still carry a `blocks` array load fine (the array is dropped), and the cloud `blocks` subcollection is neither read nor written.

## Firestore rules

Slate shares the `pickledgerpro` Firebase project with Daymark, Fare, and Sift. **`firestore.rules` carries the complete project ruleset (`daymark_users`, `slate_users`, `fare_users`, and `research_users`)** because deploying rules replaces the whole ruleset. The `slate_users/{uid}/blocks` rule is intentionally kept so legacy schedule data stays readable. The Pages workflow does not deploy these rules. When intentionally updating the shared backend, deploy with:

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
