package docs

import (
	"context"
	"errors"
	"sort"
	"strings"
)

// MultiSearcher federates search and document retrieval across core packs and user uploads.
type MultiSearcher struct {
	core Searcher
	user *UserStore
}

// NewMultiSearcher constructs a federated searcher.
func NewMultiSearcher(core Searcher, user *UserStore) *MultiSearcher {
	return &MultiSearcher{
		core: core,
		user: user,
	}
}

func (m *MultiSearcher) Ready() error {
	if m == nil {
		return errors.New("multi searcher not initialized")
	}
	var errs []string
	if m.core != nil {
		if err := m.core.Ready(); err != nil {
			errs = append(errs, "core: "+err.Error())
		}
	}
	if m.user != nil {
		if err := m.user.Ready(); err != nil {
			errs = append(errs, "user: "+err.Error())
		}
	}
	// If at least one is ready, we are ready
	if m.core == nil && m.user == nil {
		return errors.New("no active documentation searchers")
	}
	if len(errs) > 0 && m.core != nil && m.user != nil && m.core.Ready() != nil && m.user.Ready() != nil {
		return errors.New(strings.Join(errs, "; "))
	}
	return nil
}

func (m *MultiSearcher) Search(ctx context.Context, q Query) ([]SearchResult, error) {
	if m == nil {
		return nil, errors.New("multi searcher not initialized")
	}

	source := strings.TrimSpace(q.Source)

	// Direct to user store if filtered for user
	if source == "user" {
		if m.user == nil {
			return []SearchResult{}, nil
		}
		return m.user.Search(ctx, q)
	}

	// Direct to core store if specific non-user source is specified
	if source != "" {
		if m.core == nil {
			return []SearchResult{}, nil
		}
		return m.core.Search(ctx, q)
	}

	// Federated search across both core and user
	var combined []SearchResult

	if m.core != nil && m.core.Ready() == nil {
		coreResults, err := m.core.Search(ctx, q)
		if err == nil {
			combined = append(combined, coreResults...)
		}
	}

	if m.user != nil && m.user.Ready() == nil {
		userResults, err := m.user.Search(ctx, q)
		if err == nil {
			combined = append(combined, userResults...)
		}
	}

	// Sort combined results by BM25 score ascending (lower score = higher relevance in SQLite FTS5)
	sort.Slice(combined, func(i, j int) bool {
		return combined[i].Score < combined[j].Score
	})

	limit := q.Limit
	if limit <= 0 {
		limit = 20
	}
	if len(combined) > limit {
		combined = combined[:limit]
	}

	return combined, nil
}

func (m *MultiSearcher) Document(ctx context.Context, id string) (Document, error) {
	if m == nil {
		return Document{}, errors.New("multi searcher not initialized")
	}

	if strings.HasPrefix(id, "user/") {
		if m.user == nil {
			return Document{}, errors.New("user documentation store unavailable")
		}
		return m.user.Document(ctx, id)
	}

	if m.core != nil {
		doc, err := m.core.Document(ctx, id)
		if err == nil {
			return doc, nil
		}
	}

	if m.user != nil {
		return m.user.Document(ctx, id)
	}

	return Document{}, errors.New("document not found")
}

// UserStore returns the underlying user documentation store for direct management operations.
func (m *MultiSearcher) UserStore() *UserStore {
	return m.user
}
