package docs

import (
	"context"
	"path/filepath"
	"testing"
)

func TestMultiSearcher(t *testing.T) {
	// Core searcher with test DB
	coreSearcher, err := OpenReadOnly("../../packs/core/docs.db")
	if err != nil {
		t.Fatalf("failed opening core docs: %v", err)
	}
	defer coreSearcher.Close()

	// User store
	tmpDir := t.TempDir()
	userStore, err := OpenUserStore(filepath.Join(tmpDir, "user.db"))
	if err != nil {
		t.Fatalf("failed opening user store: %v", err)
	}
	defer userStore.Close()

	ctx := context.Background()

	// Insert user doc
	userDoc, err := userStore.InsertDocument(ctx, UserDocumentInput{
		Title:    "Custom Rebase Workflow",
		Filename: "rebase-guide.md",
		Content:  "Our team policy requires interactive rebase before merging to main.",
	})
	if err != nil {
		t.Fatalf("failed inserting user doc: %v", err)
	}

	multi := NewMultiSearcher(coreSearcher, userStore)

	t.Run("Federated Search Returns Both Core and User Results", func(t *testing.T) {
		results, err := multi.Search(ctx, Query{Text: "rebase", Limit: 10})
		if err != nil {
			t.Fatalf("multi search error: %v", err)
		}
		if len(results) < 2 {
			t.Fatalf("expected at least 2 results (1 core + 1 user), got %d", len(results))
		}

		hasUser := false
		hasCore := false
		for _, r := range results {
			if r.Source == "user" {
				hasUser = true
			}
			if r.Source == "git" {
				hasCore = true
			}
		}

		if !hasUser || !hasCore {
			t.Errorf("expected both user and core results, got hasUser=%v, hasCore=%v", hasUser, hasCore)
		}
	})

	t.Run("Filter by Source 'user' Excludes Core", func(t *testing.T) {
		results, err := multi.Search(ctx, Query{Text: "rebase", Source: "user", Limit: 10})
		if err != nil {
			t.Fatalf("user search error: %v", err)
		}
		for _, r := range results {
			if r.Source != "user" {
				t.Errorf("expected only user source, got %q", r.Source)
			}
		}
	})

	t.Run("Retrieve User Document via MultiSearcher", func(t *testing.T) {
		doc, err := multi.Document(ctx, userDoc.ID)
		if err != nil {
			t.Fatalf("failed to retrieve user doc: %v", err)
		}
		if doc.Title != "Custom Rebase Workflow" {
			t.Errorf("unexpected doc title: %q", doc.Title)
		}
	})
}
