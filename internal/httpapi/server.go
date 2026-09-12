package httpapi

import (
	"encoding/json"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"developer-toolbox/internal/auth"
	"developer-toolbox/internal/config"
	"developer-toolbox/internal/docs"
	"developer-toolbox/internal/extensions"
	"developer-toolbox/internal/team"
)

// ResponseWriter wrapper to capture status code for logging.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// ContentSecurityPolicy is the policy sent with every response.
//
// script-src stays at 'self' with no 'unsafe-inline' and no remote origin: that is
// the control that actually prevents script injection, and it is never relaxed.
// style-src additionally permits 'unsafe-inline' because the Preact UI sets layout
// through inline style attributes, including values computed at render time (tree
// indentation depth, canvas dimensions, conditional grid templates). CSP governs
// style attributes through style-src when style-src-attr is unset, so without this
// the browser silently drops every one of them and the layout collapses. See
// docs/adr/0006-content-security-policy-style-src.md for the threat analysis.
const ContentSecurityPolicy = "default-src 'self'; " +
	"connect-src 'self'; " +
	"img-src 'self' data: blob:; " +
	"style-src 'self' 'unsafe-inline'; " +
	"script-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'none'; " +
	"frame-ancestors 'none'"

// ClientRoutes are the SPA paths the browser application handles. The server serves
// index.html for these so a deep link or a refresh works, and 404s anything else.
//
// This list is the server's half of the routing contract in
// apps/web/src/app/routes.tsx; adding a page there means adding it here.
var ClientRoutes = []string{
	"/",
	"/docs",
	"/data",
	"/regex",
	"/text",
	"/code-image",
	"/api-workbench",
	"/diagrams",
	"/git",
	"/algorithms",
	"/command",
	"/jwt",
	"/query",
	"/types",
	"/sql",
	"/cron",
	"/diff",
	"/team",
	"/admin",
}

// isClientRoute reports whether a path should be served the SPA shell. A route may
// carry sub-paths (for example /docs/typescript/interfaces), so a prefix match is
// used, anchored on a segment boundary.
func isClientRoute(cleanPath string) bool {
	for _, route := range ClientRoutes {
		if cleanPath == route {
			return true
		}
		if route != "/" && strings.HasPrefix(cleanPath, route+"/") {
			return true
		}
	}
	return false
}

// Options carries the optional subsystems a caller can mount onto the server.
// Everything here is off unless explicitly supplied, so the anonymous localhost
// profile is the zero value.
type Options struct {
	// TeamStore is the writable workspace database. Team routes only become active
	// when this is non-nil and cfg.TeamMode is true.
	TeamStore *team.Store

	// Extensions holds the registered Phase 4 extensions. Each one registers its own
	// routes only when its feature flag is enabled.
	Extensions *extensions.Registry

	// TeamValidator overrides the OIDC token validator built from the configuration.
	// Used by tests and by deployments that pin signing keys out of band.
	TeamValidator *auth.TokenValidator
}

// Option mutates server Options.
type Option func(*Options)

// WithTeamStore mounts authenticated team-mode routes backed by the given store.
func WithTeamStore(store *team.Store) Option {
	return func(o *Options) { o.TeamStore = store }
}

// WithExtensions mounts the routes and health endpoints of every enabled extension.
func WithExtensions(reg *extensions.Registry) Option {
	return func(o *Options) { o.Extensions = reg }
}

// WithTeamValidator supplies the OIDC token validator for team routes.
func WithTeamValidator(v *auth.TokenValidator) Option {
	return func(o *Options) { o.TeamValidator = v }
}

