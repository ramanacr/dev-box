# Developer Toolbox (`dev-box`)

A lightweight, offline-capable developer workbench for Docker. It consolidates
documentation search, command explanation, structured-data processing, JSON querying,
type generation, regex inspection, text transforms, API contract testing, diagramming
and interactive learning into a single local-first container.

Everything you paste stays in your browser unless you explicitly send it somewhere.
The container is **18.5 MB**, idles at a few MiB of RAM, and is ready in **well
under a second**.

## Tools

### Documentation and reference

- **Doc Search** — offline search over a read-only SQLite FTS5 pack with BM25
  ranking, highlighted excerpts and deep permalinks. The shipped pack holds **51
  documents across 10 sources** — HTTP, OpenAPI, JSON Schema, regular expressions,
  Git, Docker, SQL, TypeScript, ASP.NET Core and Angular — in 296 KB, and measured
  search p95 is **2.84 ms**. Title, headings, body and tags are indexed as separate
  weighted columns, so a query naming a section ranks that document first.
  All pack content is original and MIT-licensed, with each document linking to a
  canonical upstream reference rather than reproducing it.
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
- **SQL Assistant** — format a statement without changing a single token, and review
  it for unbounded writes, `= NULL`, comma joins, string concatenation and
  per-dialect portability across ANSI, PostgreSQL, MySQL, SQL Server and SQLite. No
  driver and no connection code: nothing here can execute a query. Shows the
  parameterised form for your dialect, because that is the actual remedy.
- **Text Diff** — Myers minimal edit script, so a small change in a large file reads
  as a small change. Word-level highlighting inside similar lines, configurable
  context, and unified-patch export.

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
- **Encoding and Time** — gzip compress/decompress via the browser's own
  CompressionStream (and it tells you honestly when compression made the data
  larger), HMAC with a key you supply, and one instant rendered across many IANA
  timezones with daylight saving applied per date.
- **Cron Visualizer** — explains each field, projects the next runs, and warns about
  the traps: day-of-month and day-of-week are OR-ed rather than AND-ed, and day 31
  simply never fires in a short month.
- **Secret redaction** — every download is scanned for tokens, passwords, API keys
  and connection strings, with a confirmation preview before the file is written.
- **Code Image Exporter** — syntax-highlighted code cards with window chrome and
  preserved whitespace, exported locally to SVG or PNG.
- **Git Learning Sandbox** — a pure in-browser Git DAG simulation covering commit,
  branch, switch, merge, rebase, reset, revert and cherry-pick, with progressive
  lessons. It never touches the filesystem or runs `git`.
- **Algorithm Visualizer** — eleven visualizers with an accessible state table
  alongside each: bubble and merge sort; BFS, DFS and Dijkstra; heap build and
  extract drawn as the tree the array represents; BST insert, in-order walk and
  search; and hash tables under separate chaining, linear probing and quadratic
  probing. Every step is an immutable snapshot, so you can step backwards freely.
- **Theme switcher** — light, dark and system. The dark theme is Metallic Radium:
  cement surfaces with a single luminous accent, specified in
  [`docs/design/metallic-radium-theme.md`](docs/design/metallic-radium-theme.md) and
  recorded in [ADR 0008](docs/adr/0008-metallic-radium-dark-theme.md).

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

Prerequisites: Node.js 22+, pnpm 12+, Go 1.27+.

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

### Operating it

The service reports on itself and can be throttled and audited without a rebuild.

| Variable | Default | Effect |
| --- | --- | --- |
| `TOOLBOX_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. An unrecognised value fails startup rather than being ignored. |
| `TOOLBOX_METRICS_ENABLED` | `true` | Serves `/metrics` in Prometheus text format. |
| `TOOLBOX_RATE_LIMIT_ENABLED` | `true` | Per-caller throttling on every route except the health probes. |
| `TOOLBOX_RATE_LIMIT_RPS` / `_BURST` | `50` / `100` | Read-route budget. Writes and gateways derive a tighter limit. |
| `TOOLBOX_AUDIT_RETENTION_DAYS` | `0` | Prunes audit records older than this. `0` keeps everything. |

`GET /healthz` reports the running version, commit and build date, so an operator
never has to guess which build they are on. Every response carries `X-Request-Id`,
echoing an upstream one where the caller sent it, and the same id appears on the
request log line. In team mode the audit trail is readable and exportable at
`/api/team/admin/audit` and `/api/team/admin/audit.csv`.

Full detail, including cardinality rules, example PromQL and the audit paging
contract, is in
[docs/operations/observability.md](docs/operations/observability.md).

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

Neither ships inside the container.

- **`packages/mcp-server`** — a Model Context Protocol server exposing `search_docs`
  and `transform_data` over stdio. See [MCP and Docker](#mcp-and-docker) below.
- **`packages/vscode`** — a VS Code extension whose single command opens your
  selection in the local toolbox's doc search via `vscode.env.openExternal`. No
  webview, no telemetry. A non-loopback `developerToolbox.url` is refused.

See [docs/operations/mcp-and-vscode.md](docs/operations/mcp-and-vscode.md).

## MCP and Docker

**The MCP server does not run inside the container, and cannot.** The runtime image is
`gcr.io/distroless/static` and holds four things — the Go binary, the built web assets,
the content pack and its manifest. There is no Node runtime in it, no shell, and no
package manager, which is most of why the image is 18.5 MB. A Node process cannot be
started there.

It is a **host-side bridge**, and it works against the container:

```text
  MCP client (Claude Desktop, an IDE, any MCP-capable assistant)
        │  stdio, JSON-RPC
        ▼
  node packages/mcp-server/dist/index.js        ← runs on your machine
        │  HTTP to a loopback address only
        ▼
  developer-toolbox container, published on 127.0.0.1:8080
