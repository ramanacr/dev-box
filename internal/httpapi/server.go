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

	"developer-toolbox/internal/config"
	"developer-toolbox/internal/docs"
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

// NewServer configures and returns the HTTP handler for the toolbox service.
func NewServer(cfg config.Config, searcher docs.Searcher, assets fs.FS) http.Handler {
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

	// Team mode routes
	teamHandler := NewTeamHandler(team.Config{Enabled: false}, nil)
	teamHandler.RegisterRoutes(mux)

	// Static assets and SPA routing
	if assets != nil {
		fileServer := http.FileServer(http.FS(assets))
		mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			cleanPath := path.Clean(r.URL.Path)

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

			// SPA fallback to index.html
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

		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
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
