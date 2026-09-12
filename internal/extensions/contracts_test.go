package extensions

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"developer-toolbox/internal/config"
)

type dummyExtension struct {
	name      string
	enabled   bool
	healthErr error
}

func (d *dummyExtension) Name() string                   { return d.name }
func (d *dummyExtension) Enabled(cfg config.Config) bool { return d.enabled }
func (d *dummyExtension) HealthCheck() error             { return d.healthErr }
func (d *dummyExtension) Register(mux *http.ServeMux) error {
	mux.HandleFunc("GET /api/test/"+d.name, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return nil
}

func TestExtensionRegistry(t *testing.T) {
	reg := NewRegistry()

	ext1 := &dummyExtension{name: "typesense", enabled: true}
	ext2 := &dummyExtension{name: "ai-gateway", enabled: false}

	if err := reg.Register(ext1); err != nil {
		t.Fatalf("unexpected error registering ext1: %v", err)
	}

	// Duplicate registration must fail
	if err := reg.Register(ext1); err == nil {
		t.Fatalf("expected error on duplicate registration")
	}

	if err := reg.Register(ext2); err != nil {
		t.Fatalf("unexpected error registering ext2: %v", err)
	}

	mux := http.NewServeMux()
	cfg := config.Config{}
	if err := reg.InitializeRoutes(cfg, mux); err != nil {
		t.Fatalf("unexpected error initializing routes: %v", err)
	}

	// ext1 is enabled -> health route should be present
	req := httptest.NewRequest(http.MethodGet, "/api/extensions/typesense/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for ext1 health, got %d", rec.Code)
	}

	// ext2 is disabled -> health route should 404
	req2 := httptest.NewRequest(http.MethodGet, "/api/extensions/ai-gateway/health", nil)
	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for disabled ext2, got %d", rec2.Code)
	}
}

func TestIsFlagEnabled(t *testing.T) {
	env := map[string]string{
		"TOOLBOX_FEATURE_TYPESENSE": "true",
		"TOOLBOX_FEATURE_AI":        "0",
	}
	lookup := func(k string) string { return env[k] }

	if !IsFlagEnabled("typesense", lookup) {
		t.Errorf("expected typesense to be enabled")
	}
	if IsFlagEnabled("ai", lookup) {
		t.Errorf("expected ai to be disabled")
	}
	if IsFlagEnabled("collab", lookup) {
		t.Errorf("expected unset flag to be disabled")
	}
}
