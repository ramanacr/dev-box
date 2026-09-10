package docs

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

// SQLiteSearcher implements Searcher using a local SQLite database with FTS5.
type SQLiteSearcher struct {
	db *sql.DB
}

// OpenReadOnly opens a read-only SQLite documentation database.
func OpenReadOnly(path string) (*SQLiteSearcher, error) {
	if path == "" {
		return nil, errors.New("database path cannot be empty")
	}

	dsn := fmt.Sprintf("file:%s?mode=ro&immutable=1", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Verify database connection
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &SQLiteSearcher{db: db}, nil
}

// Ready verifies the database is responsive.
func (s *SQLiteSearcher) Ready() error {
	if s == nil || s.db == nil {
		return errors.New("sqlite searcher not initialized")
	}
	return s.db.Ping()
}

// Close closes the underlying database handle.
func (s *SQLiteSearcher) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// Search executes a sanitized full-text search against document_fts.
func (s *SQLiteSearcher) Search(ctx context.Context, q Query) ([]SearchResult, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("searcher not initialized")
	}

	// Validate query length
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

	// Sanitize and tokenize search input
	ftsQuery := buildFTSQuery(trimmed)
	if ftsQuery == "" {
		return []SearchResult{}, nil
	}

	sourceFilter := strings.TrimSpace(q.Source)

	querySQL := `
		SELECT d.id, d.title, d.url, d.source,
		       snippet(document_fts, 1, '<mark>', '</mark>', '…', 16) AS snippet,
		       bm25(document_fts, 8.0, 1.0, 2.0) AS score
		FROM document_fts
		JOIN documents d ON d.rowid = document_fts.rowid
		WHERE document_fts MATCH ?
		  AND (? = '' OR d.source = ?)
		ORDER BY score ASC
		LIMIT ?;
	`

	rows, err := s.db.QueryContext(ctx, querySQL, ftsQuery, sourceFilter, sourceFilter, limit)
	if err != nil {
		// Expose error for test diagnosis
		return nil, fmt.Errorf("search query could not be completed: %w", err)
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

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error during search iteration")
	}

	return results, nil
}

// Document retrieves a document by unique ID.
func (s *SQLiteSearcher) Document(ctx context.Context, id string) (Document, error) {
	if s == nil || s.db == nil {
		return Document{}, errors.New("searcher not initialized")
	}

	if id == "" {
		return Document{}, errors.New("document ID cannot be empty")
	}

	querySQL := `SELECT id, source, title, url, body_html, attribution FROM documents WHERE id = ? LIMIT 1;`
	row := s.db.QueryRowContext(ctx, querySQL, id)

	var doc Document
	if err := row.Scan(&doc.ID, &doc.Source, &doc.Title, &doc.URL, &doc.BodyHTML, &doc.Attribution); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Document{}, fmt.Errorf("document with id %q not found", id)
		}
		return Document{}, fmt.Errorf("error retrieving document: %w", err)
	}

	return doc, nil
}

// buildFTSQuery splits input into alphanumeric tokens and escapes quotes, joining with AND.
func buildFTSQuery(input string) string {
	words := strings.Fields(input)
	cleanTokens := make([]string, 0, len(words))

	for _, w := range words {
		var b strings.Builder
		for _, r := range w {
			if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
				b.WriteRune(r)
			}
		}
		token := b.String()
		if token != "" {
			// Enclose each token in double quotes to prevent FTS operator injection
			cleanTokens = append(cleanTokens, `"`+token+`"`)
		}
	}

	if len(cleanTokens) == 0 {
		return ""
	}

	return strings.Join(cleanTokens, " AND ")
}
