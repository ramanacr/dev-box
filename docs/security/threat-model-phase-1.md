# Threat Model: Developer Toolbox (Phase 1 + User Document Ingestion)

## Assets
1. **User Data**: Confidential source code, pasted payloads, configurations, and database credentials handled by developer workbench tools.
2. **Local Machine / Host**: The runtime environment hosting the Docker container or local server.
3. **Documentation Content**: SQLite FTS5 database containing offline documentation and user-uploaded reference files.

## Trust Boundaries
- **Browser Runtime**: Execution context for user inputs, formatting, regex evaluation, schema inference, and text transforms.
- **Server Boundary**: Read-only Go HTTP service serving static files, health checks, and SQLite documentation search.
- **Upload Boundary**: Ingestion of arbitrary `.md`, `.txt`, and `.html` files into the isolated `user-docs.db`.
- **Network Boundary**: Outbound connections (strictly disabled; all processing and storage is local).

## Threats, Mitigations, and Verification

| Threat | Risk Level | Mitigation & Technical Controls | Verification Method |
| --- | --- | --- | --- |
| **Accidental Secret Disclosure in Exports** | High | Pattern-based redaction engine intercepts download actions and requires explicit user confirmation if secrets (bearer tokens, API keys, passwords, connection strings) are detected. | Automated Vitest in `redaction.test.ts` |
| **XSS via Uploaded Document Content** | High | Strict HTML sanitization allowlist (`sanitize.ts`) strips scripts, iframes, styles, and javascript: URLs before rendering documentation body or snippet marks. Strict CSP header applied to all HTTP responses. | Automated Vitest in `sanitize.test.ts` |
| **Malicious File Upload / Path Traversal** | High | Upload endpoint validates MIME type/extension (`.md`, `.txt`, `.html`), rejects files > 10 MB, and generates sanitized internal IDs (`user/<slug>-<uuid>`) instead of using raw disk file paths. | Backend unit test in `user_store_test.go` |
| **Storage Denial of Service via Huge Input** | Medium | Strict limits: 10 MB per uploaded document, 5 MB on structured data, 1 MB on regex input, 200 characters on regex patterns, 200 KB on code images, 50,000 nodes on tree renderers. | Unit tests in `format.test.ts` and `user_store_test.go` |
| **Database Write Contention / Corruption** | Medium | User documentation is isolated in `user-docs.db` running in WAL mode (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`), leaving the core system pack immutable (`mode=ro&immutable=1`). | Multi-searcher concurrent read/write tests |
| **Server-Side Request Forgery (SSRF)** | Low | Phase 1 scope explicitly omits outbound HTTP request clients or proxy endpoints. The server only performs read/write operations against local SQLite files. | Architecture invariant and route unit tests |
| **Insecure Host Binding** | Medium | Default server configuration binds exclusively to `127.0.0.1`. Listening on `0.0.0.0` requires explicit environment variable `TOOLBOX_BIND_ADDRESS`. | Automated Go test `TestLoad_DefaultsToLoopback` |
