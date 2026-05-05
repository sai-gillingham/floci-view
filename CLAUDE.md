# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **Bun** (>= 1.0). Use `bun` for installs and scripts.

- `bun install` — install dependencies
- `bun dev` — Next.js dev server on port 3000
- `bun run build` — production build
- `bun start` — run production server
- `bun run lint` — ESLint (uses flat config in `eslint.config.mjs`, extends `next/core-web-vitals` and `next/typescript`)
- `docker compose up` — runs Floci (port 4566) + console together; production image via `Dockerfile`
- `Dockerfile.dev` + `init/docker-dev-entrypoint.sh` provides a dev container

There is no test runner configured in this repo.

## Architecture

This is a Next.js 16 App Router console (React 19, TypeScript, Tailwind v4) that proxies AWS API calls to a [Floci](https://github.com/hectorvent/floci) instance — a LocalStack-like AWS emulator.

### Request flow

Browser pages (`src/app/<service>/page.tsx`) → fetch internal Next.js route handlers (`src/app/api/<service>/.../route.ts`) → AWS SDK clients in `src/lib/aws-clients.ts` → Floci endpoint.

The browser never talks to Floci directly; route handlers act as a same-origin proxy so credentials and the Floci endpoint stay server-side.

### AWS client configuration

All SDK clients are constructed once in `src/lib/aws-clients.ts` with a shared config:
- `endpoint` from `FLOCI_ENDPOINT` (default `http://localhost:4566`)
- `region` from `AWS_REGION` (default `us-east-1`)
- Hardcoded `test`/`test` credentials (Floci ignores them)
- `s3Client` uses `forcePathStyle: true` — required for Floci-style endpoints

Add new services by exporting another configured client from this file rather than instantiating clients ad-hoc inside route handlers.

### Floci compatibility workarounds

Floci has known bugs that route handlers must work around. The pattern: catch the SDK error and fall back to reading Floci's on-disk JSON data files directly. See `src/app/api/cloudwatch/log-groups/route.ts` and `src/app/api/cloudwatch/streams/route.ts` for the canonical pattern — they read from `${FLOCI_DATA_PATH}/cwlogs-groups.json` (default `/floci-data`) when `DescribeLogGroups` returns `InternalServerError`, and tag the response with `_fallback: true`.

When adding new endpoints, prefer the SDK path; only add a file fallback if Floci's API actually breaks.

### Routing conventions

- Service UI pages live at `src/app/<service>/page.tsx` (s3, sqs, cloudwatch, cognito).
- API routes mirror AWS resource hierarchy, e.g. `api/cognito/user-pools/[poolId]/users/route.ts`.
- The dashboard at `src/app/page.tsx` aggregates `api/status` for resource counts.
- Path alias `@/*` → `src/*` (see `tsconfig.json`).

### Layout

`src/app/layout.tsx` wraps every page with a fixed `Sidebar` (`src/components/sidebar.tsx`) and forces dark mode via `<html className="dark">`. Tailwind v4 uses `@tailwindcss/postcss`; theme tokens are CSS custom properties in `src/app/globals.css` (e.g. `var(--bg-primary)`).

## Code review

`.coderabbit.yaml` enables CodeRabbit with `request_changes_workflow: true` and ESLint integration — PRs may be blocked until review comments are addressed.
