package docs

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

// PackManifest specifies metadata, integrity checksum, and legal attribution for a documentation pack.
type PackManifest struct {
	ID       string           `json:"id"`
	Version  string           `json:"version"`
	Database string           `json:"database"`
	SHA256   string           `json:"sha256"`
	Sources  []ManifestSource `json:"sources"`
}

// ManifestSource contains source provenance and license information.
type ManifestSource struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	License     string `json:"license"`
	Attribution string `json:"attribution"`
}
