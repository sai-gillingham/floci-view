# Floci Console

A web-based AWS Console for [Floci](https://github.com/hectorvent/floci), built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Dashboard** — Real-time service status overview with resource counts
- **S3** — Bucket list, object browser with folder navigation
- **SQS** — Queue list and management
- **Step Functions** — State machine CRUD, execution launch, live graph, event log, and output/result viewer
- **CloudWatch** — Log groups, streams, and event viewer
- **Cognito** — User pool list, pool details, and user management

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Floci](https://github.com/hectorvent/floci) running on port 4566

### Development

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker Compose (with Floci)

```bash
docker compose up
```

This starts both Floci and the console. Access the console at [http://localhost:3000](http://localhost:3000).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `FLOCI_ENDPOINT` | `http://localhost:4566` | Floci endpoint URL |
| `AWS_REGION` | `us-east-1` | AWS region for SDK calls |

## Testing

```bash
bun run test           # unit tests (tests/unit/)
bun run test:coverage  # writes coverage/lcov.info
bun run test:e2e       # Playwright (requires Floci on :4566)
```

Coverage is reported through [Codecov](https://about.codecov.io/) on every PR. The `CODECOV_TOKEN` repo secret must be configured for uploads to authenticate.

## Releasing

This repo follows GitFlow-lite: `feature/* → develop → release/vX.Y.Z → master`.

To cut a release:

1. `git checkout -b release/v1.2.3 develop`
2. Bump `version` in `package.json` to match (`1.2.3`)
3. Open a PR into `master` — `pr-release.yml` runs full ESLint + repo-wide coverage gate + E2E
4. Merge — `release.yml` verifies versions match, tags `v1.2.3`, pushes the Docker image to `ghcr.io`, and drafts a GitHub Release

See [`docs/RELEASING.md`](docs/RELEASING.md) for the full runbook including rollback.

## License

Apache License 2.0
