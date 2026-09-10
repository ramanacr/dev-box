# Developer Toolbox (`dev-box`)

A lightweight, offline-capable developer workbench for Docker that consolidates documentation search, structured-data processing, regex inspection, text transforms, and code-image generation into a single secure, local-first containerized application.

## Core Features (Phase 1 & Extensions)

1. **Offline Documentation Search**: Multi-source reference search powered by a read-only SQLite FTS5 database with BM25 relevance ranking, highlighted excerpts, and deep permalinks.
2. **User Document Ingestion & Management**: Drag-and-drop ingestion of Markdown (`.md`), HTML (`.html`), and plain text (`.txt`) files into an isolated, writable SQLite database (`packs/user/user-docs.db`) using WAL mode and FTS5 triggers with instant searchability.
3. **Pack Builder CLI Tool**: Standalone utility (`pnpm pack:build --dir <dir> --name <pack>`) to compile local documentation directories into production-ready SQLite documentation packs with SHA-256 manifests.
4. **Structured Data Workbench**: In-browser formatters, validators, tree viewer, and inter-converters for JSON, YAML, XML, and CSV. Automatic JSON Schema Draft 2020-12 inference.
5. **ECMAScript Regex Workbench**: Live pattern matching with capture group extraction, named group breakdown, and replacement preview.
6. **Developer Utilities**: URL and Base64 encoders/decoders, HTML entity escaping, line sorter and deduplicator, case conversion, Web Crypto SHA-256/SHA-512 hashes, UUID v4 generator, and Unix timestamp converter.
7. **Secret Redaction Engine**: Automatic pattern-based scanning for credentials (tokens, passwords, API keys, database connection strings) before file download.
8. **Code Image Exporter**: Syntax-highlighted code cards with window chrome, whitespace and indentation preservation (`xml:space="preserve"`), tab expansion, and customizable themes, exporting locally to SVG and PNG.

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
