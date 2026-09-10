# Developer Toolbox Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded OpenAPI-first API workbench plus local Excalidraw and Mermaid diagram modules without weakening the small, local-first core.

**Architecture:** The Preact UI lazy-loads API and diagram modules. The browser parses OpenAPI and executes allowed HTTP calls directly; the Go service never proxies arbitrary destinations. API environments remain encrypted only in browser session memory by default. Excalidraw and Mermaid are independent chunks and export only local files.

**Tech Stack:** Existing Phase 1 stack; `@apidevtools/swagger-parser`, Ajv 2020, `@excalidraw/excalidraw`, Mermaid, Preact compatibility layer, Vitest, Playwright.

**Spec:** `developer-toolbox-white-paper.md` — “API workbench,” “Visual and learning modules,” and “Security, privacy, and governance.”

## Global Constraints

- Complete Phase 1 acceptance evidence before starting.
- No server-side HTTP proxy, secrets vault, shared collection, or public share link.
- Permit API calls only to `localhost`, loopback, RFC1918 private IPv4, and configured private DNS suffixes by default.
- Require an explicit user confirmation for every first request to a new host; do not persist authorization headers.
- Reject OpenAPI external `$ref` URLs; accept only bundled documents or local file imports.
- Use OpenAPI 3.1 and JSON Schema 2020-12 validation.
- Lazy-load Excalidraw, Mermaid, API parser, and schema validator; none may enter the initial chunk.
- Treat imported API definitions, request bodies, and drawings as browser-local data.

---

## Proposed Phase 2 files

```text
apps/web/src/modules/
├── api/{ApiPage,openapi,requestPolicy,requestRunner,responseView,apiPage}.ts(x)
├── diagrams/{DiagramPage,ExcalidrawEditor,MermaidEditor,diagramStore}.ts(x)
└── shared/{safeDownload,confirmDialog}.ts(x)
```

### Task 1: Parse and safely model OpenAPI documents

**Files:**
- Create: `apps/web/src/modules/api/openapi.ts`
- Create: `apps/web/src/modules/api/openapi.test.ts`
- Create: `apps/web/src/modules/api/openapiWorker.ts`
- Create: `apps/web/src/modules/api/fixtures/pets.openapi.yaml`

**Interfaces:**
- Produces `parseOpenApi(input: string): Promise<ParsedApi>`.
- `ParsedApi` is `{ title: string; version: string; servers: ApiServer[]; operations: ApiOperation[] }`.
- `ApiOperation` is `{ id: string; method: HttpMethod; path: string; summary: string; parameters: ApiParameter[]; requestBody?: ApiBody; responses: ApiResponse[] }`.

- [ ] **Step 1: Write failing parser tests**

Test a valid OpenAPI 3.1 YAML fixture, duplicate operation IDs, absent operation IDs, local `#/components` references, a remote `$ref`, malformed YAML, and a 6 MB document. Run:

```bash
pnpm --filter @toolbox/web test -- openapi
```

Expected: FAIL because `parseOpenApi` is absent.

- [ ] **Step 2: Implement parser worker**

Parse in a Web Worker. Cap input at 5 MB, normalize missing operation IDs to `METHOD:path`, resolve only local JSON pointers, and reject `http:`, `https:`, `file:`, and protocol-relative references. Return a typed diagnostic `{ severity: 'error'; message: string; path?: string }`, never an unbounded parser stack trace.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @toolbox/web test -- openapi
git add apps/web/src/modules/api/openapi* apps/web/src/modules/api/fixtures
git commit -m "feat: add safe OpenAPI parser"
```

### Task 2: Implement API request policy and session-only environments

**Files:**
- Create: `apps/web/src/modules/api/requestPolicy.ts`
- Create: `apps/web/src/modules/api/requestPolicy.test.ts`
- Create: `apps/web/src/modules/api/environmentStore.ts`
- Create: `apps/web/src/modules/api/environmentStore.test.ts`
- Create: `apps/web/src/modules/api/HostConfirmationDialog.tsx`

**Interfaces:**
- Produces `evaluateTarget(url: URL, policy: RequestPolicy): TargetDecision`.
- `TargetDecision` is `{ allowed: boolean; reason?: string; requiresConfirmation: boolean }`.
- Produces `SessionEnvironmentStore.set(name: string, value: string): void` and `resolve(template: string): ResolveResult`.

- [ ] **Step 1: Write failing target-policy tests**

Test `http://localhost:5000`, `https://127.0.0.1`, `http://10.20.30.40`, `http://192.168.1.10`, `http://172.16.0.1`, public `https://example.com`, IPv6 loopback, link-local addresses, malformed URLs, and URL credentials. Expected decisions: private/loopback allowed with confirmation on first host use; public, link-local, and credential-bearing URLs denied.

