# Branch protection

This repo uses three GitHub Repository Rulesets to enforce the GitFlow-lite model on the server side. Definitions live in `.github/rulesets/*.json` and are applied via `scripts/apply-rulesets.sh`.

## What's enforced

| | `develop` | `release/**` | `master` |
|---|---|---|---|
| Block deletion | ✅ | ✅ | ✅ |
| Block force-push | ✅ | ✅ | ✅ |
| Required commit signatures | ✅ | ✅ | ✅ |
| PR required (no direct push) | ✅ | ✅ | ✅ |
| Approvals | 1 | 1 | 1 |
| Code-owner approval (`.github/CODEOWNERS`) | ✅ | ✅ | ✅ |
| Dismiss stale reviews on push | ✅ | ✅ | ✅ |
| Require last-push approval | ✅ | ✅ | ✅ |
| Conversations resolved | ✅ | ✅ | ✅ |
| Allowed merge methods | merge only | merge only | merge only |
| Branch name regex on creation | — | `^release/v\d+\.\d+\.\d+$` | — |
| Branch up-to-date with base | ✅ | ✅ | ✅ |
| Required status checks | `lint-changed`, `unit-tests`, `coverage`, `build`, `e2e-tests`, `codecov/patch` | same as develop | `guard-source-branch`, `lint-full`, `unit-tests`, `coverage`, `build`, `e2e-tests`, `codecov/patch`, `codecov/project` |
| Bypass | repo admins only | repo admins only | repo admins only |

The `release/**` ruleset blocks creation of branches like `release/foo`, `release/v1`, or `release/feature` — only `release/vMAJOR.MINOR.PATCH` is accepted.

## Applying

> **Heads-up:** the script deletes the legacy "Default" ruleset on first run so the three new ones are the sole source of truth. If you've tuned the Default ruleset since 2026-05-08, capture its config first.

Prerequisites:
- `gh` CLI authenticated as a repo admin.
- `jq` installed.
- `CODECOV_TOKEN` repo secret configured (otherwise `codecov/patch` and `codecov/project` checks never post and merges will be permanently blocked).

Run from the repo root:

```bash
bash scripts/apply-rulesets.sh
```

The script is idempotent — re-running updates existing rulesets in place by name. Override the target repo with `REPO=owner/repo bash scripts/apply-rulesets.sh`.

## Verifying

List active rulesets:

```bash
gh api repos/sai-gillingham/floci-view/rulesets \
  --jq '.[] | {id, name, enforcement, target}'
```

Inspect one ruleset's rules:

```bash
gh api repos/sai-gillingham/floci-view/rulesets/<id> --jq '.rules'
```

## Negative-path tests

Each command below should fail with a rule violation. Run them after applying the rulesets to confirm enforcement. Because `develop` is protected, you'll need to pass `--force-with-lease` or use a different test branch where appropriate; the goal is to see the rejection message.

```bash
# Direct push to develop is blocked
git checkout develop
git commit --allow-empty -m "direct push test"
git push origin develop
# expect: rejected (pull request required)

# Deleting develop is blocked
git push origin --delete develop
# expect: rejected (deletion blocked)

# Force-pushing develop is blocked
git push --force-with-lease origin HEAD:develop
# expect: rejected (non-fast-forward blocked)

# Non-semver branch under release/ is blocked
git push origin develop:release/feature
# expect: rejected (branch name pattern)

# Hyphenated/extended versions are blocked
git push origin develop:release/v1.2.3-rc1
# expect: rejected (branch name pattern)

# Strict semver is allowed
git push origin develop:release/v9.9.9
# expect: success (clean up afterwards as an admin via bypass)
```

PR-side checks (use the GitHub UI):

- Open a PR to `develop` with no approval → merge button stays disabled.
- Open a PR to `develop` with a deliberately failing test → merge button stays disabled.
- Open a PR to `master` from a non-`release/v*` branch → `guard-source-branch` step fails the workflow, merge stays blocked.

## Updating rules

1. Edit the relevant JSON in `.github/rulesets/`.
2. Open a PR; reviewer can see the rule diff in the PR.
3. Merge.
4. Run `bash scripts/apply-rulesets.sh` to apply the change.

## Bypass

Each ruleset lists `RepositoryRole admin` as an "always" bypass actor. This lets the repo owner override in emergencies (e.g. recovering from a misconfigured rule, deleting a stale `release/v*` branch). It does not weaken normal-flow enforcement: bypass is an explicit per-action choice in the GitHub UI / API.

## Caveats

- **CODECOV_TOKEN must be configured** — without it, the `codecov/patch` / `codecov/project` checks never post and PRs are unmergeable. Configure under Settings → Secrets → Actions before applying.
- **Required signatures applies to all commits** — every commit on the protected branch (or being merged in) must be GPG/SSH signed. GitHub's auto-generated merge commits are signed; locally authored commits are not unless contributors set `commit.gpgsign true`. If this turns out to be too much friction, drop the `required_signatures` rule from each JSON and re-apply.
- **`actor_id: 5` = RepositoryRole admin** is documented but not labelled in the JSON. If the bypass list ever stops working, double-check this hasn't changed.
- **Tag pushes are not affected** — `release.yml` pushes `v*` tags, which target `refs/tags/`, not the protected branch refs.
