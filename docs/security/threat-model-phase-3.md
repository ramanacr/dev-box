# Phase 3 Security Threat Model

## Threat Vectors & Mitigation Controls

### 1. Inadvertent Data Leakage in Anonymous Mode
- **Threat**: Users assume localhost mode saves data to a central database or transmits secrets.
- **Control**: In anonymous localhost mode, `workspace.db` is never created. All Git lessons and algorithm steps run strictly client-side inside the browser sandbox using JavaScript/SVG. Progress is saved locally in IndexedDB under origin-isolated storage.

### 2. OIDC Token Tampering & Replay
- **Threat**: Forged or expired JWTs attempting to impersonate another user or elevate roles.
- **Control**: `internal/auth/oidc.go` enforces strict signature segment verification, issuer matching, audience matching, and expiration timestamp checks. Unsigned or expired tokens are rejected with HTTP 401.

### 3. Privilege Escalation in Workspaces
- **Threat**: A `viewer` attempts to write content or an `editor` attempts to alter membership roles.
- **Control**: Service-layer authorization (`internal/team/workspace_service.go`) verifies the caller's role against the SQLite `workspace_members` table before any write or membership update.

### 4. Malicious Pack Ingestion
- **Threat**: Injection of unverified learning or documentation packs containing malicious scripts or unapproved licenses.
- **Control**: Only global `admin` principals can activate content packs. The activation record logs the actor, pack version, license, and cryptographic SHA-256 checksum in `audit_events`.
