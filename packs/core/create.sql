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
