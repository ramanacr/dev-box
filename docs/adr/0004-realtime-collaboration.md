# ADR 0004: Real-time Whiteboard Collaboration Gate

## Status

**Implemented but gate NOT MET — the feature ships disabled and must stay disabled.**

Previously recorded as "Accepted (Gated)" without the demand evidence the Phase 4
plan requires before a WebSocket route may be enabled.

## Context

The diagram studio stores whiteboards in browser-local IndexedDB, and team mode
shares workspaces asynchronously. Real-time co-editing is a materially larger
commitment: a long-lived socket per editor, conflict resolution, and retention of
shared canvas state.

## Decision gate

| Gate condition | Required | Recorded | Status |
| --- | --- | --- | --- |
| Active teams requesting it | ≥ 3 | 0 | **NOT MET** |
| Documented limitations of asynchronous workspaces | 10 | 0 | **NOT MET** |
| Maximum concurrent-editor estimate | Stated | Not stated | **NOT MET** |
| Conflict-resolution requirements | Stated | Not stated — the relay currently broadcasts opaque payloads and stores last-write-wins snapshots | **NOT MET** |
| Approved retention policy for shared canvas state | Approved | Not approved | **NOT MET** |

`TOOLBOX_FEATURE_COLLABORATION` must remain unset until these are filled in.

Note on naming: an earlier draft of this record referred to `TOOLBOX_FEATURE_COLLAB`.
The implemented flag is **`TOOLBOX_FEATURE_COLLABORATION`**, derived from the
extension name by the central `config.Load` parser.

## Options

1. **Asynchronous sharing only.** A workspace holds a saved diagram; members open and
   save it. No sockets, no relay, no retention question. Current state.
2. **Narrow authenticated relay, off by default.** Implemented. Real-time updates
   inside one authorized workspace, with last-write-wins snapshots.
3. **Full CRDT with server-side merge.** Rejected for now: it requires committing to
   a specific CRDT library and a conflict model before any user has asked for one.

## Decision

Option 1 in practice; option 2 implemented and disabled.

## Constraints enforced by the implementation

- **Team mode is mandatory.** `config.Load` rejects `TOOLBOX_FEATURE_COLLABORATION`
  without `TOOLBOX_TEAM_MODE=true`, and the extension checks it again. A relay with no
  identity source cannot start.
- **Membership is checked, not assumed.** The hub takes an `Authorizer` backed by
  `team.WorkspaceService.Authorize(..., ActionRead)`. A hub constructed without one
  denies every join. An authenticated user who is not a member of the workspace is
  rejected, and the rejection is a 404 so room existence does not leak.
- **Identity comes from the session, never the frame.** The read loop overwrites the
  incoming `workspaceId` and `actorId` with the authenticated values, so a client
  cannot address another workspace or impersonate another actor by editing the JSON.
- **Frames capped at 256 KB**, enforced both by `Conn.SetReadLimit` at the transport
  and by `Hub.Broadcast`.
- **Rate limited to 30 messages/second per actor**, after which the connection is
  closed with a policy-violation status.
- **No anonymous rooms and no public ids.** Every room is a workspace id that the
  caller must already have read access to.
- Payloads are canvas element updates. Only `sync` frames — whole-document snapshots —
  are persisted; incremental updates are relayed and discarded.
- Audit entries record actor, action, and target id. Canvas payloads are never
  written to the audit trail.

## Consequences

- Core single-user mode is offline and socket-free.
- Whole-request `ReadTimeout`/`WriteTimeout` are disabled on the HTTP server when the
  relay is enabled, because a per-request deadline severs a long-lived socket. The
  handler's own ping/pong and read deadlines bound connection lifetime instead. This
  is a real trade-off and a reason not to enable the flag casually.
- Snapshots are last-write-wins. Two editors saving concurrently means one snapshot
  survives. This is why the conflict-resolution gate row must be answered before the
  feature is turned on.

## Verification

- `go test ./internal/collab` covers unauthorized connection rejection, a hub with no
  authorizer failing closed, cross-workspace message rejection, the message-size cap,
  the rate limit, disconnect cleanup, reconnect superseding a previous connection, and
  concurrent broadcast/leave.
- `go test ./internal/features` proves the route is absent without team mode and that
  enabling collaboration without a workspace store is a startup error.
