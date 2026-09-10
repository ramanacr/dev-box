#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, extname, basename, relative } from 'node:path';

// Usage:
// node scripts/build-pack.mjs --dir <input-directory> --name <pack-name> [--out <output-directory>] [--version <version>]

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dir: '',
    name: '',
    out: '',
    version: '0.1.0',
    license: 'Custom',
    attribution: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir' && i + 1 < args.length) {
      options.dir = args[++i];
    } else if (arg === '--name' && i + 1 < args.length) {
      options.name = args[++i];
    } else if (arg === '--out' && i + 1 < args.length) {
      options.out = args[++i];
    } else if (arg === '--version' && i + 1 < args.length) {
      options.version = args[++i];
    } else if (arg === '--license' && i + 1 < args.length) {
      options.license = args[++i];
    } else if (arg === '--attribution' && i + 1 < args.length) {
      options.attribution = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Developer Toolbox - Pack Builder CLI

Usage:
  node scripts/build-pack.mjs --dir <docs-directory> --name <pack-name> [options]

Options:
  --dir <path>          Path to directory containing markdown/text/html files (required)
  --name <id>           Pack identifier / source name (e.g. "team-wiki", "api-specs") (required)
  --out <path>          Output directory for generated docs.db and manifest.json (default: packs/<name>)
  --version <semver>    Version string (default: 0.1.0)
  --license <name>      License string (default: Custom)
  --attribution <text>  Attribution notice (default: Generated from <dir>)
  --help, -h            Show this help message
`);
}

function extractTitle(content, filename) {
  // Try Markdown header # Title
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch && headingMatch[1].trim()) {
    return headingMatch[1].trim();
  }
  // Try HTML <title> or <h1>
  const htmlMatch = content.match(/<(?:title|h1)[^>]*>([^<]+)<\/(?:title|h1)>/i);
  if (htmlMatch && htmlMatch[1].trim()) {
    return htmlMatch[1].trim();
  }
  // Fall back to filename without extension
  const name = basename(filename, extname(filename));
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function convertToHtml(content, ext) {
  if (ext === '.html' || ext === '.htm') {
    return content;
  }

  // Basic markdown conversion for paragraphs, headings, code blocks, lists
  const lines = content.split(/\r?\n/);
  const out = [];
  let inCodeBlock = false;
  let inList = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        out.push('</code></pre>');
        inCodeBlock = false;
      } else {
        if (inList) {
          out.push('</ul>');
          inList = false;
        }
        out.push('<pre><code>');
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      out.push(escapeHtml(line) + '\n');
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      continue;
    }

    if (trimmed.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${escapeHtml(trimmed.slice(2))}</li>`);
    } else {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(`<p>${escapeHtml(trimmed)}</p>`);
    }
  }

  if (inCodeBlock) out.push('</code></pre>');
  if (inList) out.push('</ul>');

  return out.join('\n');
}

function scanFiles(dir) {
  const supported = new Set(['.md', '.markdown', '.html', '.htm', '.txt']);
  const results = [];

  function traverse(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          traverse(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (supported.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  traverse(dir);
  return results;
}

function main() {
  const options = parseArgs();

  if (!options.dir || !options.name) {
    printHelp();
    console.error('Error: Both --dir and --name arguments are required.');
    process.exit(1);
  }

  const inputDir = resolve(options.dir);
  if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
    console.error(`Error: Specified directory does not exist or is not a directory: ${inputDir}`);
    process.exit(1);
  }

  const outputDir = options.out ? resolve(options.out) : resolve(`packs/${options.name}`);
  mkdirSync(outputDir, { recursive: true });

  const dbPath = join(outputDir, 'docs.db');
  const manifestPath = join(outputDir, 'manifest.json');

  console.log(`Scanning documents in ${inputDir}...`);
  const files = scanFiles(inputDir);
  console.log(`Found ${files.length} document(s) to index.`);

  if (files.length === 0) {
    console.warn('Warning: No supported documentation files (.md, .txt, .html) found.');
  }

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const db = new DatabaseSync(dbPath);

  // Initialize schema with FTS5 and external content table triggers
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      body_html TEXT NOT NULL,
      attribution TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
      title, body_html, source,
      content='documents', content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO document_fts(rowid, title, body_html, source)
      VALUES (new.rowid, new.title, new.body_html, new.source);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO document_fts(document_fts, rowid, title, body_html, source)
      VALUES('delete', old.rowid, old.title, old.body_html, old.source);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO document_fts(document_fts, rowid, title, body_html, source)
      VALUES('delete', old.rowid, old.title, old.body_html, old.source);
      INSERT INTO document_fts(rowid, title, body_html, source)
      VALUES (new.rowid, new.title, new.body_html, new.source);
    END;
  `);

  const insertStmt = db.prepare(`
    INSERT INTO documents (id, source, title, url, body_html, attribution)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const sourceName = options.name;
  const attribution = options.attribution || `Pack ${sourceName}, generated from local documentation.`;

  for (const filePath of files) {
    const relPath = relative(inputDir, filePath).replace(/\\/g, '/');
    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();
    const title = extractTitle(content, filePath);
    const bodyHtml = convertToHtml(content, ext);

    const docId = `${sourceName}/${relPath.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9/_-]/g, '_')}`;
    const url = `/docs?id=${encodeURIComponent(docId)}`;

    insertStmt.run(docId, sourceName, title, url, bodyHtml, attribution);
  }

  db.close();

  // Compute SHA256 of the generated DB
  const dbBuffer = readFileSync(dbPath);
  const sha256 = createHash('sha256').update(dbBuffer).digest('hex');

  const manifest = {
    id: options.name,
    version: options.version,
    database: 'docs.db',
    sha256: sha256,
    sources: [
      {
        name: sourceName,
        url: 'local://' + sourceName,
        license: options.license,
        attribution: attribution,
      },
    ],
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\nDocumentation pack created successfully!`);
  console.log(`Pack ID:     ${options.name}`);
  console.log(`Output:      ${outputDir}`);
  console.log(`Database:    ${dbPath}`);
  console.log(`Documents:   ${files.length}`);
  console.log(`SHA-256:     ${sha256}\n`);
}

main();
