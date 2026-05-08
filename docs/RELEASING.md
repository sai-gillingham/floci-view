# Releasing

This repo follows GitFlow-lite:

```
feature/* ─┐
           └─► develop ──► release/vX.Y.Z ──► master ──► tag vX.Y.Z + Docker image + GitHub Release
```

`master` is production-only. The only PRs allowed into `master` are from a `release/vX.Y.Z` branch. Merging triggers `release.yml`, which tags the merge commit, pushes a Docker image to `ghcr.io`, and creates a GitHub Release.

## Cutting a release

1. **Branch off `develop`:**
   ```bash
   git checkout develop
   git pull
   git checkout -b release/v1.2.3
   ```

2. **Bump `package.json`:** set `"version": "1.2.3"` (must match the branch suffix exactly).

3. **Open a PR into `master`.** The `pr-release.yml` workflow runs:
   - `guard-source-branch` — rejects PRs from anything other than `release/vX.Y.Z`
   - `lint-full` — ESLint across the whole repo
   - `unit-tests` — `bun test`
   - `coverage` — runs `bun run test:coverage` and uploads `lcov.info` to Codecov with flag `release`. Codecov posts two status checks: `codecov/patch` (changed lines ≥ 80%) and `codecov/project` (repo-wide ≥ 80%). Both must be green.
   - `build` — `bun run build`
   - `e2e-tests` — Playwright against a Floci service container

4. **Merge** once green. Merge style does not matter; `release.yml` reads the source branch from the GitHub PR API regardless.

5. **`release.yml` runs on the resulting `push` to `master`:**
   - Verifies `package.json` version matches the branch suffix
   - Re-runs lint + tests + build as a final gate
   - Creates and pushes annotated tag `v1.2.3`
   - Pushes Docker image with tags `v1.2.3`, `1.2.3`, `1.2`, `1`, `latest`
   - Creates a GitHub Release with auto-generated notes

6. **Back-merge** `master` → `develop` so `develop` includes any changes (e.g. version bump) made on the release branch:
   ```bash
   git checkout develop
   git merge --no-ff master
   git push
   ```

## Rollback

If a release needs to be retracted:

1. Delete the tag locally and remote:
   ```bash
   git tag -d v1.2.3
   git push origin :v1.2.3
   ```

2. Delete the GitHub Release via the UI or `gh release delete v1.2.3`.

3. Re-tag the previous good SHA as `latest` in GHCR (or push a `latest` retagged from the previous version):
   ```bash
   docker buildx imagetools create \
     ghcr.io/<owner>/floci-view:v1.2.2 \
     --tag ghcr.io/<owner>/floci-view:latest
   ```

4. Open a follow-up `release/v1.2.4` (do not reuse the rolled-back number).

## Codecov setup

The coverage gate is enforced by [Codecov](https://about.codecov.io/), not by an in-workflow script. The lcov upload happens in the `coverage` job of each PR workflow; Codecov posts `codecov/patch` and `codecov/project` GitHub status checks based on `codecov.yml`.

One-time setup:

1. Add the repo to Codecov and copy the upload token.
2. Add `CODECOV_TOKEN` as a repository secret.
3. In branch protection (see below), require the relevant Codecov status checks.

`codecov.yml` uses Codecov flags so the same upload action serves both PR workflows:
- `pr-integration.yml` uploads with flag `integration` → only `codecov/patch` is enforced (changed-lines ≥ 80%).
- `pr-release.yml` uploads with flag `release` → both `codecov/patch` and `codecov/project` (≥ 80%) are enforced.

## Known caveats

- **Coverage scope** — Codecov measures line coverage of code imported by the unit tests. `src/app/<service>/page.tsx` files are not unit-tested (they're verified end-to-end by Playwright instead) and so are not part of the coverage denominator. If pages are added that should be unit-tested, they will start counting.
- **Supported Floci version range** — declared in `package.json` under `floci.version` (currently `^1.5`). `docker-compose.yml` and the e2e workflows pin to `floci/floci:1.5.13` and set `FLOCI_VERSION=1.5.13`; `bun run check:floci` (also wired as `predev`/`prebuild`/`prestart`) emits a warning if the env is missing or outside the declared range. Bump both together when upgrading Floci.
- **Branch protection is manual** — workflow files alone do not enforce the gates. After the first release, configure required status checks:
  - `develop`: `lint-changed`, `unit-tests`, `coverage`, `e2e-tests`, `build`, **`codecov/patch`**
  - `master`: `guard-source-branch`, `lint-full`, `unit-tests`, `coverage`, `e2e-tests`, `build`, **`codecov/patch`**, **`codecov/project`**
