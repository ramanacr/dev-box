# Developer Toolbox Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a small, offline-capable Docker application with local documentation search and the high-frequency structured-data and text utilities.

**Architecture:** A Preact/TypeScript single-page application is served by a static Go binary. The browser performs all format conversion and text operations. The Go service opens a read-only SQLite FTS5 documentation database, exposes a narrow search API, and serves content packs. Browser-local IndexedDB stores preferences and drafts; no server-side user data or outbound requests exist in this phase.

**Tech Stack:** Go 1.25+, Preact 10+, TypeScript 5.9+, Vite 7+, Vitest, Playwright, SQLite FTS5, `modernc.org/sqlite`, Docker BuildKit, GitHub Actions.

**Spec:** `developer-toolbox-white-paper.md` — sections “Product principles,” “Documentation index design,” “Phase 0,” “Phase 1,” “Security, privacy, and governance,” and “Testing and acceptance plan.”

## Global Constraints

- Build only the phase-1 scope: no API request client, no outbound HTTP, no authentication, no collaboration, and no AI integration.
- Ship one runtime Docker container; Node.js is build-time only.
- Bind to `127.0.0.1` by default; allow `0.0.0.0` only through the explicit `TOOLBOX_BIND_ADDRESS` setting.
- Keep input processing client-side except documentation search and document-content retrieval.
- Include no telemetry, analytics SDK, third-party font/CDN, or remote script.
- Treat documentation packs as immutable, read-only artifacts with a manifest, SHA-256 checksum, source URL, source license, and attribution text.
- Use SQLite FTS5 and `bm25()` for lexical documentation search; do not add a vector database or external search service.
- Set bundle budgets: initial JavaScript ≤ 250 KB gzip; any tool larger than 50 KB gzip must use dynamic import.
- Set runtime targets: core image ≤ 150 MB compressed, idle container RSS ≤ 60 MB, `/healthz` ready within 2 seconds on a typical development laptop.
- Redact values matching token/password/secret patterns before browser download/share exports; do not log request bodies, document search text, or tool input.
- Use semantic HTML, keyboard navigation, visible focus, and automated accessibility checks for every core route.
- Do not add .NET or Angular to the application runtime; they are documentation-pack topics only.

---

## Proposed repository structure

```text
developer-toolbox/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── modules/
│       │   │   ├── docs/
│       │   │   ├── data/
│       │   │   ├── regex/
│       │   │   ├── text/
│       │   │   └── code-image/
│       │   ├── platform/
│       │   └── test/
│       ├── package.json
│       ├── vite.config.ts
│       └── playwright.config.ts
├── cmd/toolbox-server/main.go
├── internal/
│   ├── config/
│   ├── docs/
│   └── httpapi/
├── packs/
│   └── core/
├── scripts/
├── Dockerfile
├── compose.yaml
├── go.mod
├── package.json
└── .github/workflows/ci.yml
```

## Task 1: Establish the monorepo, reproducible build, and quality gates

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `go.mod`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**

- Produces root commands: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`, `go test ./...`, and `docker build -t developer-toolbox:dev .`.
- Produces a strict TypeScript configuration used by all browser modules.

- [ ] **Step 1: Add a failing build gate before source files exist**

Create root scripts that call `pnpm --filter @toolbox/web build` and `go test ./...`. Run:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Expected: FAIL because the web package has no Vite entry point.

- [ ] **Step 2: Add workspace and tool configuration**

Use this root script contract:

```json
{
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "lint": "pnpm --filter @toolbox/web lint && go vet ./...",
    "test": "pnpm --filter @toolbox/web test && go test ./...",
    "build": "pnpm --filter @toolbox/web build && go build ./cmd/toolbox-server",
    "e2e": "pnpm --filter @toolbox/web e2e"
  }
}
```

Enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride` in `apps/web/tsconfig.json`. Configure Vite to emit into `apps/web/dist` and Vitest to use `jsdom` with coverage thresholds of 85% statements, 80% branches, 85% functions, and 85% lines for platform code.

