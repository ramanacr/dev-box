package search

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"developer-toolbox/internal/docs"
)

type Secret string

func (s Secret) String() string {
	return "••••••••"
}

func (s Secret) Expose() string {
	return string(s)
}

type TypesenseBackend struct {
	baseURL    string
	apiKey     Secret
	httpClient *http.Client
	fallback   docs.Searcher
}

func NewTypesenseBackend(baseURL string, apiKey Secret, fallback docs.Searcher) (*TypesenseBackend, error) {
	if baseURL == "" {
		return nil, errors.New("typesense baseURL cannot be empty")
	}

	return &TypesenseBackend{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
		fallback: fallback,
	}, nil
}

func (b *TypesenseBackend) Search(ctx context.Context, q docs.Query) ([]docs.SearchResult, error) {
	// Query Typesense HTTP search endpoint
	endpoint := fmt.Sprintf("%s/collections/docs/documents/search", b.baseURL)
	u, err := url.Parse(endpoint)
	if err != nil {
		return b.fallbackSearch(ctx, q)
	}

	limit := q.Limit
	if limit <= 0 {
		limit = 20
	}

	params := url.Values{}
	params.Set("q", q.Text)
	params.Set("query_by", "title,content")
	params.Set("per_page", strconv.Itoa(limit))
	if q.Source != "" {
		params.Set("filter_by", fmt.Sprintf("source:=%s", q.Source))
	}
	u.RawQuery = params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return b.fallbackSearch(ctx, q)
	}
	req.Header.Set("X-TYPESENSE-API-KEY", b.apiKey.Expose())

	resp, err := b.httpClient.Do(req)
	if err != nil {
		// Log/notice failure, then fallback to SQLite FTS5
		return b.fallbackSearch(ctx, q)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return b.fallbackSearch(ctx, q)
	}

	var tsResp struct {
		Hits []struct {
			Document struct {
				ID      string `json:"id"`
				Source  string `json:"source"`
				Title   string `json:"title"`
				Excerpt string `json:"excerpt"`
			} `json:"document"`
			Highlights []struct {
				Snippet string `json:"snippet"`
			} `json:"highlights"`
		} `json:"hits"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tsResp); err != nil {
		return b.fallbackSearch(ctx, q)
	}

	results := make([]docs.SearchResult, 0, len(tsResp.Hits))
	for _, hit := range tsResp.Hits {
		snippet := hit.Document.Excerpt
		if len(hit.Highlights) > 0 && hit.Highlights[0].Snippet != "" {
			snippet = hit.Highlights[0].Snippet
		}
		results = append(results, docs.SearchResult{
			ID:      hit.Document.ID,
			Source:  hit.Document.Source,
			Title:   hit.Document.Title,
			Snippet: snippet,
		})
	}

	return results, nil
}

func (b *TypesenseBackend) fallbackSearch(ctx context.Context, q docs.Query) ([]docs.SearchResult, error) {
	if b.fallback != nil {
		return b.fallback.Search(ctx, q)
	}
	return nil, errors.New("typesense unavailable and no fallback searcher configured")
}

func (b *TypesenseBackend) Document(ctx context.Context, id string) (docs.Document, error) {
	if b.fallback != nil {
		return b.fallback.Document(ctx, id)
	}
	return docs.Document{}, errors.New("document retrieval delegated to primary docs store")
}

func (b *TypesenseBackend) Ready() error {
	req, err := http.NewRequest(http.MethodGet, b.baseURL+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("typesense health check status: %d", resp.StatusCode)
	}
	return nil
}

func (b *TypesenseBackend) IndexDocument(ctx context.Context, doc docs.Document) error {
	endpoint := fmt.Sprintf("%s/collections/docs/documents?action=upsert", b.baseURL)
	payload, err := json.Marshal(map[string]any{
		"id":       doc.ID,
		"source":   doc.Source,
		"title":    doc.Title,
		"bodyHtml": doc.BodyHTML,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("X-TYPESENSE-API-KEY", b.apiKey.Expose())
	req.Header.Set("Content-Type", "application/json")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("typesense index failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("typesense indexing rejected with status %d", resp.StatusCode)
	}

	return nil
}
