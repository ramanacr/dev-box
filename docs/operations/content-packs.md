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