- [ ] **Step 2: Implement pure policy logic**

Use `URL.hostname`, validate literal IPs with a CIDR utility, and accept configured DNS suffixes only when the hostname ends with `.` plus an approved suffix. Keep approved hosts in session memory. Do not place environment values in IndexedDB, URL query strings, error text, or exports.

- [ ] **Step 3: Implement environment templates**

Support `{{variable}}` placeholders. Return a missing-name list without substituting an empty string. Render secret variables as masked inputs and clear all values on browser-tab close.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @toolbox/web test -- requestPolicy environmentStore
git add apps/web/src/modules/api/requestPolicy* apps/web/src/modules/api/environmentStore* apps/web/src/modules/api/HostConfirmationDialog.tsx
git commit -m "feat: add guarded API target policy"
```

### Task 3: Build request execution, response inspection, and schema validation

**Files:**
- Create: `apps/web/src/modules/api/requestRunner.ts`
- Create: `apps/web/src/modules/api/requestRunner.test.ts`
- Create: `apps/web/src/modules/api/responseValidation.ts`
- Create: `apps/web/src/modules/api/responseValidation.test.ts`
- Create: `apps/web/src/modules/api/ResponseView.tsx`

**Interfaces:**
- Produces `runRequest(input: RequestInput, signal: AbortSignal): Promise<ApiExecution>`.
- `ApiExecution` has `{ status, statusText, headers, elapsedMs, bodyText, bodyKind }`.
- Produces `validateResponse(schema: JSONSchema, value: unknown): ValidationIssue[]`.

- [ ] **Step 1: Write failing execution tests**

Mock `fetch` and assert: request timeout aborts at 30 seconds; response headers are normalized; binary content never enters a text parser; `authorization` and `cookie` values are replaced with `••••` in the UI model; network errors expose only a safe message.

- [ ] **Step 2: Implement the runner**

Resolve templates, call `evaluateTarget`, require confirmation if requested, issue browser `fetch`, measure elapsed time with `performance.now`, cap displayed text at 2 MB, and offer a binary download only through the existing redaction-aware download control. Do not disable browser CORS protections.

- [ ] **Step 3: Implement schema validation**

Compile only the selected response schema with Ajv 2020. Disable schema loading/network resolution. Present JSON Pointer path, human-readable message, expected rule, and actual JSON type. A schema mismatch is a result, not a request failure.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @toolbox/web test -- requestRunner responseValidation
git add apps/web/src/modules/api/requestRunner* apps/web/src/modules/api/responseValidation* apps/web/src/modules/api/ResponseView.tsx
git commit -m "feat: add API execution and contract validation"
```

### Task 4: Assemble the API Workbench user flow

**Files:**
- Create: `apps/web/src/modules/api/ApiPage.tsx`
- Create: `apps/web/src/modules/api/OperationList.tsx`
- Create: `apps/web/src/modules/api/RequestEditor.tsx`
- Create: `apps/web/src/modules/api/CodeExamples.tsx`
- Create: `apps/web/src/modules/api/apiPage.test.tsx`
- Create: `apps/web/src/modules/api/apiPage.e2e.ts`

**Interfaces:**
- Consumes the parser, environment store, policy, runner, and validator from Tasks 1–3.
- Produces cURL and C# `HttpClient` examples from the fully resolved non-secret request shape.

- [ ] **Step 1: Write failing UI tests**

