# Slate

Slate is the private, local-first checklist published at `harsh.bet/slate/`. This repository is the standalone source for the app and its GitHub Pages deployment.

## Product model

- **One surface.** Every list and its tasks live on a single scrolling board — no navigating into a document to check something off. Lists sit side by side from 760px up.
- **A list is a checklist.** Title, a colour dot, then circular checks. Return adds the next task, Backspace on an empty task removes it, and checked tasks sink to the bottom.
- **Completion is a gesture, not a state change.** Tapping the circle plays a bubble-pop and draws a strikethrough; the row only reflows into the done group once that finishes.
- **Hold to move.** Long-press a task on touch to pick it up, or drag from the grip with a mouse. Drops work across lists, at either end, and onto a collapsed or empty list.
- **Tap to focus.** Each task has a timer button that starts a 25/5 pomodoro bound to that task, with a long break every fourth session. Completed sessions show as dots on the row and persist across devices; the running timer stays device-local.
- **Quiet chrome.** List actions fade in on hover for a mouse, stay visible on touch, and appear on keyboard focus — nothing is reachable by hover alone.
- **Settings** — Google sign-in for sync, Light / Dark / System, hide checked tasks, export / import / reset.
- **Empty means empty** — a first visit is an empty Inbox, never sample tasks.

## Architecture

- React 18 + Vite + TypeScript, no runtime dependencies beyond `firebase` and `lucide-react`.
- Local-first store (`src/store.ts`): state lives in localStorage (`slate-todo-state-v1`) and IndexedDB (`slate-todo` → `slate-state` → `current`) as a `{ storageFormat, savedAt, state }` envelope built by `buildStorageEnvelope` — dual-write, newest copy wins on load, corrupt copies preserved under `slate-recovery-*` keys. Opening Slate persists a snapshot, so simply visiting connects the device. The app is fully usable signed-out and offline.
- That envelope is a public read surface: the launcher's `/today/` dashboard parses it. `tests/fixtures/today-slate-payload.json` is generated from `buildStorageEnvelope` by `src/store.test.ts` and mirrored in the `harsh4873.github.io` repository, which asserts it can still be read. `pomodoroCompleted` is omitted when zero precisely so that payload stays byte-identical.
- Sync (`src/sync-core.ts` + `src/useSlateSync.ts`): per-document last-write-wins on `updatedAt` with deterministic tie-breaks. Every section and task is its own Firestore document under `slate_users/{vaultId}`; deletes are tombstones so they propagate instead of resurrecting. The two provisioned verified-Google identities resolve to the same private vault, mirroring Daymark.
- The interaction primitives are pure modules with their own tests, kept separate from the view: `src/press-gesture.ts` arbitrates tap vs long-press vs drag, `src/completion.ts` sequences the completion animation, and `src/pomodoro.ts` derives every countdown from wall-clock time rather than accumulating ticks, so a backgrounded tab cannot drift. Their hooks (`useTaskDrag`, `useCompletion`, `usePomodoro`) hold the DOM and timer wiring.
- Drag reorder resolves targets through `src/drop-target.ts`, which hit-tests the `data-drop-section` / `data-drop-task` / `data-drop-start` attributes, then commits through the ordering contract in `src/order.ts` and `src/move-task.ts`.
- Quick-add parsing (`src/quickadd.ts`) remains a pure module for the Gmail integration and tests; it is not shown in the UI.
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