- [ ] **Step 3: Add the CI workflow**

Create CI jobs in this order: dependency install with a locked pnpm store; TypeScript lint/test/build; Go test/vet/build; Docker build; Trivy filesystem/image scan; Syft SPDX JSON SBOM generation; Playwright smoke test after `docker compose up`.

- [ ] **Step 4: Run the quality gates**

Run:

```bash
pnpm lint
pnpm test
pnpm build
go test ./...
```

Expected: PASS once the minimal source stubs from Task 2 are present; no warnings are treated as errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml apps/web go.mod .editorconfig .gitignore .github README.md
git commit -m "chore: establish developer toolbox workspace"
```

## Task 2: Build the server shell and hardened Docker runtime

**Files:**

- Create: `cmd/toolbox-server/main.go`
- Create: `internal/config/config.go`
- Create: `internal/config/config_test.go`
- Create: `internal/httpapi/server.go`
- Create: `internal/httpapi/server_test.go`
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `.dockerignore`

**Interfaces:**

- Produces `config.Load(getenv func(string) string) (Config, error)`.
- Produces `httpapi.NewServer(cfg config.Config, docs docs.Searcher, assets fs.FS) http.Handler`.
- Exposes `GET /healthz` returning `{"status":"ok"}` and `GET /readyz` returning `{"status":"ready"}` only after the docs database validates.

- [ ] **Step 1: Write failing configuration tests**

Add table-driven tests verifying these cases:

```go
func TestLoad_DefaultsToLoopback(t *testing.T) { /* expect 127.0.0.1:8080 */ }
func TestLoad_AllowsExplicitBindAddress(t *testing.T) { /* expect 0.0.0.0:8080 */ }
func TestLoad_RejectsNonNumericPort(t *testing.T) { /* expect error */ }
func TestLoad_RejectsMissingDocsDatabase(t *testing.T) { /* expect error */ }
```

Run:

```bash
go test ./internal/config -run TestLoad -v
```

Expected: FAIL because `Load` does not exist.

- [ ] **Step 2: Implement the configuration contract**

Define:

```go
type Config struct {
    BindAddress string
    Port        int
    DocsDBPath  string
    WebRoot     string
}
```

Use `127.0.0.1`, `8080`, `/app/packs/core/docs.db`, and `/app/web` as defaults. Use `net.SplitHostPort`/`net.JoinHostPort` at the server boundary; do not concatenate host and port strings.

- [ ] **Step 3: Write failing HTTP tests**

Test `GET /healthz` with `httptest.NewRecorder`; assert status 200, `Content-Type: application/json`, and exact JSON body. Test that `/readyz` is 503 when the injected `docs.Searcher` reports unavailable. Test that every response sets:

```text
Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Run `go test ./internal/httpapi -run 'TestHealth|TestReady|TestSecurityHeaders' -v`; expect FAIL.

- [ ] **Step 4: Implement the HTTP server**

Implement JSON-only health endpoints, SPA fallback only for known client routes, and static assets with immutable caching only for fingerprinted files. Return `Cache-Control: no-store` for `index.html`, APIs, and manifest files. Use `slog` with method, route pattern, status, duration, and request ID only—never query strings or request bodies.

- [ ] **Step 5: Add a multi-stage Docker build**

Build the Vite application in a Node builder stage and the Go binary in a Go builder stage. Use a distroless static nonroot runtime. Copy only `/toolbox-server`, `/app/web`, `/app/packs/core/docs.db`, and `/app/packs/core/manifest.json`. Set `USER nonroot:nonroot`, expose `8080`, and use `/toolbox-server` as the entrypoint.

- [ ] **Step 6: Verify**

Run:

