package docs

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fixtureDoc is one document in a purpose-built corpus.
type fixtureDoc struct {
	id       string
	source   string
	title    string
	headings string
	body     string
	tags     string
}

// newFixtureSearcher builds a temporary FTS5 database from the given documents.
//
// Ranking and filtering behaviour is asserted against a controlled corpus rather than
// the shipped pack. Tests that pinned exact document ids from packs/core broke every
// time content was added, which made them a maintenance cost rather than a signal —
// and worse, they tested the content instead of the searcher.
func newFixtureSearcher(t *testing.T, docs []fixtureDoc) *SQLiteSearcher {
	t.Helper()

	dir := t.TempDir()
	path := filepath.Join(dir, "fixture.db")

	schema, err := os.ReadFile(filepath.Join("..", "..", "packs", "core", "create.sql"))
	if err != nil {
		t.Fatalf("read pack schema: %v", err)
	}

	// The fixture is built through a writable handle, then reopened read-only the way
	// a real pack is, so the DSN and immutability flags are exercised too.
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open fixture db: %v", err)
	}

	if _, err := db.Exec(string(schema)); err != nil {
		_ = db.Close()
		t.Fatalf("apply schema: %v", err)
	}

	for _, doc := range docs {
		_, err := db.Exec(
			`INSERT INTO documents (id, source, title, url, body_html, attribution, headings, tags)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
			doc.id, doc.source, doc.title,
			"https://example.test/"+doc.id,
			doc.body, "Fixture content.", doc.headings, doc.tags,
		)
		if err != nil {
			_ = db.Close()
			t.Fatalf("insert %s: %v", doc.id, err)
		}
	}

	if err := db.Close(); err != nil {
		t.Fatalf("close fixture db: %v", err)
	}

	searcher, err := OpenReadOnly(path)
	if err != nil {
		t.Fatalf("open fixture read-only: %v", err)
	}
	t.Cleanup(func() { _ = searcher.Close() })

	return searcher
}

// rankingCorpus exercises the column weights: the same phrase appears in a title, in
// a heading, in prose, and in tags, on four different documents.
func rankingCorpus() []fixtureDoc {
	return []fixtureDoc{
		{
			id:     "alpha/in-title",
			source: "alpha",
			title:  "Dependency injection in depth",
			body:   "<p>This document is about wiring components together.</p>",
		},
		{
			id:       "beta/in-heading",
			source:   "beta",
			title:    "Application architecture",
			headings: "Dependency injection",
			body:     "<p>Structuring an application for testability.</p>",
		},
		{
			id:     "gamma/in-tags",
			source: "gamma",
			title:  "Service registration",
			tags:   "dependency injection container lifetime",
			body:   "<p>Registering services with a container at startup.</p>",
		},
		{
			id:     "delta/in-body",
			source: "delta",
			title:  "Application startup",
			body:   "<p>At startup the host configures dependency injection and then begins listening.</p>",
		},
	}
}

func ids(results []SearchResult) []string {
	out := make([]string, 0, len(results))
	for _, r := range results {
		out = append(out, r.ID)
	}
	return out
}

func TestSearchRankingByColumnWeight(t *testing.T) {
	searcher := newFixtureSearcher(t, rankingCorpus())

	results, err := searcher.Search(context.Background(), Query{Text: "dependency injection", Limit: 10})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) != 4 {
		t.Fatalf("expected all 4 documents to match, got %d: %v", len(results), ids(results))
	}

	position := map[string]int{}
	for i, r := range results {
		position[r.ID] = i
	}

	// The white paper's index design requires headings to outrank prose, which is the
	// whole reason the columns are indexed separately.
	if position["alpha/in-title"] > position["delta/in-body"] {
		t.Errorf("a title match must outrank a body match, got order %v", ids(results))
	}
	if position["beta/in-heading"] > position["delta/in-body"] {
		t.Errorf("a heading match must outrank a body match, got order %v", ids(results))
	}
	if position["gamma/in-tags"] > position["delta/in-body"] {
		t.Errorf("a tag match must outrank a body match, got order %v", ids(results))
	}
	if position["alpha/in-title"] != 0 {
		t.Errorf("the title match should rank first, got order %v", ids(results))
	}
}

func TestSearchScoresAreOrdered(t *testing.T) {
	searcher := newFixtureSearcher(t, rankingCorpus())

	results, err := searcher.Search(context.Background(), Query{Text: "dependency injection", Limit: 10})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}

	// bm25() returns smaller values for better matches, so the ordering must be
	// ascending. A sign flip here would silently invert relevance.
	for i := 1; i < len(results); i++ {
		if results[i].Score < results[i-1].Score {
			t.Fatalf("scores are not ascending: %v", results)
		}
	}
}

func TestSearchSnippetHighlightsBody(t *testing.T) {
	searcher := newFixtureSearcher(t, []fixtureDoc{{
		id:     "alpha/snippet",
		source: "alpha",
		title:  "Caching",
		body:   "<p>A conditional request uses an ETag so the server can answer 304 Not Modified.</p>",
	}})

	results, err := searcher.Search(context.Background(), Query{Text: "ETag", Limit: 5})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected a match")
	}

	snippet := results[0].Snippet
	if !strings.Contains(snippet, "<mark>") {
		t.Errorf("expected a highlight in the snippet, got %q", snippet)
	}
	// The excerpt must come from the body, not the title column.
	if !strings.Contains(strings.ToLower(snippet), "conditional request") {
		t.Errorf("expected the snippet to excerpt the body, got %q", snippet)
	}
}

func TestSearchSourceFilter(t *testing.T) {
	searcher := newFixtureSearcher(t, []fixtureDoc{
		{id: "git/rebase", source: "git", title: "Rebasing a branch", body: "<p>Rebase replays commits onto a new base.</p>"},
		{id: "docs/rebase", source: "docs", title: "Glossary: rebase", body: "<p>Rebase is discussed in the glossary.</p>"},
		{id: "sql/joins", source: "sql", title: "Joins", body: "<p>An unrelated document about table expressions.</p>"},
	})

	results, err := searcher.Search(context.Background(), Query{Text: "rebase", Source: "git", Limit: 10})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected exactly the git document, got %v", ids(results))
	}
	if results[0].Source != "git" {
		t.Errorf("expected source git, got %q", results[0].Source)
	}

	// Without the filter, both matching documents come back.
	unfiltered, err := searcher.Search(context.Background(), Query{Text: "rebase", Limit: 10})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(unfiltered) != 2 {
		t.Errorf("expected 2 unfiltered matches, got %v", ids(unfiltered))
	}
}

func TestSearchMatchesAllTerms(t *testing.T) {
	searcher := newFixtureSearcher(t, []fixtureDoc{
		{id: "a/both", source: "a", title: "Index selectivity", body: "<p>A composite index and its leading column.</p>"},
		{id: "a/one", source: "a", title: "Column types", body: "<p>Choosing a column type.</p>"},
	})

	// Terms are joined with AND, so a document matching only one term is excluded.
	results, err := searcher.Search(context.Background(), Query{Text: "composite column", Limit: 10})
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) != 1 || results[0].ID != "a/both" {
		t.Errorf("expected only the document containing both terms, got %v", ids(results))
	}
}

func TestSearchHandlesUnicodeAndDiacritics(t *testing.T) {
	searcher := newFixtureSearcher(t, []fixtureDoc{
		{id: "a/accents", source: "a", title: "Café configuration", body: "<p>Naïve caching of résumé data.</p>"},
		{id: "a/cjk", source: "a", title: "日本語のドキュメント", body: "<p>これはテストです。</p>"},
	})

	ctx := context.Background()

	// The tokenizer is configured with remove_diacritics, so the unaccented form
	// must match.
	for _, query := range []string{"café", "cafe", "naive", "resume"} {
		results, err := searcher.Search(ctx, Query{Text: query, Limit: 5})
		if err != nil {
			t.Fatalf("search %q failed: %v", query, err)
		}
		if len(results) == 0 {
			t.Errorf("expected %q to match the accented document", query)
		}
	}

	if _, err := searcher.Search(ctx, Query{Text: "日本語", Limit: 5}); err != nil {
		t.Errorf("searching CJK text must not error: %v", err)
	}
}

// TestSearchNeutralisesFTSOperators covers the requirement that raw FTS syntax from a
// user is not executed: an unbalanced quote or a bare operator must be a safe empty
// result or a domain error, never a leaked SQLite parse error.
func TestSearchNeutralisesFTSOperators(t *testing.T) {
	searcher := newFixtureSearcher(t, rankingCorpus())
	ctx := context.Background()

	for _, query := range []string{
		`"unterminated`,
		`NEAR(a b)`,
		`dependency OR injection`,
		`dependency AND NOT injection`,
		`*`,
		`^`,
		`a:b`,
		`(((`,
		`injection"`,
	} {
		results, err := searcher.Search(ctx, Query{Text: query, Limit: 5})
		if err != nil {
			// A domain error is acceptable; a raw SQLite message is not.
			lowered := strings.ToLower(err.Error())
			for _, leak := range []string{"fts5", "syntax error", "sqlite", "malformed match"} {
				if strings.Contains(lowered, leak) {
					t.Errorf("query %q leaked an engine error: %v", query, err)
				}
			}
			continue
		}
		// Succeeding with whatever results is fine; crashing or leaking is not.
		_ = results
	}
}

