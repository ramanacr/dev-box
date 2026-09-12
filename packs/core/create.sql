-- Content pack schema.
--
-- The white paper's documentation-index design asks for title, headings, body and
-- tags to be indexed as separate FTS columns "so headings can have more ranking
-- weight than prose". Column order here fixes the weight order used by bm25() in
-- internal/docs/sqlite_searcher.go; changing it means changing those weights.

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  body_html TEXT NOT NULL,
  attribution TEXT NOT NULL,
  -- Section headings, newline-separated. Indexed separately so a query that names a
  -- section ranks that document above one that merely mentions the term in prose.
  headings TEXT NOT NULL DEFAULT '',
  -- Space-separated keywords, including identifiers and flags a reader would search
  -- for that do not appear verbatim in the prose.
  tags TEXT NOT NULL DEFAULT ''
);

CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
  title, headings, body_html, tags, source,
  content='documents', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO document_fts(rowid, title, headings, body_html, tags, source)
  VALUES (new.rowid, new.title, new.headings, new.body_html, new.tags, new.source);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO document_fts(document_fts, rowid, title, headings, body_html, tags, source)
  VALUES('delete', old.rowid, old.title, old.headings, old.body_html, old.tags, old.source);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO document_fts(document_fts, rowid, title, headings, body_html, tags, source)
  VALUES('delete', old.rowid, old.title, old.headings, old.body_html, old.tags, old.source);
  INSERT INTO document_fts(rowid, title, headings, body_html, tags, source)
  VALUES (new.rowid, new.title, new.headings, new.body_html, new.tags, new.source);
END;