```bash
go test ./internal/config ./internal/httpapi -v
docker build -t developer-toolbox:dev .
docker run --rm -p 127.0.0.1:18080:8080 developer-toolbox:dev
```

In a second terminal, run `curl -fsS http://127.0.0.1:18080/healthz`. Expected response: `{"status":"ok"}`.

- [ ] **Step 7: Commit**

```bash
git add cmd internal Dockerfile compose.yaml .dockerignore
git commit -m "feat: add hardened toolbox server runtime"
```

## Task 3: Implement immutable documentation packs and SQLite FTS5 search

**Files:**

- Create: `internal/docs/model.go`
- Create: `internal/docs/searcher.go`
- Create: `internal/docs/sqlite_searcher.go`
- Create: `internal/docs/sqlite_searcher_test.go`
- Create: `internal/docs/pack.go`
- Create: `internal/docs/pack_test.go`
- Create: `packs/core/manifest.json`
- Create: `packs/core/create.sql`
- Create: `packs/core/seed.sql`
- Create: `scripts/build-core-pack.sh`

**Interfaces:**

- Produces `type SearchResult struct { ID, Title, URL, Snippet, Source string; Score float64 }`.
- Produces `type Searcher interface { Search(context.Context, Query) ([]SearchResult, error); Document(context.Context, string) (Document, error); Ready() error }`.
- Produces `func OpenReadOnly(path string) (*SQLiteSearcher, error)`.
- `Query` has `Text string`, `Source string`, `Limit int`; reject text longer than 200 Unicode code points and limit outside 1–50.

- [ ] **Step 1: Write failing search tests using a temporary FTS5 database**

Create three fixtures: a TypeScript interface page, an ASP.NET Core dependency injection page, and a Git rebase page. Assert that `Search(Query{Text: "dependency injection", Limit: 10})` puts the ASP.NET page first; source filter `git` returns only the Git page; empty and oversize queries return validation errors; a literal FTS syntax error is converted to a 400-safe domain error, not returned verbatim.

Run:

```bash
go test ./internal/docs -run TestSQLiteSearcher -v
```

Expected: FAIL because the searcher is absent.

- [ ] **Step 2: Define the pack schema**

