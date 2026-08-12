# Slate Maintenance

Slate is the owner's private, local-first task planner.

## Product Boundary

- Slate lives on `main` and publishes under `/slate/`.
- Keep task and section data local-first. Optional Firestore sync resolves a provisioned verified Google session through the canonical shared owner vault, so both approved identities see the same data and unprovisioned identities fail closed.
- A fresh visitor starts with one empty Inbox and no demo tasks. Never seed content that can be mistaken for somebody else's work.
- The retired schedule-block feature stays retired. Do not write `blocks` into Slate storage or make Today's integration depend on it.
- Deletions remain tombstones so they propagate across devices without resurrecting stale tasks.
- `firestore.rules` is the complete shared `pickledgerpro` ruleset; keep it byte-identical to the sibling private apps.

## Verification

- Never open the deployed site, a browser preview, rendered output, or live URLs. The owner verifies production visually.
- Review source and generated paths as text, and run `npm test`, `npm run typecheck`, and `npm run build` before publishing.
- Run `npm run test:rules` whenever the shared Firestore rules change.

## GitHub Publish

- Finish coding changes end-to-end on `main`: verify, commit, and push. The Pages workflow deploys the push.
- Use the currently logged-in GitHub user's commit identity. Never invent or switch identities.
- Never add AI co-author trailers, `Co-authored-by:` lines, or AI/Cursor/Codex/Claude taglines.
- Never force-push or overwrite unrelated user changes.

## Privacy

- This repository deploys publicly. Never commit the owner's real name, personal email, home location, account identifiers, or other sensitive details.
- Refer to "the owner" generically; the GitHub commit identity is the only owner reference that belongs in the repository.