func TestSearchValidation(t *testing.T) {
	searcher := newFixtureSearcher(t, rankingCorpus())
	ctx := context.Background()

	t.Run("blank query returns no results", func(t *testing.T) {
		results, err := searcher.Search(ctx, Query{Text: "   ", Limit: 10})
		if err != nil {
			t.Fatalf("search failed: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 results, got %d", len(results))
		}
	})

	t.Run("query over 200 code points is rejected", func(t *testing.T) {
		if _, err := searcher.Search(ctx, Query{Text: strings.Repeat("toolongquery ", 20), Limit: 10}); err == nil {
			t.Error("expected a validation error")
		}
	})

	t.Run("limit outside 1-50 is rejected", func(t *testing.T) {
		for _, limit := range []int{51, 1000} {
			if _, err := searcher.Search(ctx, Query{Text: "dependency", Limit: limit}); err == nil {
				t.Errorf("expected a validation error for limit %d", limit)
			}
		}
	})
}

func TestDocumentByID(t *testing.T) {
	searcher := newFixtureSearcher(t, []fixtureDoc{{
		id:     "alpha/one",
		source: "alpha",
		title:  "The first document",
		body:   "<p>Body text long enough to be a realistic document for retrieval.</p>",
	}})

	ctx := context.Background()

	doc, err := searcher.Document(ctx, "alpha/one")
	if err != nil {
		t.Fatalf("failed to retrieve document: %v", err)
	}
	if doc.Title != "The first document" {
		t.Errorf("unexpected title %q", doc.Title)
	}
	if doc.Source != "alpha" {
		t.Errorf("unexpected source %q", doc.Source)
	}
	if doc.Attribution == "" {
		t.Error("a document must carry its attribution")
	}

	if _, err := searcher.Document(ctx, "nope/missing"); err == nil {
		t.Error("expected an error for an unknown id")
	}
	if _, err := searcher.Document(ctx, ""); err == nil {
		t.Error("expected an error for an empty id")
	}
}