```

The container publishes `127.0.0.1:8080`, the bridge addresses that port, and nothing
in the path leaves the machine.

### Setup

`dist/` is a build product and is not tracked, so build it once:

```bash
pnpm install --frozen-lockfile
pnpm --filter @toolbox/mcp-server build
```

Start the toolbox if it is not already running:

```bash
docker compose up -d toolbox
```

Then register the bridge with your MCP client. Most clients take a JSON block of this
shape — for Claude Desktop it is `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "developer-toolbox": {
      "command": "node",
      "args": ["/absolute/path/to/dev-box/packages/mcp-server/dist/index.js"],
      "env": { "TOOLBOX_URL": "http://127.0.0.1:8080" }
    }
  }
}
```

Use an absolute path: the client sets the working directory, not you. On Windows, write
the path with forward slashes or escaped backslashes so it survives JSON parsing.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TOOLBOX_URL` | `http://127.0.0.1:8080` | Where the toolbox is published. Change the port here if you mapped a different one. |
| `TOOLBOX_LOCAL_TOKEN` | unset | Sent as a bearer token when team mode is enabled. Not needed for the default anonymous localhost profile. |

### The two tools

**`search_docs`** — full-text search across the offline packs, returning ranked results
with the document id you can use to retrieve the whole page.

| Argument | Type | Notes |
| --- | --- | --- |
| `query` | string, 1–200 chars | required |
| `source` | string, ≤64 chars | optional; restricts to one source, e.g. `aspnetcore`, `git` |
| `limit` | integer 1–50 | optional, default 20 |

**`transform_data`** — converts between JSON and YAML in-process.

| Argument | Type | Notes |
| --- | --- | --- |
| `input` | string | required |
| `from` | `json` \| `yaml` | required |
| `to` | `json` \| `yaml` | required |

### What it will not do

The boundaries are deliberate, and they are enforced rather than documented:

- **Loopback addresses only.** `localhost`, `::1` and the whole of `127.0.0.0/8` are
  accepted; anything else is refused when the process starts, before a client can call
  a tool, and checked again on every call. Pointing it at a remote host fails
  immediately:

  ```text
  $ TOOLBOX_URL=http://example.com:8080 node packages/mcp-server/dist/index.js
  fatal: Refusing to connect to "example.com": the MCP bridge only addresses the local toolbox.
  ```

- **No API execution and no environment secrets.** The request workbench stays in the
  browser, where its host policy and consent prompts live. An MCP client cannot use
  this bridge to make the toolbox issue an arbitrary outbound request, which would turn
  it into an SSRF surface.
- **No user data in errors.** A tool failure reports what went wrong without echoing
  back the document or query that caused it.
- **YAML aliases and custom tags are refused** during conversion, so a converter cannot
  be used to expand input into something far larger than it appears.

### Checking it works

The handshake is worth driving once, because a misconfigured path fails silently in
most clients. With the container running:

```bash
pnpm --filter @toolbox/mcp-server test
```

A live check against the container should report the server, both tools, and real
results from the pack:

```text
initialize     : {"name":"developer-toolbox","version":"1.0.0"} proto 2024-11-05
tools/list     : search_docs, transform_data
search_docs    : 1. HTTP methods, safety and idempotence [http]  …id: http/methods-and-idempotence
transform_data : a: |   b: |     - 1 |     - 2
```

If `tools/list` comes back empty, the client is usually running a stale `dist/` — rebuild
and restart the client. If `search_docs` returns nothing, check the container is up and
that `TOOLBOX_URL` matches the port you published.

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
