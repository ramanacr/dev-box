# Developer Toolbox Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact Git/algorithms learning pack and optional authenticated shared workspaces while preserving a fully useful anonymous localhost mode.

**Architecture:** Learning simulations remain browser-only and are distributed as an optional pack. Team mode is an explicit Go-server configuration: OIDC authentication, SQLite-backed shared workspace metadata, and role-limited administration. All collaboration is asynchronous; no real-time cursors or socket service are included.

**Tech Stack:** Existing Phase 2 stack; Go `chi` middleware, `lestrrat-go/jwx/v3`, SQLite migration tool, Preact, Vitest, Playwright.

**Spec:** `developer-toolbox-white-paper.md` — “Visual and learning modules,” “Data boundaries,” and “Phase 3.”

## Global Constraints

- Require Phase 2 acceptance evidence before implementation.
- Localhost mode remains anonymous and does not create `workspace.db`.
- Team mode requires explicit `TOOLBOX_TEAM_MODE=true`, OIDC issuer/audience/client settings, HTTPS at the reverse proxy, and a writable data volume.
- Roles are `viewer`, `editor`, and `admin`; only admins manage users and content-pack activation.
- No real-time collaboration, external user invitation, public links, or stored API secrets.
- Learning content must have an approved source/license/attribution record before shipping.

---

### Task 1: Create browser-only Git graph simulation

**Files:**
- Create: `apps/web/src/modules/learning/git/model.ts`
- Create: `apps/web/src/modules/learning/git/reducer.ts`
- Create: `apps/web/src/modules/learning/git/reducer.test.ts`
- Create: `apps/web/src/modules/learning/git/GitSandboxPage.tsx`
- Create: `apps/web/src/modules/learning/git/levels.ts`

**Interfaces:**
- Produces `reduceRepository(state: RepositoryState, command: GitCommand): RepositoryState | CommandError`.
- Supports `commit`, `branch`, `switch`, `merge`, `rebase`, `reset --soft|--mixed|--hard`, `revert`, and `cherry-pick` only.

- [ ] **Step 1: Write failing reducer tests**

Create deterministic tests for branch creation, fast-forward merge, merge commit, rebase parent rewrite, detached HEAD, rejected reset target, revert commit creation, and cherry-pick conflict result.

- [ ] **Step 2: Implement pure simulation**

Model commits as immutable `{ id, parents, message }`, refs as maps, and HEAD as a symbolic ref or commit ID. Generate deterministic short IDs from a monotonic counter, not real Git hashes. Do not access the filesystem or execute `git`.

- [ ] **Step 3: Implement levels and UI**

Create six levels progressing from commit/branch to rebase/revert. Render a keyboard-accessible SVG commit graph and command input. Store progress only in IndexedDB and permit Reset Lesson.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @toolbox/web test -- reducer
git add apps/web/src/modules/learning/git
git commit -m "feat: add browser Git learning sandbox"
```

### Task 2: Create a small algorithm visualizer pack

**Files:**
- Create: `apps/web/src/modules/learning/algorithms/contracts.ts`
- Create: `apps/web/src/modules/learning/algorithms/sorting.ts`
- Create: `apps/web/src/modules/learning/algorithms/graph.ts`
- Create: `apps/web/src/modules/learning/algorithms/algorithms.test.ts`
- Create: `apps/web/src/modules/learning/algorithms/AlgorithmPage.tsx`
- Create: `packs/learning/manifest.json`

**Interfaces:**
- Produces `type Step<T> = { state: T; explanation: string; highlighted: string[] }`.
- Produces generators `bubbleSortSteps`, `mergeSortSteps`, `bfsSteps`, and `dijkstraSteps`.

- [ ] **Step 1: Write failing generator tests**

Assert each sorting generator ends sorted, preserves input multiset, produces no mutation of the original input, and has finite steps. Assert BFS visitation order and Dijkstra shortest distances on a fixture graph.

- [ ] **Step 2: Implement deterministic generators**

Emit immutable snapshots. Limit arrays to 128 elements and graphs to 50 nodes/200 edges. Use a seeded random generator for demo data so lessons reproduce exactly.

- [ ] **Step 3: Implement visual controls**

Add Play, Pause, Step, Reset, speed selector, custom input validation, and a textual step explanation. Use SVG and semantic fallback tables; do not use Canvas-only controls.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @toolbox/web test -- algorithms
git add apps/web/src/modules/learning/algorithms packs/learning/manifest.json
git commit -m "feat: add algorithm learning pack"
```

### Task 3: Add team-mode configuration, schema migrations, and OIDC validation

