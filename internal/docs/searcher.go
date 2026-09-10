package docs

import "context"

// Searcher defines read-only search and retrieval operations for documentation.
type Searcher interface {
	Search(ctx context.Context, q Query) ([]SearchResult, error)
	Document(ctx context.Context, id string) (Document, error)
	Ready() error
}
