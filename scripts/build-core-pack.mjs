#!/usr/bin/env node
/**
 * Builds the core documentation pack.
 *
 * Content lives in packs/core/content/*.mjs, one module per source. Each module
 * exports a `source` descriptor (carrying the licence and attribution that end up in
 * the manifest) and a `documents` array. The builder validates every document,
 * writes the SQLite FTS5 database, and regenerates the manifest with a fresh SHA-256.
 *
 * Keeping content in modules rather than a hand-written seed.sql means a document
 * cannot be added without its provenance, and the validation below is possible at
 * all — a malformed INSERT in a .sql file is only discovered when a query returns
 * nothing.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACK_DIR = resolve('packs/core');
const DB_PATH = join(PACK_DIR, 'docs.db');
const MANIFEST_PATH = join(PACK_DIR, 'manifest.json');
const CREATE_SQL_PATH = join(PACK_DIR, 'create.sql');
const CONTENT_DIR = join(PACK_DIR, 'content');

const PACK_VERSION = '1.0.0';

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// --- load content ---------------------------------------------------------

const moduleFiles = readdirSync(CONTENT_DIR)
  .filter((name) => name.endsWith('.mjs'))
  .sort();

if (moduleFiles.length === 0) {
  fail(`No content modules found in ${CONTENT_DIR}`);
}

const sources = [];
const documents = [];
const seenIds = new Set();

for (const file of moduleFiles) {
  const modulePath = join(CONTENT_DIR, file);
  const module = await import(pathToFileURL(modulePath).href);

  if (!module.source || !Array.isArray(module.documents)) {
    fail(`${file} must export a "source" object and a "documents" array`);
  }

  const { source } = module;
  for (const field of ['id', 'name', 'url', 'license', 'attribution']) {
    if (!source[field] || typeof source[field] !== 'string') {
      fail(`${file}: source.${field} is required`);
    }
  }
  sources.push(source);

  if (module.documents.length === 0) {
    fail(`${file}: declares a source but no documents`);
  }

  for (const doc of module.documents) {
    for (const field of ['id', 'title', 'url', 'body']) {
      if (!doc[field] || typeof doc[field] !== 'string') {
        fail(`${file}: document ${doc.id ?? '(no id)'} is missing "${field}"`);
      }
    }

    // The id prefix ties a document to its source, which is what the source filter
    // and the permalink scheme both rely on.
    if (!doc.id.startsWith(`${source.id}/`)) {
      fail(`${file}: document id "${doc.id}" must start with "${source.id}/"`);
    }
    if (seenIds.has(doc.id)) {
      fail(`Duplicate document id "${doc.id}"`);
    }
    seenIds.add(doc.id);

    const headings = Array.isArray(doc.headings) ? doc.headings.join('\n') : (doc.headings ?? '');
    const body = doc.body.trim();

    // A document with no prose is worse than no document: it pollutes ranking while
    // answering nothing.
    if (body.length < 200) {
      fail(`${file}: document "${doc.id}" body is only ${body.length} characters`);
    }

    documents.push({
      id: doc.id,
      source: source.id,
      title: doc.title,
      url: doc.url,
      body_html: body,
      attribution: source.attribution,
      headings,
      tags: doc.tags ?? '',
    });
  }
}

// --- build ----------------------------------------------------------------

console.log(`Building core pack from ${moduleFiles.length} source modules...`);

if (existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
}

const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(CREATE_SQL_PATH, 'utf-8'));

const insert = db.prepare(`
  INSERT INTO documents (id, source, title, url, body_html, attribution, headings, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`);

db.exec('BEGIN');
for (const doc of documents) {
  insert.run(
    doc.id,
    doc.source,
    doc.title,
    doc.url,
    doc.body_html,
    doc.attribution,
    doc.headings,
    doc.tags,
  );
}
db.exec('COMMIT');

// Collapse the incremental FTS index into one b-tree segment. This measurably
// improves query latency and shrinks the file, and the pack is read-only so there is
// no reason to leave it unmerged.
db.exec("INSERT INTO document_fts(document_fts) VALUES('optimize')");
db.exec('VACUUM');

// --- verify ---------------------------------------------------------------

const count = db.prepare('SELECT count(*) AS n FROM documents').get().n;
if (count !== documents.length) {
  fail(`Expected ${documents.length} documents in the database, found ${count}`);
}

// Prove the FTS triggers actually populated the index. A pack that builds but cannot
// be searched is the failure mode worth guarding against.
const indexed = db.prepare('SELECT count(*) AS n FROM document_fts').get().n;
if (indexed !== documents.length) {
  fail(`FTS index holds ${indexed} rows for ${documents.length} documents`);
}

const smokeQueries = ['idempotent', 'rebase', 'dependency injection', 'json schema'];
for (const query of smokeQueries) {
  const hits = db
    .prepare('SELECT count(*) AS n FROM document_fts WHERE document_fts MATCH ?')
    .get(query.split(/\s+/).map((t) => `"${t}"`).join(' AND ')).n;
  if (hits === 0) {
    fail(`Smoke query "${query}" matched nothing — the index is not usable`);
  }
}

db.close();

// --- manifest -------------------------------------------------------------

const sha256 = createHash('sha256').update(readFileSync(DB_PATH)).digest('hex');

const manifest = {
  id: 'core',
  version: PACK_VERSION,
  kind: 'content',
  title: 'Developer Toolbox Core Reference',
  description:
    'Offline reference for HTTP, OpenAPI, JSON Schema, regular expressions, Git, Docker, SQL, TypeScript, ASP.NET Core and Angular.',
  database: 'docs.db',
  sha256,
  sources: sources.map((s) => ({
    name: s.name,
    url: s.url,
    license: s.license,
    attribution: s.attribution,
  })),
};

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

const sizeKb = (readFileSync(DB_PATH).length / 1024).toFixed(1);
const perSource = sources
  .map((s) => `${s.id}=${documents.filter((d) => d.source === s.id).length}`)
  .join(' ');

console.log(`✓ ${documents.length} documents across ${sources.length} sources`);
console.log(`  ${perSource}`);
console.log(`✓ ${sizeKb} KB  sha256 ${sha256.slice(0, 16)}…`);
