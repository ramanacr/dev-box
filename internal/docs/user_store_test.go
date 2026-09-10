package docs

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestUserStore(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "user-docs.db")

	store, err := OpenUserStore(dbPath)
	if err != nil {
		t.Fatalf("failed to open user store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	t.Run("Insert and Search Markdown Document", func(t *testing.T) {
		docInput := UserDocumentInput{
			Title:    "Custom Microservice Architecture",
			Filename: "architecture.md",
			Content: `# Custom Microservice Architecture
## Overview
Our internal architecture relies on **event-driven orchestration** with Kafka and Go services.
`,
		}

		doc, err := store.InsertDocument(ctx, docInput)
		if err != nil {
			t.Fatalf("failed to insert document: %v", err)
		}

		if doc.Title != "Custom Microservice Architecture" {
			t.Errorf("expected title 'Custom Microservice Architecture', got %q", doc.Title)
		}
		if !strings.HasPrefix(doc.ID, "user/") {
			t.Errorf("expected ID prefix 'user/', got %q", doc.ID)
		}

		// Search for event-driven
		results, err := store.Search(ctx, Query{Text: "event-driven", Limit: 10})
		if err != nil {
			t.Fatalf("search error: %v", err)
		}
		if len(results) == 0 {
			t.Fatal("expected at least 1 result for 'event-driven'")
		}
		if results[0].ID != doc.ID {
			t.Errorf("expected result ID %q, got %q", doc.ID, results[0].ID)
		}
		if results[0].Source != "user" {
			t.Errorf("expected source 'user', got %q", results[0].Source)
		}

		// Retrieve by ID
		retrieved, err := store.Document(ctx, doc.ID)
		if err != nil {
			t.Fatalf("failed to retrieve document: %v", err)
		}
		if !strings.Contains(retrieved.BodyHTML, "Kafka") {
			t.Errorf("expected HTML body to contain Kafka, got %q", retrieved.BodyHTML)
		}
	})

	t.Run("List and Delete Document", func(t *testing.T) {
		summaries, err := store.ListDocuments(ctx)
		if err != nil {
			t.Fatalf("failed to list documents: %v", err)
		}
		if len(summaries) == 0 {
			t.Fatal("expected at least 1 document in listing")
		}

		docID := summaries[0].ID
		if err := store.DeleteDocument(ctx, docID); err != nil {
			t.Fatalf("failed to delete document %q: %v", docID, err)
		}

		// Search should now be empty
		resultsAfter, err := store.Search(ctx, Query{Text: "event-driven", Limit: 10})
		if err != nil {
			t.Fatalf("search error: %v", err)
		}
		if len(resultsAfter) != 0 {
			t.Errorf("expected 0 results after deletion, got %d", len(resultsAfter))
		}
	})

	t.Run("Validation Rejections", func(t *testing.T) {
		_, err := store.InsertDocument(ctx, UserDocumentInput{Content: "   "})
		if err == nil {
			t.Fatal("expected error for empty content, got nil")
		}
	})
}
