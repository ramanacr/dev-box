package docs

import "context"

// Document represents a fully indexed documentation page.
type Document struct {
	ID          string `json:"id"`
	Source      string `json:"source"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	BodyHTML    string `json:"bodyHtml"`
	Attribution string `json:"attribution"`
}

// SearchResult represents a matching documentation entry with relevance score and highlight snippet.
type SearchResult struct {
	ID      string  `json:"id"`
	Title   string  `json:"title"`
	URL     string  `json:"url"`
	Snippet string  `json:"snippet"`
	Source  string  `json:"source"`
	Score   float64 `json:"score"`
}

// Query contains search filters and limits.
type Query struct {
	Text   string `json:"text"`
	Source string `json:"source,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

// Pack kinds. A content pack ships a documentation database; a module pack ships
// browser modules (the Git and algorithm sandboxes) and therefore has nothing to
// checksum.
const (
	PackKindContent = "content"
	PackKindModule  = "module"
)

// PackManifest specifies metadata, integrity checksum, and legal attribution for a pack.
type PackManifest struct {
	ID      string `json:"id"`
	Version string `json:"version"`

	// Kind is "content" (default) or "module".
	Kind string `json:"kind,omitempty"`

	// Title and Description are optional human-facing metadata.
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`

	// Database and SHA256 are required for content packs and forbidden for module packs.
	Database string `json:"database,omitempty"`
	SHA256   string `json:"sha256,omitempty"`

	// Modules lists the browser modules a module pack activates.
	Modules []string `json:"modules,omitempty"`

	Sources []ManifestSource `json:"sources"`
}

// ManifestSource contains source provenance and license information.
type ManifestSource struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	License     string `json:"license"`
	Attribution string `json:"attribution"`
}

// Pack is a validated content pack together with a way to stream its documents.
//
// Documents are streamed through Each rather than returned as a slice: a pack that
// passes the Typesense admission gate holds on the order of 250,000 sections, and
// materialising that corpus in memory to mirror it would defeat the small-footprint
// constraint the whole design is built around.
type Pack struct {
	Manifest PackManifest

	// Each invokes fn once per document, stopping early if fn returns an error.
	Each func(ctx context.Context, fn func(Document) error) error
}
