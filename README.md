# Developer Toolbox (`dev-box`)

A lightweight, offline-capable developer workbench for Docker. It consolidates
documentation search, command explanation, structured-data processing, JSON querying,
type generation, regex inspection, text transforms, API contract testing, diagramming
and interactive learning into a single local-first container.

Everything you paste stays in your browser unless you explicitly send it somewhere.
The container is **17 MB**, idles at **~2.6 MiB** of RAM, and is ready in **under two
seconds**.

## Tools

### Documentation and reference

- **Doc Search** — multi-source search over read-only SQLite FTS5 packs with BM25
  ranking, highlighted excerpts and deep permalinks.
- **User document ingestion** — drag and drop `.md`, `.html` or `.txt` into an
  isolated writable SQLite store (WAL mode, FTS5 triggers) and search it immediately.
- **Pack builder CLI** — `pnpm pack:build --dir <dir> --name <pack>` compiles a
  documentation directory into a pack with a SHA-256 manifest.
- **Command Reference** — paste a shell command and see what each token does, with
  warnings for destructive or protection-disabling flags (`rm -rf`, `chmod 777`,
  `curl … | sudo bash`, `git push --force`, `--insecure`). Nothing is executed and no
  shell is invoked. Every description is independently authored; no manual pages are
  redistributed, and an unrecognised command is reported as unrecognised rather than
  guessed at.

### Structured data

- **Data Workbench** — format, validate, convert and tree-view JSON, YAML, XML and
  CSV, with JSON Schema 2020-12 inference. Parsing runs in a Web Worker with byte and
  node limits; YAML anchors, aliases and custom tags and XML external entities are
  refused.
- **JSON Query** — JSONPath with child, index, negative index, union, slice with
  step, wildcard, recursive descent and comparison/presence filters. Filter
  expressions are parsed into a typed form and never evaluated as code.
- **Type Generator** — turn a JSON sample into declarations for TypeScript, C#, Java,
  Kotlin, Go, Python and Rust. Optional and nullable fields are inferred by merging
  the shapes actually observed.
- **JWT Inspector** — decode a token's header, claims and timing. **Decode only:** a
  signed token's payload is base64url-encoded, not encrypted, and this tool makes no
  claim about authenticity. Timing claims are checked because they can be, without a
  key.

### API and diagrams

- **API Workbench** — client-side OpenAPI 3.0/3.1 and Swagger 2.0 parsing in a Web
  Worker, with local `$ref` dereferencing, remote `$ref` rejection and a 5 MB cap.
  Requests are permitted only to loopback, RFC1918 private IPv4 and approved private
  DNS suffixes, with a confirmation dialog on first use of each host; public hosts are
  blocked by default. Environments live in session memory only and clear on refresh;
  `authorization` and `cookie` render as `••••`. Responses are validated against the
  contract with Ajv 2020. Generates cURL and C# `HttpClient` snippets.
- **Diagram Studio** — Mermaid with `securityLevel: 'strict'`, plus a local
  whiteboard canvas with `.excalidraw` import/export and PNG export. Diagrams persist
  in IndexedDB.

### Utilities and learning

- **Regex Workbench** — ECMAScript only, and labelled as such. Live matching, capture
  and named groups, replacement preview.
- **Text and hashes** — URL and Base64 encode/decode, HTML entity escaping, line
  sort and deduplicate, case conversion, Web Crypto SHA-256/SHA-512, UUID v4, Unix
  timestamp conversion.
- **Secret redaction** — every download is scanned for tokens, passwords, API keys
  and connection strings, with a confirmation preview before the file is written.
- **Code Image Exporter** — syntax-highlighted code cards with window chrome and
  preserved whitespace, exported locally to SVG or PNG.
- **Git Learning Sandbox** — a pure in-browser Git DAG simulation covering commit,
  branch, switch, merge, rebase, reset, revert and cherry-pick, with progressive
  lessons. It never touches the filesystem or runs `git`.
- **Algorithm Visualizer** — step through Bubble Sort, Merge Sort, BFS and Dijkstra
  with an accessible state table alongside the visualisation.
- **Theme switcher** — light, dark and system.

## Quick start

```bash
docker compose up -d
```

