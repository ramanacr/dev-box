# Developer Toolbox — Specification Alignment Audit

**Date:** 2026-09-12
> **Status: findings addressed.** This document is the audit as it was taken, kept
> unedited as the record of what was found. What was done about each item — plus the
> further defects that surfaced during the work, including a complete authentication
> bypass in team mode — is recorded in
> [remediation-acceptance.md](remediation-acceptance.md).

**Method:** Cross-inspection of `developer-toolbox-white-paper.md`, the four phase implementation plans, and the four phase acceptance documents against the actual source tree, plus fresh execution of every available quality gate and live inspection of the running container.

## Evidence collected

| Gate | Command | Result |
| --- | --- | --- |
| Go vet | `go vet ./...` | Clean, no findings |
| Go tests | `go test ./...` | 9/9 packages `ok`, 30 test functions |
| TypeScript | `tsc --noEmit` | 0 errors |
| Web unit tests | `vitest run` | 24 files, **104 tests passed** |
| Web build | `vite build` | Success, 21.4 s |
| Live container | `docker ps` + HTTP probes | `developer-toolbox:dev` up, `127.0.0.1:8080` |
| Health / ready | `curl /healthz`, `/readyz` | `{"status":"ok"}`, `{"status":"ready"}` |
| Security headers | `curl -i /healthz` | CSP, `nosniff`, `no-referrer`, `no-store` all present and exact |
| FTS5 search | `curl "/api/docs/search?q=dependency+injection"` | Correct hit, `<mark>` highlights, BM25 score `-3.2357` |
| Pack integrity | `sha256sum packs/core/docs.db` | Matches `manifest.json` exactly |
| CSP style probe | In-browser `getComputedStyle` on an injected `style` attribute | **`style` attributes are blocked** |

The existing test suites are real and genuinely green. The problem is not broken tests — it is **scope that was declared complete but is unreachable, unwired, or absent**, and one cross-cutting rendering defect the test suite cannot see because jsdom does not enforce CSP.

---

## Aligned — genuinely delivered and verified

