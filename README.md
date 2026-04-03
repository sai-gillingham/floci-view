# Floci Console

A web-based AWS Console for [Floci](https://github.com/hectorvent/floci), built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Dashboard** — Real-time service status overview with resource counts
- **S3** — Bucket list, object browser with folder navigation
- **SQS** — Queue list and management
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

## License

Apache License 2.0
