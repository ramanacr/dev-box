package docs

import (
	"context"
	"strings"
	"testing"
)

func TestSQLiteSearcher(t *testing.T) {
	searcher, err := OpenReadOnly("../../packs/core/docs.db")
	if err != nil {
		t.Fatalf("failed to open test docs database: %v", err)
	}
	defer searcher.Close()

	ctx := context.Background()

	t.Run("Relevance Ranking - Dependency Injection First", func(t *testing.T) {
		results, err := searcher.Search(ctx, Query{Text: "dependency injection", Limit: 10})
		if err != nil {
			t.Fatalf("search failed: %v", err)
		}
		if len(results) == 0 {
			t.Fatal("expected at least 1 result for 'dependency injection'")
		}
		if results[0].ID != "aspnetcore/dependency-injection" {
			t.Errorf("expected first result to be aspnetcore/dependency-injection, got %q", results[0].ID)
		}
		if !strings.Contains(results[0].Snippet, "<mark>") {
			t.Errorf("expected snippet to contain highlight <mark>, got %q", results[0].Snippet)
		}
	})

	t.Run("Source Filter", func(t *testing.T) {
		results, err := searcher.Search(ctx, Query{Text: "rebase", Source: "git", Limit: 10})
		if err != nil {
			t.Fatalf("search failed: %v", err)
		}
		if len(results) != 1 {
			t.Fatalf("expected 1 result for git rebase, got %d", len(results))
		}
		if results[0].Source != "git" {
			t.Errorf("expected source to be git, got %q", results[0].Source)
		}
	})

	t.Run("Empty Query Returns Empty Results", func(t *testing.T) {
		results, err := searcher.Search(ctx, Query{Text: "   ", Limit: 10})
		if err != nil {
			t.Fatalf("search failed: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 results for whitespace query, got %d", len(results))
		}
	})

	t.Run("Query Exceeding 200 Characters Fails Validation", func(t *testing.T) {
		longText := strings.Repeat("toolongquery ", 20)
		_, err := searcher.Search(ctx, Query{Text: longText, Limit: 10})
		if err == nil {
			t.Fatal("expected validation error for query > 200 chars, got nil")
		}
	})

	t.Run("Limit Exceeding 50 Fails Validation", func(t *testing.T) {
		_, err := searcher.Search(ctx, Query{Text: "git", Limit: 51})
		if err == nil {
			t.Fatal("expected validation error for limit > 50, got nil")
		}
	})

	t.Run("Document By ID", func(t *testing.T) {
		doc, err := searcher.Document(ctx, "typescript/interfaces")
		if err != nil {
			t.Fatalf("failed to retrieve document: %v", err)
		}
		if doc.Title != "TypeScript Interfaces and Object Types" {
			t.Errorf("unexpected title: %q", doc.Title)
		}
		if doc.Source != "typescript" {
			t.Errorf("unexpected source: %q", doc.Source)
		}
	})

	t.Run("Document By Unknown ID", func(t *testing.T) {
		_, err := searcher.Document(ctx, "nonexistent/id")
		if err == nil {
			t.Fatal("expected error for non-existent document, got nil")
		}
	})
}
