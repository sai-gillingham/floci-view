<!--
Select this template by appending ?template=feature.md to the PR URL.
-->

## Summary
What new capability does this add? Link the issue: Closes #

## Motivation
The user-facing problem this solves.

## Implementation notes
- New / modified routes (`src/app/...`):
- New / modified API handlers (`src/app/api/...`):
- AWS SDK clients added to `src/lib/aws-clients.ts`:
- Any Floci compatibility workarounds (data-file fallbacks, `_fallback: true` flags):
- New env vars or config:

## Out of scope
What this PR intentionally does **not** do.

## Verification
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Manually exercised the new feature against Floci (`docker compose up`)
- [ ] Verified existing pages still load (no regressions in sidebar / dashboard)
- [ ] Dark mode styling checked

## Screenshots
UI changes — before/after or new screens.
