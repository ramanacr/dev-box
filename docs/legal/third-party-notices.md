# Third-Party Notices & Licenses

The Developer Toolbox incorporates the following open-source dependencies and
documentation sources in compliance with their respective licenses.

A machine-readable SBOM is generated per image in CI (`artifacts/sbom.spdx.json`,
SPDX JSON via Syft). This document records the direct dependencies and the notice
obligations that attach to them; the SBOM is authoritative for the full transitive
tree.

## Runtime image — software dependencies

These ship inside `developer-toolbox` and are present at runtime.

| Component | Version | License | Copyright | Purpose |
| --- | --- | --- | --- | --- |
| Preact | 10.x | MIT | Jason Miller | Lightweight UI component runtime |
| modernc.org/sqlite | 1.36.0 | BSD-3-Clause | The modernc.org authors | Pure Go, CGO-free SQLite driver |
| fast-xml-parser | 5.x | MIT | Amit Kumar Gupta | XML parsing with entity expansion disabled |
| yaml | 2.9.0 | ISC | Eemeli Aro | YAML parsing and serialisation |
| papaparse | 5.x | MIT | Matthew Holt | In-browser CSV parsing |
| idb | 8.x | ISC | Jake Archibald | IndexedDB promise wrapper |
| ajv | 8.x | MIT | Evgeny Poberezkin | JSON Schema 2020-12 contract validation |
| mermaid | 11.x | MIT | Knut Sveidqvist and contributors | Offline diagram rendering |
| github.com/coder/websocket | 1.8.15 | ISC | Anmol Sethi | WebSocket transport for the optional collaboration relay |

`github.com/coder/websocket` is only reachable when
`TOOLBOX_FEATURE_COLLABORATION=true`; it is compiled into the binary regardless.

### Go indirect dependencies

Pulled in transitively by `modernc.org/sqlite`. Licences as published on
pkg.go.dev; see the generated SBOM for the authoritative list and versions.

| Component | License |
| --- | --- |
| github.com/dustin/go-humanize | MIT |
| github.com/google/uuid | BSD-3-Clause |
| github.com/mattn/go-isatty | MIT |
| github.com/ncruces/go-strftime | MIT |
| github.com/remyoudompheng/bigfft | BSD-3-Clause |
| golang.org/x/exp | BSD-3-Clause |
| golang.org/x/sys | BSD-3-Clause |
| modernc.org/libc | BSD-3-Clause |
| modernc.org/mathutil | BSD-3-Clause |
| modernc.org/memory | BSD-3-Clause |

## Companion packages — not in the runtime image

These are separate workspace packages. They are not part of the container.

| Component | Version | License | Copyright | Used by |
| --- | --- | --- | --- | --- |
| @modelcontextprotocol/sdk | 1.30.0 | MIT | 2024 Anthropic, PBC | `@toolbox/mcp-server` — MCP protocol and stdio transport |
| zod | 4.6.2 | MIT | 2025 Colin McDonnell | `@toolbox/mcp-server` — tool input schemas |
| yaml | 2.9.0 | ISC | Eemeli Aro | `@toolbox/mcp-server` — `transform_data` conversion |

## Build-time only

Not present at runtime and not distributed in the image.

| Component | License | Purpose |
| --- | --- | --- |
| Vite | MIT | Frontend build tooling |
| TypeScript | Apache-2.0 | Type checking and compilation |
| Vitest | MIT | Unit test runner |
| Playwright | Apache-2.0 | End-to-end test runner |
| @preact/preset-vite | MIT | Preact integration for Vite |
| @testing-library/preact | MIT | Component testing utilities |
| fake-indexeddb | Apache-2.0 | IndexedDB implementation for tests |
| jsdom | MIT | DOM implementation for tests |
| pnpm | MIT | Package manager |

## Independently implemented modules

The white paper's research table identifies upstream tools whose code or data carries
licences that make direct reuse imprudent. The following modules are **original
implementations** written for this product. No upstream source code, database, or
documentation text was copied, and no upstream product name is used to market them.

| Module | Upstream reference | Why it was not reused |
| --- | --- | --- |
| Command Reference (`modules/command`) | ExplainShell | Its code is GPLv3 and its manpage-derived database contains individually licensed upstream manual pages. Every option description here is independently authored, and the covered command set is disclosed in the UI. |
| Regex Workbench (`modules/regex`) | RegExr | GPLv3, unsuitable for embedding without meeting copyleft obligations. |
| Doc Search (`internal/docs`, `modules/docs`) | DevDocs | MPL-2.0, and its generated documentation carries a separate attribution request. The FTS5 pack pipeline here is original; content provenance is tracked per pack. |
| Whiteboard (`modules/diagrams/ExcalidrawEditor.tsx`) | Excalidraw (MIT) | Reuse would have been permitted. Implemented locally for footprint reasons instead — see `docs/adr/0007-whiteboard-implementation.md`. The `.excalidraw` file format is preserved for interchange. |
| Type Generator (`modules/types`) | quicktype | Implemented natively to avoid a large dependency. |
| JSON Query (`modules/query`) | JSONPath implementations | Implemented natively; no query dependency added. |
| Git sandbox, algorithm visualizer (`modules/learning`) | Learn Git Branching (MIT), VisuAlgo | Original simulation and step generators. The Git model is not derived from Git source; algorithms are textbook procedures implemented independently. |

## Documentation content sources

Content packs carry their own provenance. Each pack's `manifest.json` records the
source name, URL, licence, and attribution text, and a SHA-256 checksum over the
database.

| Content Pack | Source | License | Attribution |
| --- | --- | --- | --- |
| `aspnetcore` | Microsoft Learn | CC BY 4.0 | Documentation derived from Microsoft Learn, licensed under CC BY 4.0. |
| `typescript` | TypeScript Handbook | Apache-2.0 | Documentation derived from TypeScript Handbook, licensed under Apache-2.0. |
| `git` | Git Documentation | GPLv2 / MIT | Documentation derived from Git Documentation. |
| `docker` | Docker Documentation | Apache-2.0 | Documentation derived from Docker Docs, licensed under Apache-2.0. |
| `learning` | Original | MIT | Simulation and lesson content authored for Developer Toolbox. |

The seed corpus shipped in `packs/core` is a small, copyright-safe sample used for
tests and demonstration. Ingesting a real documentation set is a separate
content-governance task: a permissive application licence does not grant the right to
redistribute every documentation set that can be scraped, and each source's
redistribution terms must be assessed and recorded in its manifest before a pack is
distributed.

## Maintaining this document

When a dependency is added, changed, or removed:

1. Add or update its row above with the resolved version, SPDX identifier, and
   copyright holder as stated in the package's own licence file.
2. Note whether it reaches the runtime image, a companion package, or build time
   only — the distinction determines the notice obligation.
3. Confirm CI's SBOM step still succeeds; the SBOM is the authoritative record of the
   transitive tree.
