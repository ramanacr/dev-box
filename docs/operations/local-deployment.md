# Local Deployment Guide

Developer Toolbox is designed to run in Docker on localhost with zero configuration, minimal idle resource usage, and strict privacy defaults.

## Quick Start (Docker Compose)

To start the toolbox on your machine:

```bash
docker compose up -d
```

Open your browser to [http://127.0.0.1:8080](http://127.0.0.1:8080).

## Running with Docker CLI

```bash
docker run -d \
  --name developer-toolbox \
  -p 127.0.0.1:8080:8080 \
  -e TOOLBOX_BIND_ADDRESS="0.0.0.0" \
  developer-toolbox:phase1
```

## Security & Network Binding

> [!IMPORTANT]
> By default, the container port is mapped to `127.0.0.1:8080` (loopback only). Never expose port 8080 on a public IP address without authentication and HTTPS proxying.

To run on an internal shared team server:
```bash
docker run -d \
  --name developer-toolbox \
  -p 8080:8080 \
  -e TOOLBOX_BIND_ADDRESS="0.0.0.0" \
  developer-toolbox:phase1
```

## Health Checks

- **Liveness Probe**: `GET http://127.0.0.1:8080/healthz` -> `{"status":"ok"}`
- **Readiness Probe**: `GET http://127.0.0.1:8080/readyz` -> `{"status":"ready"}` (validates SQLite FTS5 database integrity)
