# Developer Toolbox Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce optional extensions only after measured need: larger-corpus search, controlled collaboration, IDE/MCP integration, and opt-in AI assistance.

**Architecture:** Every extension implements a stable interface behind an off-by-default feature flag. The core image remains Preact, Go, and SQLite FTS5. Extensions may add separate services only when documented load, corpus, or workflow evidence passes explicit decision gates.

**Tech Stack:** Existing stack; optional Typesense adapter, WebSocket relay, VS Code extension API, MCP TypeScript SDK, and organization-approved model gateway.

**Spec:** `developer-toolbox-white-paper.md` — “Phase 4 — Evidence-led extensions” and “Security, privacy, and governance.”

## Global Constraints

- Do not begin an extension without its decision-gate evidence recorded in `docs/adr/`.
- The core Docker image must remain functional with every extension disabled.
- Never move private content to a cloud service without per-feature opt-in, destination disclosure, and retention documentation.
- Preserve the FTS5 index as the baseline search implementation.
- Use separate deployment profiles, SBOMs, threat models, and performance budgets for each optional service.

---

### Task 1: Establish extension contracts and decision records

**Files:**
- Create: `internal/extensions/contracts.go`
- Create: `internal/extensions/contracts_test.go`
- Create: `docs/adr/0001-extension-admission.md`
- Create: `docs/adr/0002-search-adapter-policy.md`
- Create: `docs/metrics/extension-gates.md`

**Interfaces:**
- Produces `type FeatureFlag string` and `type Extension interface { Name() string; Enabled(config.Config) bool; Register(*http.ServeMux) error }`.
- Produces `SearchBackend` with `Search(context.Context, docs.Query) ([]docs.SearchResult, error)`.

- [ ] **Step 1: Write failing flag and registration tests**

Test disabled extensions register no routes, duplicate extension names fail startup, and an enabled extension must expose a health check under `/api/extensions/{name}/health`.

- [ ] **Step 2: Implement the contracts**

Use environment values `TOOLBOX_FEATURE_<UPPERCASE_NAME>=true` only. Keep flags parsed centrally in `config.Load`. Produce an admission ADR template requiring corpus size, p95 search latency, concurrent users, current FTS5 result quality, operational cost, privacy impact, license, rollback, and deletion path.

- [ ] **Step 3: Verify and commit**

```bash
go test ./internal/extensions -v
git add internal/extensions docs/adr docs/metrics
git commit -m "feat: add extension admission framework"
```

### Task 2: Add an optional Typesense search adapter only after the search gate passes

**Files:**
- Create: `internal/search/typesense_adapter.go`
- Create: `internal/search/typesense_adapter_test.go`
- Create: `deploy/compose.typesense.yaml`
- Create: `docs/adr/0003-typesense-adapter.md`
- Create: `docs/operations/typesense-profile.md`

**Interfaces:**
- Produces `NewTypesenseBackend(baseURL string, apiKey Secret) (SearchBackend, error)`.
- Produces `MirrorPack(ctx context.Context, pack docs.Pack) error`.

- [ ] **Step 1: Record the gate evidence**

Do not write the adapter until the core system demonstrates all of: corpus ≥ 250,000 indexed sections, p95 FTS5 search > 250 ms under the agreed concurrent-user test, and a documented requirement for typo tolerance or faceting that FTS5 cannot meet. Record measurements in ADR 0003.

- [ ] **Step 2: Write failing adapter tests**

Using a mock Typesense HTTP server, test collection creation, idempotent document upsert, query mapping, timeout, unavailable backend fallback to FTS5, and that API keys never appear in errors/logs.

- [ ] **Step 3: Implement adapter and profile**

Use Typesense only through the `SearchBackend` interface. Keep the FTS5 backend active as fallback and content authority. The compose profile must mount Typesense data separately and bind it to an internal Docker network without a host port.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/search -v
docker compose -f compose.yaml -f deploy/compose.typesense.yaml --profile typesense up --build
git add internal/search deploy docs/adr docs/operations
git commit -m "feat: add optional Typesense search adapter"
```

### Task 3: Add controlled real-time collaboration only after the collaboration gate passes

**Files:**
- Create: `internal/collab/room.go`
- Create: `internal/collab/room_test.go`
- Create: `internal/collab/websocket.go`
- Create: `apps/web/src/modules/team/collaborationClient.ts`
- Create: `apps/web/src/modules/team/collaborationClient.test.ts`
- Create: `docs/adr/0004-realtime-collaboration.md`

**Interfaces:**
- Produces `AuthorizeRoom(principal auth.Principal, workspaceID string) error`.
- Produces `type CollaborationMessage struct { WorkspaceID, ActorID, Kind string; Payload []byte }`.

- [ ] **Step 1: Record the gate evidence**

Require at least three active teams, ten documented asynchronous-workspace limitations, a maximum concurrent-editor estimate, conflict-resolution requirements, and an approved retention policy. Record this before enabling a WebSocket route.

- [ ] **Step 2: Write failing security tests**

Test unauthorized connection rejection, cross-workspace message rejection, message-size limit, rate limit, disconnect cleanup, and no secret-bearing payload in audit entries.

- [ ] **Step 3: Implement a narrow collaboration relay**

Use authenticated WebSockets only for `.excalidraw` CRDT updates in authorized workspaces. Cap frames at 256 KB and rate at 30 messages/second per actor. Persist snapshots through the workspace service; do not create anonymous rooms or public IDs.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/collab -race -v
pnpm --filter @toolbox/web test -- collaborationClient
git add internal/collab apps/web/src/modules/team docs/adr
git commit -m "feat: add gated workspace collaboration"
```