// NewServer configures and returns the HTTP handler for the toolbox service.
//
// The three-argument form is the core, anonymous, localhost profile. Optional
// subsystems (team mode, Phase 4 extensions) are mounted by passing Options, which
// keeps the documented base signature intact for callers that need nothing else.
func NewServer(cfg config.Config, searcher docs.Searcher, assets fs.FS, opts ...Option) http.Handler {
	var options Options
	for _, apply := range opts {
		apply(&options)
	}
	mux := http.NewServeMux()

	// Liveness probe
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Readiness probe
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if searcher == nil || searcher.Ready() != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})

	// Docs search endpoint
	mux.HandleFunc("GET /api/docs/search", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if searcher == nil || searcher.Ready() != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"documentation service unavailable"}`))
			return
		}

		q := r.URL.Query().Get("q")
		source := r.URL.Query().Get("source")
		limitStr := r.URL.Query().Get("limit")

		limit := 20
		if limitStr != "" {
			var err error
			limit, err = strconv.Atoi(limitStr)
			if err != nil || limit < 1 || limit > 50 {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"limit must be an integer between 1 and 50"}`))
				return
			}
		}

		query := docs.Query{
			Text:   q,
			Source: source,
			Limit:  limit,
		}

		results, err := searcher.Search(r.Context(), query)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		if results == nil {
			results = []docs.SearchResult{}
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(results)
	})

	// Docs document by ID endpoint
	mux.HandleFunc("GET /api/docs/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if searcher == nil || searcher.Ready() != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"documentation service unavailable"}`))
			return
		}

		id := r.PathValue("id")
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"document id is required"}`))
			return
		}

		doc, err := searcher.Document(r.Context(), id)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"document not found"}`))
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(doc)
	})

	// User docs store accessor
	getUserStore := func() *docs.UserStore {
		if ms, ok := searcher.(*docs.MultiSearcher); ok {
			return ms.UserStore()
		}
		if us, ok := searcher.(*docs.UserStore); ok {
			return us
		}
		return nil
	}

	// List custom/user-uploaded documents
	mux.HandleFunc("GET /api/docs/custom", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userStore := getUserStore()
		if userStore == nil || userStore.Ready() != nil {
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode([]docs.UserDocumentSummary{})
			return
		}

		summaries, err := userStore.ListDocuments(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		if summaries == nil {
			summaries = []docs.UserDocumentSummary{}
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(summaries)
	})

	// Upload user document (Markdown, HTML, or Text)
	mux.HandleFunc("POST /api/docs/upload", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userStore := getUserStore()
		if userStore == nil || userStore.Ready() != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "user document store unavailable"})
			return
		}

		// Enforce maximum body size of 10 MB + overhead for multipart
		r.Body = http.MaxBytesReader(w, r.Body, 12*1024*1024)
		if err := r.ParseMultipartForm(12 * 1024 * 1024); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "file too large or invalid multipart form"})
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "missing 'file' field in multipart request"})
			return
		}
		defer file.Close()

		if header.Size > 10*1024*1024 {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "document exceeds maximum allowed size of 10 MB"})
			return
		}

		contentBytes, err := io.ReadAll(file)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "failed to read file content"})
			return
		}

		title := strings.TrimSpace(r.FormValue("title"))
		doc, err := userStore.InsertDocument(r.Context(), docs.UserDocumentInput{
			Title:    title,
			Filename: header.Filename,
			Content:  string(contentBytes),
		})
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(doc)
	})

	// Delete custom/user-uploaded document by ID
	mux.HandleFunc("DELETE /api/docs/custom/{id...}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userStore := getUserStore()
		if userStore == nil || userStore.Ready() != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "user document store unavailable"})
			return
		}

		id := r.PathValue("id")
		if id == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "document id is required"})
			return
		}

		// Ensure prefix if omitted
		if !strings.HasPrefix(id, "user/") {
			id = "user/" + id
		}

		if err := userStore.DeleteDocument(r.Context(), id); err != nil {
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "id": id})
	})

	// Team mode routes. The handler derives its settings from the centrally parsed
	// config, so TOOLBOX_TEAM_MODE actually reaches the router; when team mode is off
	// it registers only the "disabled" probe that the UI uses to hide team controls.
	teamCfg := team.ConfigFromApp(cfg)
	validator := options.TeamValidator
	if validator == nil {
		validator = auth.NewTokenValidator(teamCfg.OIDCIssuer, teamCfg.OIDCAudience)
	}
	teamHandler := NewTeamHandlerWithValidator(teamCfg, options.TeamStore, validator)
	teamHandler.RegisterRoutes(mux)

	// Phase 4 extension routes and per-extension health endpoints. Disabled
	// extensions register nothing at all.
	if options.Extensions != nil {
		if err := options.Extensions.InitializeRoutes(cfg, mux); err != nil {
			// A registration failure means an enabled extension is misconfigured.
			// Surface it loudly rather than serving a half-mounted extension.
			slog.Error("extension route registration failed", "error", err)
		}
	}

	// Static assets and SPA routing
	if assets != nil {
		fileServer := http.FileServer(http.FS(assets))
		mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			cleanPath := path.Clean(r.URL.Path)

			// An unmatched API path must never fall through to the SPA. Returning
			// index.html with 200 makes a missing or disabled endpoint look like a
			// successful call, which is how a disabled extension appeared healthy.
			if strings.HasPrefix(cleanPath, "/api/") {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Cache-Control", "no-store")
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":"endpoint not found"}`))
				return
			}

			// Try to open file directly
			f, err := assets.Open(strings.TrimPrefix(cleanPath, "/"))
			if err == nil {
				defer f.Close()
				info, err := f.Stat()
				if err == nil && !info.IsDir() {
					if strings.HasPrefix(cleanPath, "/assets/") {
						w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
					} else {
						w.Header().Set("Cache-Control", "no-store")
					}
					fileServer.ServeHTTP(w, r)
					return
				}
			}

			// SPA fallback, restricted to the client routes the application actually
			// serves. An unknown path returns 404 rather than a 200 shell, so a typo
			// or a stale link is visible instead of rendering an empty app.
			if !isClientRoute(cleanPath) {
				http.NotFound(w, r)
				return
			}

			indexFile, err := assets.Open("index.html")
			if err == nil {
				defer indexFile.Close()
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Header().Set("Cache-Control", "no-store")
				w.WriteHeader(http.StatusOK)
				_, _ = io.Copy(w, indexFile)
				return
			}

			http.NotFound(w, r)
		})
	}

	// Security headers and audit logging middleware
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		w.Header().Set("Content-Security-Policy", ContentSecurityPolicy)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")

		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			w.Header().Set("Cache-Control", "no-store")
		}

		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		mux.ServeHTTP(rw, r)

		duration := time.Since(start)
		// Structured log with method, path, status, and duration only (no query strings or request bodies)
		slog.Info("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", duration.Milliseconds(),
		)
	})
}