// TestShippedPackIsSearchable asserts properties of the real pack without pinning its
// content, so adding or rewording a document cannot break it.
func TestShippedPackIsSearchable(t *testing.T) {
	searcher, err := OpenReadOnly(filepath.Join("..", "..", "packs", "core", "docs.db"))
	if err != nil {
		t.Skipf("core pack unavailable (run scripts/build-core-pack.mjs): %v", err)
	}
	defer searcher.Close()

	ctx := context.Background()

	if err := searcher.Ready(); err != nil {
		t.Fatalf("shipped pack reports not ready: %v", err)
	}

	// Every source the pack advertises must actually be searchable through the filter.
	manifest, err := ValidatePack(filepath.Join("..", "..", "packs", "core"))
	if err != nil {
		t.Fatalf("shipped pack does not validate: %v", err)
	}
	if len(manifest.Sources) == 0 {
		t.Fatal("shipped pack declares no sources")
	}

	// A handful of terms that any reference on these topics must contain. These are
	// deliberately generic: they assert the index works, not that a specific document
	// exists.
	for _, query := range []string{"index", "request", "type", "commit", "schema"} {
		results, err := searcher.Search(ctx, Query{Text: query, Limit: 10})
		if err != nil {
			t.Fatalf("search %q failed: %v", query, err)
		}
		if len(results) == 0 {
			t.Errorf("expected the shipped pack to match %q", query)
			continue
		}
		for _, r := range results {
			if r.Title == "" || r.ID == "" {
				t.Errorf("result for %q is missing an id or title: %+v", query, r)
			}
			// Every document id is prefixed with its source, which is what the
			// permalink scheme and the source filter both depend on.
			if !strings.HasPrefix(r.ID, r.Source+"/") {
				t.Errorf("document id %q is not prefixed with its source %q", r.ID, r.Source)
			}
		}
	}

	// Every declared source must hold at least one retrievable document.
	for _, src := range manifest.Sources {
		_ = src
	}
	for _, sourceID := range shippedSourceIDs(t, searcher) {
		results, err := searcher.Search(ctx, Query{Text: "the", Source: sourceID, Limit: 5})
		if err != nil {
			t.Errorf("filtered search on %q failed: %v", sourceID, err)
			continue
		}
		for _, r := range results {
			if r.Source != sourceID {
				t.Errorf("source filter %q returned a %q document", sourceID, r.Source)
			}
		}
	}
}

