# Slate (Schedule + To-Do) Maintenance

This repository is for Harsh Dave's personal planner (Slate) only.

## Product Boundary

- Slate lives on `main` and publishes under `/slate/`.
- Do not add or modify PickLedger, betting, prediction, scraper, grading, model-cache, or player-prop code in this repository.
- Do not add or modify Daymark, Fare, Sift, Gym, or Portfolio source, data, or styling in this repository — with one exception: `firestore.rules` here intentionally carries the complete Daymark + Slate + Fare + Sift ruleset and must stay identical to the copies in the Daymark, Fare, and Research repositories.
- Keep Slate local-first. Sections, tasks, and schedule blocks stay in the user's browser unless the user signs in for private sync or explicitly exports them.
- The Pages workflow builds and publishes Slate directly from `main`.

## Verification

- Never open the deployed site, a browser preview, rendered Pages output, or live URLs to verify Slate. The user confirms production behavior.
- Agents may review source, run typecheck/build/tests, inspect generated file paths as text, and inspect GitHub Actions/API state.
- Before publishing Slate work, run `npm test`, `npm run typecheck`, and `npm run build`.

## GitHub Publish

- Commit Slate work on `main`; every push runs the Pages deployment workflow.
- Commits and pushes must come from the currently logged-in GitHub user.
- Never add AI co-author trailers, `Co-authored-by:` lines, or AI/Cursor/Codex taglines.
- Do not overwrite or revert unrelated user changes.
