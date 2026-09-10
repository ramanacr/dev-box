package docs

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

// UserDocumentInput represents a document submitted for ingestion.
type UserDocumentInput struct {
	Title    string
	Filename string
	Content  string // Markdown, HTML, or plain text
}

// UserDocumentSummary provides metadata about a user document for management listings.
type UserDocumentSummary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Filename  string    `json:"filename"`
	ByteSize  int64     `json:"byteSize"`
	CreatedAt time.Time `json:"createdAt"`
}

// UserStore manages a writable SQLite database for user-uploaded documents with FTS5 search.
type UserStore struct {
	db *sql.DB
}

const userStoreSchema = `
CREATE TABLE IF NOT EXISTS user_documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'user',
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  body_html TEXT NOT NULL,
  attribution TEXT NOT NULL,
  filename TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS user_document_fts USING fts5(
  title, body_html, source,
  content='user_documents', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS user_documents_ai AFTER INSERT ON user_documents BEGIN
  INSERT INTO user_document_fts(rowid, title, body_html, source)
  VALUES (new.rowid, new.title, new.body_html, new.source);
END;

CREATE TRIGGER IF NOT EXISTS user_documents_ad AFTER DELETE ON user_documents BEGIN
  INSERT INTO user_document_fts(user_document_fts, rowid, title, body_html, source)
  VALUES('delete', old.rowid, old.title, old.body_html, old.source);
END;

CREATE TRIGGER IF NOT EXISTS user_documents_au AFTER UPDATE ON user_documents BEGIN
  INSERT INTO user_document_fts(user_document_fts, rowid, title, body_html, source)
  VALUES('delete', old.rowid, old.title, old.body_html, old.source);
  INSERT INTO user_document_fts(rowid, title, body_html, source)
  VALUES (new.rowid, new.title, new.body_html, new.source);
END;
`

// OpenUserStore creates or opens the writable user-documents SQLite database with WAL mode.
func OpenUserStore(dbPath string) (*UserStore, error) {
	if dbPath == "" {
		return nil, errors.New("database path cannot be empty")
	}

	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory for user docs: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open user docs db: %w", err)
	}

	// Configure WAL mode for high concurrency
	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to configure WAL mode: %w", err)
	}

	// Initialize tables and FTS5 triggers
	if _, err := db.Exec(userStoreSchema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to initialize user store schema: %w", err)
	}

	return &UserStore{db: db}, nil
}

// Ready checks database availability.
func (u *UserStore) Ready() error {
	if u == nil || u.db == nil {
		return errors.New("user store not initialized")
	}
	return u.db.Ping()
}

// Close closes database connection.
func (u *UserStore) Close() error {
	if u == nil || u.db == nil {
		return nil
	}
	return u.db.Close()
}

// InsertDocument parses, sanitizes, and stores a document.
func (u *UserStore) InsertDocument(ctx context.Context, input UserDocumentInput) (*Document, error) {
	if u == nil || u.db == nil {
		return nil, errors.New("user store not initialized")
	}

	trimmedContent := strings.TrimSpace(input.Content)
	if trimmedContent == "" {
		return nil, errors.New("document content cannot be empty")
	}

	byteSize := int64(len(input.Content))
	if byteSize > 10*1024*1024 { // 10 MB limit
		return nil, errors.New("document exceeds maximum allowed size of 10 MB")
	}

	// Derive title if empty
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = extractTitleFromContent(trimmedContent, input.Filename)
	}

	// Generate clean ID
	randomBytes := make([]byte, 4)
	_, _ = rand.Read(randomBytes)
	slug := sanitizeSlug(title)
	if slug == "" {
		slug = "doc"
	}
	id := fmt.Sprintf("user/%s-%s", slug, hex.EncodeToString(randomBytes))

	// Convert content to clean HTML
	bodyHTML := convertToHTML(trimmedContent, input.Filename)
	attribution := fmt.Sprintf("Uploaded from %s on %s", input.Filename, time.Now().Format("Jan 02, 2006"))

	insertSQL := `
		INSERT INTO user_documents (id, source, title, url, body_html, attribution, filename, byte_size)
		VALUES (?, 'user', ?, ?, ?, ?, ?, ?);
	`
	_, err := u.db.ExecContext(ctx, insertSQL, id, title, "/docs?id="+id, bodyHTML, attribution, input.Filename, byteSize)
	if err != nil {
		return nil, fmt.Errorf("failed to save user document: %w", err)
	}

	return &Document{
		ID:          id,
		Source:      "user",
		Title:       title,
		URL:         "/docs?id=" + id,
		BodyHTML:    bodyHTML,
		Attribution: attribution,
	}, nil
}

// DeleteDocument removes a user document by ID.
func (u *UserStore) DeleteDocument(ctx context.Context, id string) error {
	if u == nil || u.db == nil {
		return errors.New("user store not initialized")
	}

	deleteSQL := `DELETE FROM user_documents WHERE id = ?;`
	res, err := u.db.ExecContext(ctx, deleteSQL, id)
	if err != nil {
		return fmt.Errorf("failed to delete user document: %w", err)
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("document with id %q not found", id)
	}

	return nil
}