**Files:**
- Create: `internal/team/config.go`
- Create: `internal/team/config_test.go`
- Create: `internal/team/migrations/001_initial.sql`
- Create: `internal/team/store.go`
- Create: `internal/team/store_test.go`
- Create: `internal/auth/oidc.go`
- Create: `internal/auth/oidc_test.go`

**Interfaces:**
- Produces `team.Enabled(cfg config.Config) bool`.
- Produces `auth.ValidateIDToken(ctx context.Context, raw string) (Principal, error)`.
- `Principal` is `{ Subject, Email, DisplayName string; Roles []Role }`.

- [ ] **Step 1: Write failing configuration and migration tests**

Test disabled mode has no data DB requirement; enabled mode rejects missing issuer/audience/database path; migrations create `users`, `workspaces`, `workspace_members`, and `audit_events`; all foreign keys are enabled.

- [ ] **Step 2: Implement the team store**

Use a separate writable `workspace.db` with WAL mode, busy timeout, and `PRAGMA foreign_keys=ON`. Create tables with tenantless single-install scope: users have stable subject IDs; workspaces have UUID IDs and owner subject; membership role check restricts values to viewer/editor/admin; audit events contain actor ID, action, target ID, and timestamp—never document content.

- [ ] **Step 3: Implement OIDC validation**

Fetch discovery/JWKS only at controlled startup/refresh intervals, validate issuer/audience/expiry/signature, and map group claims only through configured allowlisted claim names. Reject unsigned, expired, wrong-audience, and missing-subject tokens.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/team ./internal/auth -v
git add internal/team internal/auth
git commit -m "feat: add optional team mode identity foundation"
```

### Task 4: Implement shared workspace authorization and administration

**Files:**
- Create: `internal/team/workspace_service.go`
- Create: `internal/team/workspace_service_test.go`
- Create: `internal/httpapi/team_routes.go`
- Create: `apps/web/src/modules/team/WorkspacePage.tsx`
- Create: `apps/web/src/modules/team/AdminPage.tsx`
- Create: `apps/web/src/modules/team/teamPage.test.tsx`

**Interfaces:**
- Produces `WorkspaceService.Create(ctx, principal, input) (Workspace, error)` and `WorkspaceService.Authorize(ctx, principal, workspaceID, action) error`.
- Actions are `read`, `write`, `manage-members`, and `manage-packs`.

- [ ] **Step 1: Write failing authorization tests**

Assert viewers cannot write, editors cannot manage members, owners/admins can manage members, an unknown user receives 404 for an inaccessible workspace, and audit records are written for create/member-role/pack-activation actions.

- [ ] **Step 2: Implement routes**

Add authenticated routes only under `/api/team/`: `GET /me`, `GET|POST /workspaces`, `GET|PATCH /workspaces/{id}`, `POST /workspaces/{id}/members`, and `GET|POST /admin/packs`. Enforce method-specific authorization at the service layer, not only in handlers.

- [ ] **Step 3: Implement UI**

Render team controls only when `/api/team/me` identifies team mode. Provide a clear “browser-local draft” vs “shared workspace” label. Admin pack activation shows source, version, checksum, license, and attribution before confirmation.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/team ./internal/httpapi -v
pnpm --filter @toolbox/web test -- teamPage
git add internal/team internal/httpapi apps/web/src/modules/team
git commit -m "feat: add team workspaces and pack administration"
```

### Task 5: Release phase-3 with deployment evidence

**Files:**
- Create: `docs/operations/team-mode.md`
- Create: `docs/security/threat-model-phase-3.md`
- Create: `docs/release/phase-3-acceptance.md`
- Modify: `compose.yaml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add compose profiles**

Keep `core` as default. Add a `team` profile requiring environment variables and a mounted `/var/lib/toolbox` volume. Do not publish a port beyond the configured reverse proxy in deployment instructions.

- [ ] **Step 2: Add E2E scenarios**

Test anonymous core mode, team-mode login with a signed test token, viewer/editor/admin authorization paths, local Git sandbox completion, algorithm playback, and inactive learning-pack behavior.

- [ ] **Step 3: Run complete verification and commit**

```bash
pnpm lint
pnpm test
go test -race ./...
pnpm build
docker build -t developer-toolbox:phase3 .
pnpm e2e
./scripts/measure-runtime.sh developer-toolbox:phase3
git add docs compose.yaml .github/workflows/ci.yml
git commit -m "docs: record phase three acceptance evidence"
```

## Plan self-review

| Requirement | Tasks |
| --- | --- |
| Browser-only Git learning | 1 |
| Algorithms learning pack | 2 |
| Optional OIDC team mode and SQLite state | 3, 4 |
| Deployment/security evidence | 5 |

The plan preserves anonymous local mode and excludes public sharing and real-time editing.