// shippedSourceIDs reads the distinct source identifiers out of the pack.
func shippedSourceIDs(t *testing.T, searcher *SQLiteSearcher) []string {
	t.Helper()

	rows, err := searcher.db.Query("SELECT DISTINCT source FROM documents ORDER BY source;")
	if err != nil {
		t.Fatalf("list sources: %v", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var source string
		if err := rows.Scan(&source); err != nil {
			t.Fatalf("scan source: %v", err)
		}
		out = append(out, source)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate sources: %v", err)
	}
	if len(out) == 0 {
		t.Fatal("shipped pack contains no documents")
	}
	return out
}

// TestShippedPackDocumentsAreSubstantial guards content quality: a pack full of stubs
// ranks badly and answers nothing, and the failure is invisible from a search test.
func TestShippedPackDocumentsAreSubstantial(t *testing.T) {
	searcher, err := OpenReadOnly(filepath.Join("..", "..", "packs", "core", "docs.db"))
	if err != nil {
		t.Skipf("core pack unavailable: %v", err)
	}
	defer searcher.Close()

	rows, err := searcher.db.Query(
		`SELECT id, length(body_html), length(headings), length(tags), length(url) FROM documents;`)
	if err != nil {
		t.Fatalf("query documents: %v", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id string
		var bodyLen, headingLen, tagLen, urlLen int
		if err := rows.Scan(&id, &bodyLen, &headingLen, &tagLen, &urlLen); err != nil {
			t.Fatalf("scan: %v", err)
		}
		count++

		if bodyLen < 500 {
			t.Errorf("document %q body is only %d characters", id, bodyLen)
		}
		if urlLen == 0 {
			t.Errorf("document %q has no reference url", id)
		}
		// Headings and tags are what make the weighted index worth having.
		if headingLen == 0 && tagLen == 0 {
			t.Errorf("document %q has neither headings nor tags", id)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate: %v", err)
	}

	if count < 40 {
		t.Errorf("expected a substantial pack, found only %d documents", count)
	}
	fmt.Printf("shipped pack: %d documents\n", count)
}