| Area | Status | Notes |
| --- | --- | --- |
| Monorepo, pnpm workspace, strict TS, Go module | Aligned | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` all enabled; `tsc --noEmit` clean |
| Go server shell, config loading, health/ready endpoints | Aligned | Defaults to `127.0.0.1:8080`; `net.JoinHostPort` used at the boundary as specified |
| Security headers and CSP | Aligned (header itself) | Emitted byte-for-byte as the plan specifies |
| SQLite FTS5 documentation search | Aligned, strong | BM25 column weighting, `snippet()` highlighting, source filter, parameterised `MATCH`, safe token construction, `mode=ro&immutable=1` |
| Content-pack manifest validation + SHA-256 | Aligned | Checksum verified to match the shipped database |
| User doc uploads + federated multi-searcher | Aligned (beyond plan) | Writable WAL store, upload/delete API |
| Documentation browser UI, sanitizer | Aligned | Restrictive allowlist sanitizer with tests |
| Structured-data workbench | Aligned | JSON/YAML/XML/CSV parse, format, convert, schema infer, Web Worker, node/byte limits |
| Regex workbench | Aligned | ECMAScript only and correctly labelled as such |
| Text transforms + secret redaction + guarded download | Aligned | All six secret classes from the plan detected; confirmation dialog verified by E2E |
| Code-image exporter | Aligned | Local SVG/PNG, markup rendered as text |
| API workbench | Aligned, strong | OpenAPI worker parse, remote `$ref` rejection, loopback/RFC1918/DNS-suffix policy, first-use host confirmation, session-only environments, Ajv 2020 contract validation, cURL + C# examples |
| Diagram studio | Aligned | Mermaid `securityLevel: 'strict'` with a test proving `click … href` is rejected; canvas whiteboard; IndexedDB persistence |
| Git learning sandbox | Aligned | Pure reducer covering commit/branch/switch/merge/rebase/reset/revert/cherry-pick, 9 tests, 6 levels |
| Algorithm visualizer | Partially aligned | 4 of the white paper's 7 generators (see gap P2-6) |
| Theme switcher | Aligned | Light/dark/system |
| Performance budgets | Aligned | Image 30.4 MB vs 150 MB budget; initial JS 11.8 KB gzip vs 250 KB |
| Documentation set (ADRs, threat models, ops guides) | Aligned in form | Content accuracy issues noted in P1-7 |

---

## Not aligned

### P0 — declared complete, but not functional in the shipped product

**P0-1. The CSP silently strips the majority of the UI's styling.**
The server sends `style-src 'self'` with no `'unsafe-inline'`, exactly as the plan mandates. The UI contains **459 inline `style={{…}}` usages across 26 files**. Inline `style` attributes are governed by `style-src` when `style-src-attr` is unset, so every one of them is dropped by the browser. Proven in the live container: an injected `style="text-align:center;padding:40px"` computed to `text-align: start; padding: 0px`. jsdom does not enforce CSP, so 104 passing unit tests cannot detect this. The spec mandates both the strict CSP and the styling, so the UI must stop depending on inline style attributes.

**P0-2. Team mode can never be enabled.**
`internal/httpapi/server.go` hardcodes `NewTeamHandler(team.Config{Enabled: false}, nil)`. `team.LoadConfig`, which reads `TOOLBOX_TEAM_MODE`, is never called by the server or `main.go`, and `config.Config` carries no team fields at all. The `team` compose profile, the OIDC settings, `workspace.db`, the RBAC service, and the audit trail are therefore all inert. Phase 3's "Complete" claim holds only at the library level.

**P0-3. Team UI is orphaned.** `WorkspacePage.tsx` and `AdminPage.tsx` are referenced by nothing except their own test file — no route in `routes.tsx`, no navigation entry. Unreachable by any user.

**P0-4. Phase 4 is entirely unwired.** `internal/extensions`, `internal/ai`, and `internal/search` are imported by nothing outside their own tests. The registry is never constructed, no concrete `Extension` is ever implemented or registered, and `TOOLBOX_FEATURE_<NAME>` flags are never parsed in `config.Load` despite the plan requiring exactly that. `/api/extensions/{name}/health` can never respond.

**P0-5. `internal/collab/websocket.go` is absent.** Required by Phase 4 Task 3. There is no WebSocket route, so the room hub is unreachable and the frontend `collaborationClient` has no server to talk to.

**P0-6. The MCP server is not an MCP server.** `packages/mcp-server/src/index.ts` — the entry point the plan requires — does not exist. There is no `@modelcontextprotocol/sdk` dependency and no stdio transport. The package contains two bare functions and a test. No MCP client can connect to it.

**P0-7. The VS Code extension is not an extension.** `packages/vscode/package.json` is missing entirely, so the directory is not even a workspace member. There is no extension manifest, no `contributes.commands`, no `activationEvents`, and the code defines its own fake `VSCodeContext` rather than using the `vscode` API. It cannot be installed. `extension.test.ts` is also absent.

**P0-8. The documented `docker run` quickstart cannot be reached.** The Dockerfile bakes `ENV TOOLBOX_BIND_ADDRESS=127.0.0.1`, which is the *container's* loopback. `docker run -p 18080:8080 developer-toolbox:dev` — the exact command in Phase 1 Task 2 Step 6 — is unreachable from the host. Only `compose.yaml` and `measure-runtime.sh` work, because both override the variable to `0.0.0.0`.

**P0-9. `AiConsentDialog` is orphaned.** Built and tested, routed nowhere, so the Phase 4 consent UX is not actually part of the product.

### P1 — governance and verification gaps

**P1-1.** Root `pnpm lint` / `test` / `build` omit Go entirely, contradicting the script contract fixed in Phase 1 Task 1 Step 2 (`… && go vet ./...`, `… && go test ./...`, `… && go build ./cmd/toolbox-server`).

**P1-2.** CI never runs Playwright. `playwright.config.ts` has no `webServer`, so `pnpm e2e` only works against a hand-started container. Phase 1 Task 1 Step 3 requires a Playwright smoke test after `docker compose up` in CI.

**P1-3.** Required test files absent: `docsPage.test.tsx`, `docsPage.e2e.ts`, `dataPage.test.tsx`, `apiPage.e2e.ts`, `packages/vscode/src/extension.test.ts`.

**P1-4.** Source maps are emitted into `dist/` and therefore copied into the Docker image, publishing full application source and inflating the image.

**P1-5.** `index.html` references `/favicon.svg`, which does not exist anywhere in the repo — a guaranteed 404 on every page load.

**P1-6.** `packs/learning/manifest.json` does not use the mandated manifest schema — it has no `id`, `database`, `sha256`, or `sources[]` — so `docs.ValidatePack` would reject it. The learning pack is not a validatable pack.

**P1-7.** The Phase 4 gate ADRs record aspirational rather than measured evidence. ADR 0003 states "Estimated search corpus: 250,000+ entries"; Phase 4 Task 2 Step 1 requires a *demonstrated* corpus ≥ 250,000 indexed sections and a *measured* p95 FTS5 latency > 250 ms before the adapter may be written. The shipped core pack holds a handful of documents. The delivery standard is explicit: "Performance claim — label as a target until measured." The same applies to ADR 0004's collaboration gate (three active teams).

**P1-8.** `apps/web/src/modules/integrations/{searchDocs,transformData}.ts` duplicate `packages/mcp-server/src/tools/*`. The web copies are the ones the test suite actually exercises, so the package's real code is untested.

**P1-9.** Excalidraw was replaced by a hand-rolled canvas. This is a defensible call for bundle size, but the white paper and Phase 2 plan both name `@excalidraw/excalidraw`, and the delivery standard requires "any necessary deviation from the approved plan [be recorded] as an ADR or plan amendment before continuing." No such ADR exists.

### P2 — white-paper scope never carried into any phase plan

The white paper's "Recommended first-release modules" section commits to modules that no phase plan schedules and no code implements:

| White-paper item | Status |
| --- | --- |
| A-2 **Command Reference** — shell command parser, option explanations, safe-command warnings. Designated a "Core module, independently implemented" | Absent |
| A-3 Standards Shelf — curated offline references | Absent |
| B-4 Type generation (TypeScript, C#, Java, Kotlin, Go, Python, Rust) | Absent |
| B-5 `jq` / JSONPath / JMESPath panes with saved queries | Absent |
| B-6 JWT decoder and inspector (decode only) | Absent |
| D-2 gzip encode/decode | Absent |
| D-3 HMAC, cron visualizer, timezone converter | Absent |
| D-4 Minifier, diff, line sorter/deduplicator | Partial — sort/dedupe present, minify and diff absent |
| D-5 SQL assistant — formatter, dialect-aware linting | Absent |
| E-4 Algorithms: heap, binary search tree, hash-table collision, DFS | Absent (bubble sort, merge sort, BFS, Dijkstra present) |

This is a plan-level misalignment rather than an implementation failure: the phase plans themselves dropped white-paper scope without recording the reduction.

---

## Summary

The foundation is genuinely good. The Go service, FTS5 search, pack governance, API request policy, and redaction work are well built, properly tested, and match their specifications closely. Measured footprint is far inside budget.

The failure mode is consistent: **later phases were delivered as unit-tested libraries and then never connected to the running product**, while acceptance documents recorded them as complete. Phase 3's team mode and all of Phase 4 fall into this category. Separately, one cross-cutting defect — the CSP versus inline styles — degrades the shipped UI in a way the test suite is structurally unable to catch.