Test import of the fixture, operation filtering, parameter editing, disabled Send button for a missing variable, target-confirmation dialog, redacted authorization display, validation result, and copyable cURL excluding secret header values.

- [ ] **Step 2: Implement UI**

Use a file picker and paste area, no URL import. Keep the active spec in IndexedDB only after a user names it; environments remain session-only. Place method, resolved host, and “will send a network request” notice immediately beside Send. Use `<details>` for code examples and include a “copy with placeholders” action.

- [ ] **Step 3: Add E2E test**

Use a local test server at `127.0.0.1`. Import the fixture, execute `GET /pets`, validate a response, verify an outbound public host is blocked, and verify refresh removes session secrets.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @toolbox/web test -- apiPage
pnpm --filter @toolbox/web e2e -- apiPage.e2e.ts
git add apps/web/src/modules/api
git commit -m "feat: add local API workbench"
```

### Task 5: Add Excalidraw and Mermaid local diagram modules

**Files:**
- Create: `apps/web/src/modules/diagrams/DiagramPage.tsx`
- Create: `apps/web/src/modules/diagrams/ExcalidrawEditor.tsx`
- Create: `apps/web/src/modules/diagrams/MermaidEditor.tsx`
- Create: `apps/web/src/modules/diagrams/diagramStore.ts`
- Create: `apps/web/src/modules/diagrams/diagramStore.test.ts`
- Create: `apps/web/src/modules/diagrams/mermaidEditor.test.tsx`

**Interfaces:**
- Produces `DiagramStore.save(id: string, diagram: SavedDiagram): Promise<void>`.
- `SavedDiagram` is `{ kind: 'excalidraw' | 'mermaid'; title: string; source: string; updatedAt: string }`.

- [ ] **Step 1: Write failing persistence and Mermaid-safety tests**

Test IndexedDB round-trip, import/export of `.excalidraw` JSON, Mermaid parsing error, and a Mermaid string containing `click`/external link syntax. Assert rendering uses Mermaid’s strict security level and does not create an external navigation action.

- [ ] **Step 2: Implement local diagram storage**

Store diagrams in the Phase 1 workspace database under `toolbox/v1/diagrams/`. Validate `.excalidraw` JSON shape before import. Export raw `.excalidraw`, SVG, and PNG locally; no automatic share links.

- [ ] **Step 3: Implement lazy editors**

Load `@excalidraw/excalidraw` through `preact/compat` only when the Excalidraw tab is activated. Load Mermaid only when its tab is activated. Configure Mermaid with `securityLevel: 'strict'`, neutral theme variables, and a maximum 200 KB diagram definition.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @toolbox/web test -- diagramStore mermaidEditor
pnpm build
node scripts/check-budgets.mjs
git add apps/web/src/modules/diagrams
git commit -m "feat: add local diagram tools"
```

### Task 6: Complete phase-2 acceptance evidence

**Files:**
- Create: `docs/release/phase-2-acceptance.md`
- Modify: `docs/security/threat-model-phase-1.md`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add acceptance scenarios**

Document passing evidence for local-spec import, public-host block, first-host confirmation, secret-clearing on refresh, OpenAPI response validation, Excalidraw local export, Mermaid strict mode, and bundle-budget checks.

- [ ] **Step 2: Run complete verification**

```bash
pnpm lint
pnpm test
go test -race ./...
pnpm build
node scripts/check-budgets.mjs
docker build -t developer-toolbox:phase2 .
pnpm e2e
./scripts/measure-runtime.sh developer-toolbox:phase2
```

Expected: all commands exit 0 and measured results are recorded in the acceptance document.

- [ ] **Step 3: Commit**

```bash
git add docs/release docs/security .github/workflows/ci.yml
git commit -m "docs: record phase two acceptance evidence"
```

## Plan self-review

| Requirement | Tasks |
| --- | --- |
| OpenAPI import and local validation | 1, 3, 4 |
| Private-network request policy and secret control | 2, 3, 4 |
| Local diagrams and exports | 5 |
| Performance, security, and release evidence | 6 |

The plan intentionally excludes server-side request proxying, shared collections, and real-time collaboration.
