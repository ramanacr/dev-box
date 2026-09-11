# ADR 0004: Real-time Whiteboard Collaboration Gate

## Status
Accepted (Gated)

## Context
Developer Toolbox provides an offline whiteboard canvas (`.excalidraw` format). Small engineering teams sharing workspaces requested the ability to sketch simultaneously on diagram canvases.

## Decision
1. **Gate Criteria**:
   - Only active when `TOOLBOX_FEATURE_COLLAB=true` and `TOOLBOX_TEAM_MODE=true`.
   - Workspaces must have authenticated members; anonymous public rooms are strictly forbidden.
2. **Network Constraints**:
   - WebSocket frame size hard-capped at 256 KB.
   - Message rate limit enforced at 30 messages/sec per actor to prevent denial of service.
   - Payloads are strictly canvas CRDT element shapes/vectors; no user source files or documents are exchanged.

## Consequences
- Single-user mode remains 100% offline and socket-free.
- Asynchronous team collaboration remains the primary mode; real-time relay operates on-demand without central lock-in.