Then open [http://127.0.0.1:8080](http://127.0.0.1:8080).

Compose publishes to `127.0.0.1` so the service is not exposed on your network. To
run the image directly:

```bash
docker run --rm -p 127.0.0.1:8080:8080 developer-toolbox:dev
```

The container binds `0.0.0.0` inside its own network namespace; you control exposure
with the port mapping. Publishing to a bare `-p 8080:8080` would expose it on every
interface, so keep the `127.0.0.1:` prefix unless you intend otherwise.

## Local development

Prerequisites: Node.js 22+, pnpm 12+, Go 1.24+.

```bash
pnpm install
```

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm build
```

`lint` and `test` cover both the web application and the Go service. To run the
end-to-end suite (it starts the real Go server itself, so no Docker daemon is
needed):

```bash
pnpm e2e
```

To check the performance budgets:

```bash
pnpm budgets
```

```bash
./scripts/measure-runtime.sh developer-toolbox:dev
```

## Optional features

Everything below is **off by default**. The core image is fully functional with every
flag unset, and that is the configuration CI verifies as its own job.

### Team mode

Shared workspaces with OIDC authentication, RBAC (`viewer`, `editor`, `admin`) and an
audit trail, backed by a writable `workspace.db`. Anonymous localhost mode never
creates that database.

```bash
docker compose --profile team up -d
```

Requires `TOOLBOX_TEAM_MODE=true`, `TOOLBOX_OIDC_ISSUER` and
`TOOLBOX_OIDC_AUDIENCE`; the server refuses to start without them. Sign-in uses the
authorization-code flow with PKCE. See
[docs/operations/team-mode.md](docs/operations/team-mode.md).

### Extensions

| Flag | Effect |
| --- | --- |
| `TOOLBOX_FEATURE_TYPESENSE=true` | Routes search through a Typesense mirror, falling back to FTS5 on any error. Requires `TOOLBOX_TYPESENSE_URL`. |
| `TOOLBOX_FEATURE_COLLABORATION=true` | Authenticated WebSocket relay for shared whiteboards. Requires team mode. |
| `TOOLBOX_FEATURE_AI=true` | Opt-in AI **policy boundary** — evaluates consent, data classification, redaction and token budget. It calls no model. Requires `TOOLBOX_AI_GATEWAY_URL`. |

Each enabled extension exposes `GET /api/extensions/{name}/health`.

**These three have not passed their decision gates.** The code exists so the
interfaces are reviewable and tested, not because the need has been demonstrated. The
gate status for each is recorded honestly in
[docs/adr/](docs/adr/) — see ADRs 0003, 0004 and 0005 — and the flags should stay
unset until those tables are filled in with real measurements.

## Companion packages

Not part of the container.

- **`packages/mcp-server`** — a Model Context Protocol server exposing `search_docs`
  and `transform_data` over stdio, so an assistant on your machine can search your
  offline docs. It only ever addresses a loopback toolbox URL, and exposes neither
  API execution nor environment secrets.
- **`packages/vscode`** — a VS Code extension whose single command opens your
  selection in the local toolbox's doc search via `vscode.env.openExternal`. No
  webview, no telemetry. A non-loopback `developerToolbox.url` is refused.

See [docs/operations/mcp-and-vscode.md](docs/operations/mcp-and-vscode.md).

## Security and architecture

- **Local-first.** Transformation and visualisation happen in the browser. The Go
  service serves content, manages optional shared workspaces, and never proxies
  arbitrary outbound requests — that would make it an SSRF surface.
- **Loopback by default.** The Go binary defaults to `127.0.0.1:8080`; in a container
  exposure is controlled by the port mapping.
- **Restrictive CSP** on every response: `default-src 'self'`, `script-src 'self'`
  with no `unsafe-inline` or `unsafe-eval`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`, and no remote origin permitted for any resource type.
  `style-src` permits inline styles — see
  [ADR 0006](docs/adr/0006-content-security-policy-style-src.md) for why, and what is
  deliberately not relaxed.
- **Immutable content packs.** Read-only SQLite verified against a SHA-256 manifest
  that also records each source's URL, licence and attribution. A writable pack
  database is refused.
- **OIDC tokens are verified, not merely decoded.** Signatures are checked against
  the issuer's JWKS; `alg: none` and symmetric algorithms are rejected, and RSA keys
  below 2048 bits are refused.
- **No telemetry.** Structured stdout logs only, and they never contain query
  strings, request bodies, document text, or tool input.

## Documentation

| Area | Document |
| --- | --- |
| Product and architecture direction | [white paper](docs/ai/developer-toolbox-white-paper.md) |
| How work is proposed, built and accepted | [delivery standard](docs/ai/developer-toolbox-product-delivery-standard.md) |
| Specification alignment audit | [alignment-audit.md](docs/release/alignment-audit.md) |
| Remediation evidence and known gaps | [remediation-acceptance.md](docs/release/remediation-acceptance.md) |
| Architecture decisions | [docs/adr/](docs/adr/) |
| Threat models | [docs/security/](docs/security/) |
| Operations | [docs/operations/](docs/operations/) |

## License

MIT. See [LICENSE](LICENSE) and
[Third-Party Notices](docs/legal/third-party-notices.md).