// ListDocuments returns metadata summaries for all user-uploaded documents.
func (u *UserStore) ListDocuments(ctx context.Context) ([]UserDocumentSummary, error) {
	if u == nil || u.db == nil {
		return nil, errors.New("user store not initialized")
	}

	querySQL := `
		SELECT id, title, filename, byte_size, created_at
		FROM user_documents
		ORDER BY created_at DESC;
	`
	rows, err := u.db.QueryContext(ctx, querySQL)
	if err != nil {
		return nil, fmt.Errorf("failed to list user documents: %w", err)
	}
	defer rows.Close()

	summaries := make([]UserDocumentSummary, 0)
	for rows.Next() {
		var s UserDocumentSummary
		if err := rows.Scan(&s.ID, &s.Title, &s.Filename, &s.ByteSize, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed reading document summary: %w", err)
		}
		summaries = append(summaries, s)
	}

	return summaries, nil
}

// Search queries the user_document_fts virtual table using BM25 ranking.
func (u *UserStore) Search(ctx context.Context, q Query) ([]SearchResult, error) {
	if u == nil || u.db == nil {
		return nil, errors.New("user store not initialized")
	}

	if utf8.RuneCountInString(q.Text) > 200 {
		return nil, errors.New("query text exceeds maximum length of 200 characters")
	}

	trimmed := strings.TrimSpace(q.Text)
	if trimmed == "" {
		return []SearchResult{}, nil
	}

	limit := q.Limit
	if limit <= 0 {
		limit = 20
	} else if limit > 50 {
		return nil, errors.New("limit cannot exceed 50")
	}

	ftsQuery := buildFTSQuery(trimmed)
	if ftsQuery == "" {
		return []SearchResult{}, nil
	}

	querySQL := `
		SELECT d.id, d.title, d.url, d.source,
		       snippet(user_document_fts, 1, '<mark>', '</mark>', '…', 16) AS snippet,
		       bm25(user_document_fts, 8.0, 1.0, 2.0) AS score
		FROM user_document_fts
		JOIN user_documents d ON d.rowid = user_document_fts.rowid
		WHERE user_document_fts MATCH ?
		ORDER BY score ASC
		LIMIT ?;
	`

	rows, err := u.db.QueryContext(ctx, querySQL, ftsQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("search query could not be completed")
	}
	defer rows.Close()

	results := make([]SearchResult, 0)
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.ID, &r.Title, &r.URL, &r.Source, &r.Snippet, &r.Score); err != nil {
			return nil, fmt.Errorf("error reading search result")
		}
		results = append(results, r)
	}

	return results, nil
}

// Document retrieves a user document by ID.
func (u *UserStore) Document(ctx context.Context, id string) (Document, error) {
	if u == nil || u.db == nil {
		return Document{}, errors.New("user store not initialized")
	}

	querySQL := `SELECT id, source, title, url, body_html, attribution FROM user_documents WHERE id = ? LIMIT 1;`
	row := u.db.QueryRowContext(ctx, querySQL, id)

	var doc Document
	if err := row.Scan(&doc.ID, &doc.Source, &doc.Title, &doc.URL, &doc.BodyHTML, &doc.Attribution); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Document{}, fmt.Errorf("document with id %q not found", id)
		}
		return Document{}, fmt.Errorf("error retrieving document: %w", err)
	}

	return doc, nil
}

var nonAlphanumericRegex = regexp.MustCompile(`[^a-z0-9]+`)

func sanitizeSlug(title string) string {
	lower := strings.ToLower(title)
	clean := nonAlphanumericRegex.ReplaceAllString(lower, "-")
	clean = strings.Trim(clean, "-")
	if len(clean) > 40 {
		clean = clean[:40]
	}
	return clean
}

func extractTitleFromContent(content, filename string) string {
	lines := strings.Split(content, "\n")
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if strings.HasPrefix(trimmed, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, "# "))
		}
	}
	if filename != "" {
		base := filepath.Base(filename)
		return strings.TrimSuffix(base, filepath.Ext(base))
	}
	return "Untitled Document"
}

func convertToHTML(content, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".html" || ext == ".htm" {
		return content
	}

	// Simple, clean Markdown to HTML conversion for paragraphs, headings, code blocks, and lists
	var b strings.Builder
	lines := strings.Split(content, "\n")
	inCodeBlock := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "```") {
			if inCodeBlock {
				b.WriteString("</code></pre>\n")
				inCodeBlock = false
			} else {
				b.WriteString("<pre><code>")
				inCodeBlock = true
			}
			continue
		}

		if inCodeBlock {
			b.WriteString(escapeHTML(line))
			b.WriteString("\n")
			continue
		}

		if trimmed == "" {
			continue
		}

		if strings.HasPrefix(trimmed, "### ") {
			b.WriteString("<h3>" + escapeHTML(strings.TrimPrefix(trimmed, "### ")) + "</h3>\n")
		} else if strings.HasPrefix(trimmed, "## ") {
			b.WriteString("<h2>" + escapeHTML(strings.TrimPrefix(trimmed, "## ")) + "</h2>\n")
		} else if strings.HasPrefix(trimmed, "# ") {
			b.WriteString("<h1>" + escapeHTML(strings.TrimPrefix(trimmed, "# ")) + "</h1>\n")
		} else if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			b.WriteString("<li>" + escapeHTML(strings.TrimPrefix(strings.TrimPrefix(trimmed, "- "), "* ")) + "</li>\n")
		} else {
			b.WriteString("<p>" + escapeHTML(trimmed) + "</p>\n")
		}
	}

	if inCodeBlock {
		b.WriteString("</code></pre>\n")
	}

	return b.String()
}

func escapeHTML(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(s, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"), "\"", "&quot;")
}
