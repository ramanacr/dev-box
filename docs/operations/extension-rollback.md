# Extension Rollback & Deactivation Runbook

## Overview

All Phase 4 extensions operate behind decoupled environment variables. If any extension encounters instability, high latency, or operational issues, it can be immediately disabled without affecting the core Developer Toolbox.

## Rollback Procedures

### 1. Typesense Search Adapter
If Typesense becomes unavailable or experiences data corruption:
- Automatic fallback: The server automatically falls back to SQLite FTS5 without intervention.
- Hard deactivation: Remove `--profile typesense` from docker compose and restart:
  ```bash
  docker compose down && docker compose up -d
  ```

### 2. Real-time Collaboration Relay
To deactivate real-time canvas synchronization:
- Unset or set `TOOLBOX_FEATURE_COLLAB=false`.
- Restart container. The whiteboard canvas continues to operate offline with local JSON import/export and IndexedDB caching.

### 3. AI Assistance Gateway
To disable AI model gateway integrations:
- Set `TOOLBOX_FEATURE_AI=false`.
- Any requests to `/api/ai/*` immediately return `403 Forbidden` with `"ai assistance feature is disabled"`.