### Task 4: Add IDE and MCP integration with local authorization

**Files:**
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/src/tools/searchDocs.ts`
- Create: `packages/mcp-server/src/tools/transformData.ts`
- Create: `packages/vscode/src/extension.ts`
- Create: `packages/vscode/src/extension.test.ts`
- Create: `docs/operations/mcp-and-vscode.md`

**Interfaces:**
- MCP tools: `search_docs({query, source?, limit?})` and `transform_data({input, from, to})`.
- VS Code command: `developerToolbox.searchDocs` opens the local toolbox URL with encoded non-secret query text.

- [ ] **Step 1: Write failing MCP tool tests**

Test input-schema validation, source filter, result limit, no network call, localhost toolbox connection refusal, and error messages without copied user data.

- [ ] **Step 2: Implement local-only integration**

MCP connects only to configurable loopback URL by default, validates the server’s local shared token, and does not expose API execution or environment secrets. VS Code extension uses `vscode.env.openExternal` for navigation and does not inject webview code.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @toolbox/mcp-server test
pnpm --filter @toolbox/vscode test
git add packages docs/operations
git commit -m "feat: add local MCP and VS Code integration"
```

### Task 5: Add opt-in AI assistance only through an approved gateway

**Files:**
- Create: `internal/ai/policy.go`
- Create: `internal/ai/policy_test.go`
- Create: `internal/ai/gateway.go`
- Create: `apps/web/src/modules/ai/AiConsentDialog.tsx`
- Create: `docs/adr/0005-ai-assistance.md`
- Create: `docs/security/ai-data-flow.md`

**Interfaces:**
- Produces `EvaluateAIRequest(input AIRequest, policy AIPolicy) (AIDecision, error)`.
- `AIDecision` is `{ Allowed bool; RedactedInput string; Destination string; Notice string }`.

- [ ] **Step 1: Record the gate evidence**

Require an approved provider/model gateway, data-processing agreement, allowed data classification, retention policy, abuse controls, model evaluation set, cost limit, and explicit user experience. Record them in ADR 0005.

- [ ] **Step 2: Write failing policy tests**

Test disabled feature denial, missing consent denial, secret redaction, restricted-data denial, approved destination display, token budget enforcement, and audit log without prompt text.

- [ ] **Step 3: Implement policy before provider code**

Expose no model endpoint until policy passes. Show the destination, data category, redaction preview, and per-request consent. Keep AI outputs labeled as suggestions and never execute generated commands or API requests automatically.

- [ ] **Step 4: Verify and commit**

```bash
go test ./internal/ai -v
git add internal/ai apps/web/src/modules/ai docs/adr docs/security
git commit -m "feat: add opt-in AI policy boundary"
```

### Task 6: Complete extension governance and release evidence

**Files:**
- Create: `docs/release/phase-4-acceptance.md`
- Create: `docs/operations/extension-rollback.md`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add independent profiles to CI**

Run core tests without extensions, then each enabled extension profile in isolation. Generate one SBOM per image/profile and require a dedicated threat-model link in every extension ADR.

- [ ] **Step 2: Run verification**

```bash
pnpm lint
pnpm test
go test -race ./...
pnpm build
docker build -t developer-toolbox:phase4 .
pnpm e2e
```

Expected: core mode continues to pass when every extension flag is false.

- [ ] **Step 3: Commit**

```bash
git add docs .github/workflows/ci.yml
git commit -m "docs: record phase four extension governance"
```

## Plan self-review

| Requirement | Tasks |
| --- | --- |
| Extension isolation and admission gates | 1 |
| Larger-corpus search option | 2 |
| Controlled collaboration | 3 |
| IDE/MCP local integration | 4 |
| Opt-in AI boundary | 5 |
| Release governance | 6 |

Every extension remains optional; Phase 1–3 functions remain available when all extension flags are disabled.
