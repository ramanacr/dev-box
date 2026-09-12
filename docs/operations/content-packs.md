# Documentation Content Packs & User Document Ingestion

Developer Toolbox provides a dual documentation system:
1. **Immutable System Content Packs**: Read-only SQLite FTS5 database packs (`docs.db`) verified with cryptographic SHA-256 manifests (`manifest.json`).
2. **User Document Ingestion (Workbench UI)**: Direct drag-and-drop upload of Markdown, Text, and HTML files into a dedicated writable SQLite database (`user-docs.db`) with instant full-text search.
3. **Custom Pack Builder CLI**: A standalone utility to compile large local documentation repositories into pre-indexed SQLite packs.

---

## 1. User Document Ingestion (Web UI)

Developers can upload project documentation (`.md`, `.markdown`, `.txt`, `.html`) directly from the browser:

1. Open the **Docs** tab in the Developer Toolbox.
2. Click **Manage / Upload Docs**.
3. Drag and drop your files or select them from disk.
4. Files are automatically parsed (extracting H1 titles, subheadings, and body text) and indexed into `user-docs.db` using SQLite FTS5 with BM25 ranking.
5. Search immediately alongside core reference documentation or filter by source **"User Uploads"**.
6. You can delete user-uploaded documents at any time from the management drawer.

---

## 2. Pack Builder CLI Tool (`scripts/build-pack.mjs`)

For team wikis, internal engineering handbooks, or large multi-file documentation repositories, use the Pack Builder CLI to compile an offline `.db` pack:

### Usage

```bash
node scripts/build-pack.mjs --dir <path-to-docs-folder> --name <pack-name> [--out <output-dir>]
```

### Example

```bash
# Build a custom pack from internal engineering documentation
node scripts/build-pack.mjs --dir ./internal-wiki --name engineering-handbook --out ./packs/engineering
```

### What the CLI Does:
1. Recursively scans the input directory for `.md`, `.markdown`, and `.html` files.
2. Extracts document titles from YAML frontmatter or the first `# Heading`.
3. Converts Markdown to sanitized semantic HTML.
4. Generates a SQLite database (`docs.db`) with external-content FTS5 virtual tables and synchronization triggers.
5. Calculates the cryptographic SHA-256 checksum and produces `manifest.json`.
6. Generates a mount-ready pack folder.

---

## 3. Mounting Custom Packs in Docker

To mount custom packs into your Developer Toolbox container:

```bash
docker run -d \
  -p 127.0.0.1:8080:8080 \
  -v ./packs/engineering:/app/packs/custom \
  -e TOOLBOX_DOCS_DB_PATH=/app/packs/custom/docs.db \
  developer-toolbox:dev
```

---

## 4. The core pack

The shipped `packs/core` pack is the first release's reference shelf. It covers the
topics the white paper recommended: HTTP, OpenAPI, JSON Schema, regular expressions,
Git, Docker, SQL, TypeScript, ASP.NET Core and Angular.

### Content is original, by licensing design

Every document is authored for this product and licensed MIT. Nothing is scraped,
copied or closely paraphrased from upstream documentation, and each document links to
a canonical upstream reference instead.

That is a deliberate decision rather than an accident of convenience. The white paper
is explicit that a permissive application licence grants no right to redistribute
every documentation set that can be fetched, and it names specific hazards:
ExplainShell's manpage-derived database contains individually licensed upstream
manual pages; DevDocs is MPL-2.0 with an attribution request for its generated
documentation; RegExr is GPLv3. Shipping original content sidesteps all of it, and
means the pack can be redistributed with the image without a per-source legal
review.

Adding upstream content is still possible, and is the right move for a team that has
cleared it — see section 2 for the pack builder and section 3 for mounting. What
cannot be skipped is recording the assessment in the manifest.

### Layout

Content lives in `packs/core/content/*.mjs`, one module per source:

```javascript
export const source = {
  id: 'http',                    // prefixes every document id in this module
  name: 'HTTP',
  url: 'https://www.rfc-editor.org/rfc/rfc9110.html',
  license: 'MIT',
  attribution: 'Original reference content authored for Developer Toolbox.',
};

export const documents = [
  {
    id: 'http/status-codes',     // must start with `${source.id}/`
    title: 'HTTP status codes: choosing the right one',
    url: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-15',
    tags: '200 201 404 429 status code',
    headings: ['Success', 'Redirection', 'Client error'],
    body: `<p>…</p>`,
  },
];
```

Keeping content in modules rather than a hand-written `seed.sql` is what makes the
builder's validation possible: a document cannot be added without its provenance, and
a malformed entry fails the build rather than being discovered later as a query that
returns nothing.

### Building

```bash
node scripts/build-core-pack.mjs
```

The builder validates every document, writes the database, merges the FTS index into
a single segment, vacuums, then regenerates `manifest.json` with a fresh SHA-256. It
refuses to produce a pack when:

- a document lacks an id, title, url or body;
- a document id is not prefixed with its source id, which the source filter and the
  permalink scheme both depend on;
- two documents share an id;
- a body is shorter than 200 characters — a stub pollutes ranking while answering
  nothing;
- the FTS row count does not match the document count, which catches a broken
  trigger; or
- any of several smoke queries matches nothing.

### Why headings and tags are indexed separately

The FTS table indexes `title, headings, body_html, tags, source` as five columns, and
`bm25()` weights them `8.0, 4.0, 1.0, 2.0, 0.5`. This is the white paper's index
design: headings carry four times the weight of prose so a query naming a section
ranks that document first, and tags hold identifiers and flags a reader searches for
that may not appear verbatim in the text.

Source is weighted *below* prose deliberately — matching a source name should barely
influence relevance, because the source filter is the proper way to narrow by source.

The column order in `packs/core/create.sql` fixes the weight order in
`internal/docs/sqlite_searcher.go`. Changing one without the other silently
misweights every query, so the ranking test in `sqlite_searcher_test.go` asserts a
title, heading and tag match each outrank a body match.

### Adding a source

1. Create `packs/core/content/<id>.mjs` exporting `source` and `documents`.
2. Prefix every document id with `<id>/`.
3. Run `node scripts/build-core-pack.mjs`.
4. Add a display name to `sourceTitles` in `internal/docs/sqlite_searcher.go` if the
   capitalised identifier is not what you want shown. This is optional — an unknown
   id falls back to a capitalised form, so a new source is usable immediately.

The UI's source filter is derived from `GET /api/docs/sources`, so a new source
appears in it without any frontend change.
