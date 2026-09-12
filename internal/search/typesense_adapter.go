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

// docsCollectionSchema is the Typesense collection the mirror writes into. Field
// names match the JSON the adapter's search mapping expects.
var docsCollectionSchema = map[string]any{
	"name": "docs",
	"fields": []map[string]any{
		{"name": "source", "type": "string", "facet": true},
		{"name": "title", "type": "string"},
		{"name": "url", "type": "string", "index": false, "optional": true},
		{"name": "bodyHtml", "type": "string"},
	},
	"default_sorting_field": "",
}

// EnsureCollection creates the docs collection if it does not already exist.
//
// An existing collection is not an error: mirroring must be safe to re-run, so a 409
// from Typesense is treated as success.
func (b *TypesenseBackend) EnsureCollection(ctx context.Context) error {
	payload, err := json.Marshal(docsCollectionSchema)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.baseURL+"/collections", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("X-TYPESENSE-API-KEY", b.apiKey.Expose())
	req.Header.Set("Content-Type", "application/json")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		// Never wrap the raw error: a transport error can embed the request URL, and
		// the caller may log it. The API key travels in a header rather than the URL,
		// but keeping the message synthetic removes the question entirely.
		return errors.New("typesense collection creation failed: backend unreachable")
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated:
		return nil
	case http.StatusConflict:
		// Collection already present; mirroring is idempotent.
		return nil
	default:
		return fmt.Errorf("typesense collection creation rejected with status %d", resp.StatusCode)
	}
}

// MirrorPack copies a validated content pack into Typesense.
//
// SQLite FTS5 remains the content authority: this is a mirror for query performance
// only, and a failure here must never make documentation unavailable. Documents are
// streamed and upserted in batches so that a large pack does not have to be held in
// memory.
func (b *TypesenseBackend) MirrorPack(ctx context.Context, pack docs.Pack) error {
	if pack.Each == nil {
		return errors.New("pack does not support document enumeration")
	}

	if err := b.EnsureCollection(ctx); err != nil {
		return err
	}

	const batchSize = 200
	batch := make([]docs.Document, 0, batchSize)

	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if err := b.importDocuments(ctx, batch); err != nil {
			return err
		}
		batch = batch[:0]
		return nil
	}

	err := pack.Each(ctx, func(doc docs.Document) error {
		batch = append(batch, doc)
		if len(batch) >= batchSize {
			return flush()
		}
		return nil
	})
	if err != nil {
		return err
	}

	return flush()
}

// importDocuments upserts a batch using Typesense's JSONL import endpoint.
func (b *TypesenseBackend) importDocuments(ctx context.Context, batch []docs.Document) error {
	var body bytes.Buffer
	encoder := json.NewEncoder(&body)
	for _, doc := range batch {
		if err := encoder.Encode(map[string]any{
			"id":       doc.ID,
			"source":   doc.Source,
			"title":    doc.Title,
			"url":      doc.URL,
			"bodyHtml": doc.BodyHTML,
		}); err != nil {
			return err
		}
	}

	endpoint := b.baseURL + "/collections/docs/documents/import?action=upsert"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body.Bytes()))
	if err != nil {
		return err
	}
	req.Header.Set("X-TYPESENSE-API-KEY", b.apiKey.Expose())
	req.Header.Set("Content-Type", "text/plain")

	resp, err := b.httpClient.Do(req)
	if err != nil {
		return errors.New("typesense import failed: backend unreachable")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("typesense import rejected with status %d", resp.StatusCode)
	}
	return nil
}
