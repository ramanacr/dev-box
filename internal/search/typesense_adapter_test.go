package search

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"developer-toolbox/internal/docs"
)

type mockFtsFallback struct {
	results []docs.SearchResult
}

func (m *mockFtsFallback) Search(ctx context.Context, q docs.Query) ([]docs.SearchResult, error) {
	return m.results, nil
}
func (m *mockFtsFallback) Document(ctx context.Context, id string) (docs.Document, error) {
	return docs.Document{ID: id, Title: "Fallback Title"}, nil
}
func (m *mockFtsFallback) Ready() error { return nil }

func TestTypesenseBackendSearchSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-TYPESENSE-API-KEY") != "secret-token-123" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		resp := map[string]any{
			"hits": []map[string]any{
				{
					"document": map[string]string{
						"id":      "doc-1",
						"source":  "core",
						"title":   "Typesense Guide",
						"excerpt": "Fast search engine",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	backend, err := NewTypesenseBackend(server.URL, "secret-token-123", nil)
	if err != nil {
		t.Fatalf("unexpected error creating backend: %v", err)
	}

	results, err := backend.Search(context.Background(), docs.Query{Text: "guide"})
	if err != nil {
		t.Fatalf("unexpected search error: %v", err)
	}

	if len(results) != 1 || results[0].ID != "doc-1" {
		t.Fatalf("expected 1 result with ID doc-1, got %v", results)
	}
}

func TestTypesenseFallbackToFTS5OnFailure(t *testing.T) {
	// Server returns 500 error
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	fallback := &mockFtsFallback{
		results: []docs.SearchResult{
			{ID: "fts-fallback-1", Title: "FTS5 Result", Source: "core"},
		},
	}

	backend, err := NewTypesenseBackend(server.URL, "api-key", fallback)
	if err != nil {
		t.Fatalf("unexpected error creating backend: %v", err)
	}

	results, err := backend.Search(context.Background(), docs.Query{Text: "query"})
	if err != nil {
		t.Fatalf("unexpected error during fallback: %v", err)
	}

	if len(results) != 1 || results[0].ID != "fts-fallback-1" {
		t.Fatalf("expected fallback result from FTS5, got %v", results)
	}
}

func TestSecretRedaction(t *testing.T) {
	key := Secret("my-super-secret-key-999")
	if key.String() != "••••••••" {
		t.Errorf("expected secret string representation to be redacted, got %s", key.String())
	}
}