Use these tables:

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  body_html TEXT NOT NULL,
  attribution TEXT NOT NULL
);
CREATE VIRTUAL TABLE document_fts USING fts5(
  title, headings, body, tags,
  content='documents', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
```

Maintain FTS external-content triggers in `create.sql`. Seed a small copyright-safe sample corpus used only for tests and smoke demonstrations; real pack ingestion is a separate content-governance task.

- [ ] **Step 3: Implement safe FTS query construction**

Normalize whitespace, split into quoted safe tokens, and join with `AND`; never pass raw FTS operators from users in v1. Execute a parameterized query using `MATCH ?`, filter source through a parameter, order by `bm25(document_fts, 8.0, 4.0, 1.0, 2.0)`, and use `snippet(document_fts, 2, '<mark>', '</mark>', '…', 16)`.

- [ ] **Step 4: Write failing pack-manifest validation tests**

Test that `ValidatePack(path)` rejects a missing manifest, malformed SHA-256 string, missing source-license field, a docs DB checksum mismatch, and a writable database file. Test one valid pack fixture.

- [ ] **Step 5: Implement manifest validation**

Use this manifest shape:

```json
{
  "id": "core",
  "version": "0.1.0",
  "database": "docs.db",
  "sha256": "<64 lowercase hexadecimal characters>",
  "sources": [{"name":"...","url":"...","license":"...","attribution":"..."}]
}
```

Validate before opening SQLite. Use `mode=ro&immutable=1` in the SQLite DSN. Do not silently rebuild or modify a pack at runtime.

- [ ] **Step 6: Add the REST endpoints**

Extend `internal/httpapi/server.go` with:

```text
GET /api/docs/search?q={text}&source={optional}&limit={optional}
GET /api/docs/{id}
```

Return 400 for validation errors, 404 for unknown documents, 503 for unavailable docs, and generic 500 JSON for unexpected failures. Include no raw SQL/FTS error messages in responses.

- [ ] **Step 7: Verify**

Run:

```bash
go test ./internal/docs ./internal/httpapi -v
go test -race ./internal/docs ./internal/httpapi
```

Expected: PASS with deterministic ranking for the fixture corpus.

- [ ] **Step 8: Commit**

```bash
git add internal/docs internal/httpapi packs/core scripts/build-core-pack.sh
git commit -m "feat: add offline documentation pack search"
```

## Task 4: Create the web application shell and local workspace persistence

**Files:**

- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/src/app/routes.tsx`
- Create: `apps/web/src/app/layout/AppLayout.tsx`
- Create: `apps/web/src/app/layout/Navigation.tsx`
- Create: `apps/web/src/app/styles/global.css`
- Create: `apps/web/src/platform/storage/workspaceStore.ts`
- Create: `apps/web/src/platform/storage/workspaceStore.test.ts`
- Create: `apps/web/src/platform/http/toolboxClient.ts`
- Create: `apps/web/src/platform/http/toolboxClient.test.ts`

**Interfaces:**

- Produces `WorkspaceStore.get<T>(key: string): Promise<T | undefined>` and `WorkspaceStore.set<T>(key: string, value: T): Promise<void>` backed by IndexedDB.
- Produces `ToolboxClient.searchDocs(query: DocsSearchQuery): Promise<DocsSearchResult[]>`.
- Produces routes `/`, `/docs`, `/data`, `/regex`, `/text`, and `/code-image`.

- [ ] **Step 1: Write failing store tests**

Use `fake-indexeddb` to test a round trip, overwrite, and deletion. Assert JSON values are namespaced under `toolbox/v1/` and that an IndexedDB failure returns a typed `StorageUnavailableError` rather than silently losing the draft.

Run:

```bash
pnpm --filter @toolbox/web test -- workspaceStore
```

Expected: FAIL because `workspaceStore.ts` does not exist.

- [ ] **Step 2: Implement the application shell**

Create an accessible `<nav aria-label="Tool navigation">` with six routes. Render an application title, offline status indicator, keyboard-visible focus style, and a skip link. Use route-level `lazy` imports from `preact/compat` for every module except the dashboard.

- [ ] **Step 3: Implement the client contract**

Use `fetch` only against same-origin `/api`. Define:

```ts
export type DocsSearchQuery = { text: string; source?: string; limit?: number };
export type DocsSearchResult = { id: string; title: string; url: string; snippet: string; source: string; score: number };
```

Set an `AbortController` timeout of 5 seconds. Convert non-2xx responses into `ToolboxApiError` with a user-safe message and status only.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @toolbox/web test
pnpm --filter @toolbox/web build
```

Expected: PASS and the build manifest shows each tool route in an independent chunk.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/package.json
git commit -m "feat: add toolbox application shell and local workspace"
```

## Task 5: Deliver the documentation browser UI

**Files:**

- Create: `apps/web/src/modules/docs/DocsPage.tsx`
- Create: `apps/web/src/modules/docs/DocsSearchBox.tsx`
- Create: `apps/web/src/modules/docs/DocsResults.tsx`
- Create: `apps/web/src/modules/docs/DocumentView.tsx`
- Create: `apps/web/src/modules/docs/docsPage.test.tsx`
- Create: `apps/web/src/modules/docs/docsPage.e2e.ts`

**Interfaces:**

- Consumes `ToolboxClient.searchDocs` and `WorkspaceStore` from Task 4.
- Produces query persistence key `toolbox/v1/docs/recent-query` and result permalinks `/docs?id={documentId}`.

- [ ] **Step 1: Write failing component tests**

Mock the API client. Test that entering “dependency injection” invokes the client after 200 ms debounce; pressing Enter invokes immediately; a result renders source/title/highlighted snippet; Escape clears the search; an API error is announced through `role="alert"`; no `dangerouslySetInnerHTML` is used for untrusted document body.

- [ ] **Step 2: Implement search and result interaction**

Use a controlled input, `aria-controls`, a labeled result count, and keyboard selection with ArrowUp/ArrowDown/Enter. Render only server-provided `<mark>` tags from a sanitizer allowlist; render document body as sanitized HTML using a restrictive allowlist (`p`, `pre`, `code`, headings, lists, tables, `a[href]`). Strip style, script, iframe, form, and event attributes.

- [ ] **Step 3: Add an end-to-end test**

Seed the core pack. In Playwright, open `/docs`, search for “dependency injection”, open the first result, refresh, and assert the document ID remains in the URL. Use browser context offline mode after initial page load and assert a clear “documentation search requires the local container” message instead of a browser exception.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @toolbox/web test -- docsPage
pnpm --filter @toolbox/web e2e -- docsPage.e2e.ts
```

Expected: PASS with keyboard and error-state coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/docs
git commit -m "feat: add offline documentation browser"
```

## Task 6: Build the structured-data workbench

**Files:**

- Create: `apps/web/src/modules/data/DataPage.tsx`
- Create: `apps/web/src/modules/data/format.ts`
- Create: `apps/web/src/modules/data/format.test.ts`
- Create: `apps/web/src/modules/data/convert.ts`
- Create: `apps/web/src/modules/data/schema.ts`
- Create: `apps/web/src/modules/data/dataWorker.ts`
- Create: `apps/web/src/modules/data/DataTree.tsx`
- Create: `apps/web/src/modules/data/dataPage.test.tsx`

**Interfaces:**

- Produces `parseInput(input: string, format: DataFormat): ParseResult` for `json | yaml | xml | csv`.
- Produces `serialize(value: unknown, format: DataFormat): string`.
- Produces `inferJsonSchema(value: unknown): JsonSchema202012`.
- Worker messages are `{ id: string; operation: 'parse' | 'format' | 'convert' | 'infer-schema'; payload: unknown }`.

- [ ] **Step 1: Write failing parser and conversion tests**

Test valid/invalid JSON, YAML aliases disabled, XML entities disabled, CSV with quoted commas, circular/unsupported values, JSON-to-YAML conversion, and deterministic formatting. Test schema inference for nullable mixed arrays, empty arrays, integers vs numbers, nested objects, and required properties.

- [ ] **Step 2: Implement strict parsing limits**

Set 5 MB default input limit and 50,000-node graph/tree limit. Reject YAML custom tags, anchors, aliases, and function-like constructors. Configure XML parsing to disallow DTD/external entities. Use a Web Worker for parse, conversion, and schema inference; cancel a previous job when a newer request starts.

- [ ] **Step 3: Implement the UI**

Provide source-format selector, editor, format/validate/convert controls, output panel, expandable virtualized tree, schema panel, and copy/download buttons. Persist only the latest draft in IndexedDB after a 500 ms debounce. Show byte count and parser/node-limit errors prominently.

- [ ] **Step 4: Add UI tests**

Test invalid JSON messaging, conversion to YAML, copy success feedback, schema view keyboard navigation, and worker error recovery. Mock the worker protocol rather than running parsing on the main UI test thread.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @toolbox/web test -- format dataPage
pnpm --filter @toolbox/web build
```

Expected: PASS; inspect Vite output to confirm the data worker is emitted as a separate asset.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/data
git commit -m "feat: add local structured data workbench"
```

## Task 7: Build regex and text utilities with redacted exports

**Files:**

- Create: `apps/web/src/modules/regex/RegexPage.tsx`
- Create: `apps/web/src/modules/regex/regexEngine.ts`
- Create: `apps/web/src/modules/regex/regexEngine.test.ts`
- Create: `apps/web/src/modules/text/TextPage.tsx`
- Create: `apps/web/src/modules/text/transforms.ts`
- Create: `apps/web/src/modules/text/transforms.test.ts`
- Create: `apps/web/src/platform/security/redaction.ts`
- Create: `apps/web/src/platform/security/redaction.test.ts`
- Create: `apps/web/src/platform/export/download.ts`

**Interfaces:**

- Produces `evaluateRegex(pattern, flags, input): RegexEvaluation` using the JavaScript engine in v1.
- Produces `applyTransform(input, transform: TextTransform): string`.
- Produces `redactSensitiveText(input: string): RedactionResult`.
- Produces `downloadText(filename: string, text: string): void` only after redaction preview approval.

- [ ] **Step 1: Write failing regex tests**

Test global/non-global match behavior, named captures, zero-length match loop protection, invalid pattern messages, multiline flag, replacement preview, and a 100,000-character input. Assert the engine never runs user-provided code.

- [ ] **Step 2: Implement the regex module**

Support only explicitly labeled ECMAScript regex in this phase. Display full match, index, groups, named groups, replace preview, and saved test cases. Do not label it PCRE or .NET compatible. Enforce 200-character pattern and 1 MB test-input limits.

- [ ] **Step 3: Write failing text and redaction tests**

Test Base64 URL-safe encoding/decoding, URL encoding, HTML escape/unescape, sort/deduplicate lines, case conversion, SHA-256 hash, UUID format, and Unix-time conversion. Test redaction for `Authorization: Bearer`, `password=`, `api_key=`, `sk-`, `ghp_`, and connection strings; assert redaction preserves surrounding useful text.

- [ ] **Step 4: Implement utilities and download control**

Use the Web Crypto API for SHA-256. Do not use a server endpoint. Before download, render the redacted output and require a user confirmation when redactions occurred; provide “download original” only as an explicit second confirmation that states the file may contain secrets.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @toolbox/web test -- regexEngine transforms redaction
```

Expected: PASS with all listed secret classes detected.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/regex apps/web/src/modules/text apps/web/src/platform/security apps/web/src/platform/export
git commit -m "feat: add regex text and safe export utilities"
```

## Task 8: Add code-image export and enforce performance budgets

**Files:**

- Create: `apps/web/src/modules/code-image/CodeImagePage.tsx`
- Create: `apps/web/src/modules/code-image/renderCodeImage.ts`
- Create: `apps/web/src/modules/code-image/renderCodeImage.test.ts`
- Create: `scripts/check-budgets.mjs`
- Create: `scripts/measure-runtime.sh`
- Modify: `apps/web/vite.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces `renderCodeImage(options: CodeImageOptions): Promise<Blob>`.
- `CodeImageOptions` includes `code`, `language`, `theme`, `background`, `lineNumbers`, `padding`, and `format: 'png' | 'svg'`.
- Produces CI artifacts `artifacts/bundle-budget.json` and `artifacts/runtime-metrics.json`.

- [ ] **Step 1: Write failing renderer tests**

Test that code containing `<script>` renders as text, not an executable element; PNG blob has `image/png`; SVG blob has `image/svg+xml`; line-number toggle changes output; unknown language falls back to plaintext; inputs beyond 200 KB are rejected.

- [ ] **Step 2: Implement a local renderer**

Use a client-only syntax highlighter with a deliberately small initial language set: plaintext, JSON, TypeScript, JavaScript, C#, SQL, Bash, XML, YAML, and Markdown. Dynamically import language grammars. Generate SVG from escaped text nodes and rasterize only when PNG is requested.

- [ ] **Step 3: Implement budgets**

`check-budgets.mjs` must read Vite’s manifest and fail when initial JS gzip exceeds 250 KB, any non-lazy tool chunk exceeds 50 KB gzip, or total CSS gzip exceeds 50 KB. `measure-runtime.sh` must start the built image, wait for `/readyz`, collect startup seconds and `docker stats --no-stream` memory, and fail above the global limits.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @toolbox/web test -- renderCodeImage
pnpm build
node scripts/check-budgets.mjs
docker build -t developer-toolbox:dev .
./scripts/measure-runtime.sh developer-toolbox:dev
```

Expected: PASS and generated JSON artifacts show values within global constraints.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/code-image scripts apps/web/vite.config.ts .github/workflows/ci.yml
git commit -m "feat: add local code image export and performance budgets"
```

## Task 9: Complete end-to-end acceptance, security evidence, and release documentation

**Files:**

- Create: `apps/web/src/test/smoke.e2e.ts`
- Create: `apps/web/src/test/offline.e2e.ts`
- Create: `docs/operations/local-deployment.md`
- Create: `docs/operations/content-packs.md`
- Create: `docs/security/threat-model-phase-1.md`
- Create: `docs/legal/third-party-notices.md`
- Create: `docs/release/phase-1-acceptance.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces a documented localhost run command, optional `TOOLBOX_BIND_ADDRESS=0.0.0.0` team-mode warning, volume mount format for approved packs, and backup statement that phase 1 contains no server-side user data.
- Produces an acceptance checklist with measured size/startup/RSS values, all test results, SBOM artifact location, and approved source/attribution list.

- [ ] **Step 1: Write end-to-end scenarios**

Implement these Playwright tests against the Docker image:

1. Health and readiness endpoints respond; root page loads with CSP.
2. Docs search finds the seed TypeScript page and opens it.
3. JSON input formats and converts to YAML without a network request.
4. Regex finds named capture groups and shows replacement preview.
5. A bearer token in export text triggers redaction confirmation.
6. Code image SVG exports without executing markup in the code sample.
7. `TOOLBOX_BIND_ADDRESS` defaults to loopback in compose configuration.

- [ ] **Step 2: Write the phase-1 threat model**

Document assets, trust boundaries, threats, controls, residual risks, and tests. Include: pasted-secret exposure, malicious documentation HTML, malicious archive, denial of service from huge input, browser XSS, SSRF prevention by absence of API request features, unsafe content-pack licensing, and shared-host binding misconfiguration.

- [ ] **Step 3: Run complete verification**

Run:

```bash
pnpm lint
pnpm test
go test -race ./...
pnpm build
node scripts/check-budgets.mjs
docker build -t developer-toolbox:phase1 .
pnpm e2e
./scripts/measure-runtime.sh developer-toolbox:phase1
syft developer-toolbox:phase1 -o spdx-json > artifacts/sbom.spdx.json
trivy image --exit-code 1 --severity HIGH,CRITICAL developer-toolbox:phase1
```

Expected: all commands exit 0. Record fresh measured values in `docs/release/phase-1-acceptance.md`; do not copy expected targets as results.

- [ ] **Step 4: Review source and license evidence**

Confirm each shipped package and every documentation source appears in the notice/provenance records. Confirm no third-party documentation content was included until its redistribution right and attribution obligations were recorded.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/test docs README.md .github/workflows/ci.yml artifacts
git commit -m "docs: complete phase one release evidence"
```

## Plan self-review

| White-paper requirement | Plan coverage |
| --- | --- |
| One container, local-first | Tasks 1–2 |
| SQLite FTS5 docs search and content packs | Task 3 |
| Browser-local data | Task 4 |
| Core documentation and structured-data modules | Tasks 5–6 |
| Regex, text, code-image utilities | Tasks 7–8 |
| Security/privacy/pack governance | Tasks 2–3, 7, 9 |
| Size, startup, memory evidence | Tasks 1, 8, 9 |
| Offline and acceptance evidence | Task 9 |

No phase-2 API client, whiteboard, Mermaid, or learning module is included. Those remain independent plans after phase-1 measurements and user feedback validate the foundation.
