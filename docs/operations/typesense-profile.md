# Typesense Extension Profile & Operations Guide

## Overview

The Typesense extension provides enhanced fuzzy typo-tolerant full-text search across large documentation corpora without modifying the core developer workbench.

## Architecture

```
[Browser Client]
       │
       ▼ (GET /api/docs/search?q=...)
[Toolbox Server]
       │
       ├──(Primary)──► [Typesense Engine] (internal-search network)
       └──(Fallback)─► [SQLite FTS5 DB] (local read-only file)
```

## Running with Docker Compose

To run the Typesense profile alongside Developer Toolbox:

```bash
docker compose -f compose.yaml -f deploy/compose.typesense.yaml --profile typesense up -d
```

## Configuration

| Environment Variable | Description | Default |
| --- | --- | --- |
| `TOOLBOX_FEATURE_TYPESENSE` | Enables the Typesense search extension | `false` |
| `TYPESENSE_URL` | Internal Typesense URL | `http://typesense:8108` |
| `TYPESENSE_API_KEY` | Secret API key | `dev-toolbox-typesense-key` |

If Typesense is stopped or encounters high load, requests are served without error by falling back to local SQLite FTS5.
