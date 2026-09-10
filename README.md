# Developer Toolbox (`dev-box`)

A lightweight, offline-capable developer workbench for Docker that consolidates documentation search, structured-data processing, regex inspection, text transforms, and code-image generation into a single secure, local-first containerized application.

## Core Features

1. **Offline Documentation Search**: Multi-source reference search powered by a read-only SQLite FTS5 database with BM25 relevance ranking, highlighted excerpts, and deep permalinks.
2. **User Document Ingestion & Management**: Drag-and-drop ingestion of Markdown (`.md`), HTML (`.html`), and plain text (`.txt`) files into an isolated, writable SQLite database (`packs/user/user-docs.db`) using WAL mode and FTS5 triggers with instant searchability.
3. **Pack Builder CLI Tool**: Standalone utility (`pnpm pack:build --dir <dir> --name <pack>`) to compile local documentation directories into production-ready SQLite documentation packs with SHA-256 manifests.
4. **Guarded API Workbench**:
   - Client-side OpenAPI 3.0/3.1 and Swagger 2.0 parser with off-thread Web Worker processing, local `$ref` pointer dereferencing, and 5MB payload limit.
   - Strict target policy permitting loopback (`127.0.0.1`, `localhost`, `::1`), RFC1918 private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and approved private DNS suffixes (`.local`, `.internal`, `.test`); first-use host confirmation dialog; public endpoints blocked by default.
   - Session-only memory environments (`{{variable}}`), no persistence of secrets, auto-clearing on tab refresh, sensitive headers redacted (`authorization`, `cookie` -> `••••`).
   - In-browser execution via `fetch()`, 30s timeout, response timing, binary handling, and Ajv 2020 contract validation.
   - cURL and C# `HttpClient` code generator.
5. **Offline Diagram Studio**:
   - Mermaid diagram editor with strict security mode (`securityLevel: 'strict'`) preventing DOM/XSS script execution or external link clicks (`click ... href`), template snippets (flowchart, sequence, class, ER), and SVG/PNG local export.
   - Excalidraw-style offline whiteboard canvas with drawing tools (rect, ellipse, arrow, freedraw), color picker, `.excalidraw` JSON import/export, and PNG export.
   - Local workspace persistence via IndexedDB (`toolbox/v1/diagrams/`).
6. **Structured Data Workbench**: In-browser formatters, validators, tree viewer, and inter-converters for JSON, YAML, XML, and CSV. Automatic JSON Schema Draft 2020-12 inference.
7. **ECMAScript Regex Workbench**: Live pattern matching with capture group extraction, named group breakdown, and replacement preview.
8. **Developer Utilities**: URL and Base64 encoders/decoders, HTML entity escaping, line sorter and deduplicator, case conversion, Web Crypto SHA-256/SHA-512 hashes, UUID v4 generator, and Unix timestamp converter.
9. **Secret Redaction Engine**: Automatic pattern-based scanning for credentials (tokens, passwords, API keys, database connection strings) before file download.
10. **Code Image Exporter**: Syntax-highlighted code cards with window chrome, whitespace and indentation preservation (`xml:space="preserve"`), tab expansion, and customizable themes, exporting locally to SVG and PNG.

## Quick Start

### Running with Docker Compose

```bash
docker compose up -d
```
Navigate to [http://127.0.0.1:8080](http://127.0.0.1:8080).

### Local Development

Prerequisites: Node.js 22+, pnpm 12+, Go 1.24+

```bash
# Install dependencies
pnpm install

# Run frontend tests
pnpm test

# Run Go backend tests
go test ./...

# Build frontend production assets
pnpm build

# Verify bundle budgets
node scripts/check-budgets.mjs
```

## Security & Architecture

- **Local-First & Private**: Data processing is 100% client-side inside the browser. No pasted snippets or documents leave the machine.
- **Loopback Binding**: Defaults to `127.0.0.1:8080` to prevent accidental network exposure.
- **Strict Content Security Policy**: CSP headers enforced on all responses (`default-src 'self'`).
- **Immutable Documentation Packs**: Read-only SQLite databases verified with SHA-256 cryptographic manifests.

## License

MIT License. See [LICENSE](LICENSE) and [Third-Party Notices](docs/legal/third-party-notices.md).
