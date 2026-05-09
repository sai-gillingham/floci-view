<!--
Select this template by appending ?template=bug_fix.md to the PR URL.
-->

## Summary
What bug does this fix? Link the issue: Fixes #

## Root cause
Why did the bug occur? (e.g. Floci API returning `InternalServerError`, SDK misconfiguration, missing path-style flag, stale cache, etc.)

## Fix
What changed and why this is the right level to fix it. Note if a Floci workaround / data-file fallback was added.

## Risk / blast radius
- Affected routes or pages:
- Backwards-compatible? Y/N
- New env vars or config:

## Verification
- [ ] Reproduced the bug on `master` before the fix
- [ ] Verified the fix locally against Floci (`docker compose up`)
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Manually exercised affected UI in browser

## Screenshots / logs
Before / after, if visible.
