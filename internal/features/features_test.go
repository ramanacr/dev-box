package features

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"developer-toolbox/internal/config"
	"developer-toolbox/internal/docs"
	"developer-toolbox/internal/extensions"
)

// stubSearcher stands in for the FTS5 searcher.
type stubSearcher struct{}

func (stubSearcher) Search(context.Context, docs.Query) ([]docs.SearchResult, error) {
	return []docs.SearchResult{}, nil
}
func (stubSearcher) Document(context.Context, string) (docs.Document, error) {
	return docs.Document{}, nil
}
func (stubSearcher) Ready() error { return nil }

// mount builds the registry for a config and returns a mux with its routes applied.
func mount(t *testing.T, cfg config.Config, deps Dependencies) (*http.ServeMux, docs.Searcher) {
	t.Helper()

	registry, searcher, err := Build(cfg, deps)
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}

	mux := http.NewServeMux()
	if err := registry.InitializeRoutes(cfg, mux); err != nil {
		t.Fatalf("initialize routes: %v", err)
	}
	return mux, searcher
}

func status(t *testing.T, mux *http.ServeMux, method, path string, body string) int {
	t.Helper()

	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}

	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec.Code
}

// TestCoreProfileRegistersNoExtensions is the acceptance condition from the Phase 4
// plan: the core image must remain functional with every extension disabled, and a
// disabled extension must register no routes at all.
func TestCoreProfileRegistersNoExtensions(t *testing.T) {
	cfg := config.Config{Features: map[string]bool{}}
	core := stubSearcher{}

	mux, searcher := mount(t, cfg, Dependencies{CoreSearcher: core})

	if searcher != docs.Searcher(core) {
		t.Error("the core searcher must be returned unchanged when no extension is enabled")
	}

	for _, path := range []string{
		"/api/ai/evaluate",
		"/api/extensions/ai/health",
		"/api/extensions/typesense/health",
		"/api/extensions/typesense/mirror",
		"/api/extensions/collaboration/health",
	} {
		if got := status(t, mux, http.MethodPost, path, "{}"); got != http.StatusNotFound {
			t.Errorf("%s must not exist in the core profile, got %d", path, got)
		}
	}
}

// TestAIExtensionMountsWhenEnabled is the regression test for Phase 4 having been
// delivered as libraries that were never connected: internal/ai was imported by
// nothing outside its own tests, so no route could ever respond.
func TestAIExtensionMountsWhenEnabled(t *testing.T) {
	cfg := config.Config{
		Features:                 map[string]bool{config.FeatureAI: true},
		AIGatewayURL:             "https://llm.internal.corp/v1",
		AITokenBudget:            1024,
		AIAllowedClassifications: []string{"public", "internal"},
	}

	mux, _ := mount(t, cfg, Dependencies{CoreSearcher: stubSearcher{}})

	// The health endpoint the plan requires for every enabled extension.
	req := httptest.NewRequest(http.MethodGet, "/api/extensions/ai/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected the ai health endpoint to report 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var health map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&health); err != nil {
		t.Fatalf("decode health: %v", err)
	}
	if health["status"] != "healthy" {
		t.Errorf("expected healthy, got %v", health)
	}

	// The policy endpoint must evaluate a request rather than 404.
	body := `{"prompt":"explain this regex","userConsent":true,"classification":"internal"}`
	reqEval := httptest.NewRequest(http.MethodPost, "/api/ai/evaluate", strings.NewReader(body))
	recEval := httptest.NewRecorder()
	mux.ServeHTTP(recEval, reqEval)
	if recEval.Code != http.StatusOK {
		t.Fatalf("expected 200 from the policy endpoint, got %d: %s", recEval.Code, recEval.Body.String())
	}

	var decision map[string]any
	if err := json.NewDecoder(recEval.Body).Decode(&decision); err != nil {
		t.Fatalf("decode decision: %v", err)
	}
	if decision["allowed"] != true {
		t.Errorf("expected an allowed decision, got %v", decision)
	}
	if decision["destination"] != "https://llm.internal.corp/v1" {
		t.Errorf("the decision must disclose the destination, got %v", decision["destination"])
	}
}

func TestAIExtensionDeniesWithoutConsent(t *testing.T) {
	cfg := config.Config{
		Features:                 map[string]bool{config.FeatureAI: true},
		AIGatewayURL:             "https://llm.internal.corp/v1",
		AIAllowedClassifications: []string{"internal"},
	}
	mux, _ := mount(t, cfg, Dependencies{CoreSearcher: stubSearcher{}})

	body := `{"prompt":"explain this","userConsent":false,"classification":"internal"}`
	if got := status(t, mux, http.MethodPost, "/api/ai/evaluate", body); got != http.StatusForbidden {
		t.Errorf("expected 403 without consent, got %d", got)
	}
}

func TestTypesenseExtensionReplacesSearcherAndMountsMirror(t *testing.T) {
	cfg := config.Config{
		Features:     map[string]bool{config.FeatureTypesense: true},
		TypesenseURL: "http://typesense.internal:8108",
	}

	core := stubSearcher{}
	mux, searcher := mount(t, cfg, Dependencies{CoreSearcher: core})

	if searcher == docs.Searcher(core) {
		t.Error("enabling typesense must install the mirror as the active searcher")
	}

	// The mirror endpoint must exist. Without a pack it reports unavailable rather
	// than 404, which distinguishes "not mounted" from "nothing to mirror".
	if got := status(t, mux, http.MethodPost, "/api/extensions/typesense/mirror", ""); got == http.StatusNotFound {
		t.Error("the typesense mirror route must be mounted when the feature is enabled")
	}
}

func TestTypesenseExtensionRequiresURL(t *testing.T) {
	cfg := config.Config{Features: map[string]bool{config.FeatureTypesense: true}}

	if _, _, err := Build(cfg, Dependencies{CoreSearcher: stubSearcher{}}); err == nil {
		t.Fatal("expected an error when typesense is enabled without a base url")
	}
}

// TestCollaborationRequiresTeamMode covers the dependency between the relay and the
// identity/workspace storage it needs. Enabling it alone must not mount a route.
func TestCollaborationRequiresTeamMode(t *testing.T) {
	cfg := config.Config{
		Features: map[string]bool{config.FeatureCollaboration: true},
		TeamMode: false,
	}

	mux, _ := mount(t, cfg, Dependencies{CoreSearcher: stubSearcher{}})

	if got := status(t, mux, http.MethodGet, "/api/collab/workspaces/ws-1/socket", ""); got != http.StatusNotFound {
		t.Errorf("collaboration must not mount without team mode, got %d", got)
	}
}

func TestCollaborationRequiresTeamStore(t *testing.T) {
	cfg := config.Config{
		Features: map[string]bool{config.FeatureCollaboration: true},
		TeamMode: true,
	}

	// Team mode on but no store supplied: this is a misconfiguration and must be
	// reported rather than mounting a relay with no membership source.
	if _, _, err := Build(cfg, Dependencies{CoreSearcher: stubSearcher{}}); err == nil {
		t.Fatal("expected an error when collaboration has no workspace store")
	}
}

// TestDuplicateExtensionNameFailsStartup covers the admission-framework requirement
// that a duplicate registration is a startup failure, not a silent overwrite.
func TestDuplicateExtensionNameFailsStartup(t *testing.T) {
	cfg := config.Config{
		Features:                 map[string]bool{config.FeatureAI: true},
		AIGatewayURL:             "https://llm.internal.corp/v1",
		AIAllowedClassifications: []string{"internal"},
	}

	registry, _, err := Build(cfg, Dependencies{CoreSearcher: stubSearcher{}})
	if err != nil {
		t.Fatalf("build: %v", err)
	}

	if err := registry.Register(&AIExtension{Gateway: nil}); err == nil {
		t.Fatal("registering a second extension under the same name must fail")
	}
}

// TestEnabledExtensionWithoutDependenciesIsReported proves Register fails loudly
// rather than mounting a half-configured extension.
func TestEnabledExtensionWithoutDependenciesIsReported(t *testing.T) {
	registry, err := registryWith(&TypesenseExtension{Backend: nil})
	if err != nil {
		t.Fatalf("register: %v", err)
	}

	cfg := config.Config{Features: map[string]bool{config.FeatureTypesense: true}}
	if err := registry.InitializeRoutes(cfg, http.NewServeMux()); err == nil {
		t.Fatal("expected route initialization to fail for an unconfigured extension")
	}
}

// registryWith builds a registry containing exactly the given extensions.
func registryWith(exts ...extensions.Extension) (*extensions.Registry, error) {
	registry := extensions.NewRegistry()
	for _, ext := range exts {
		if err := registry.Register(ext); err != nil {
			return nil, err
		}
	}
	return registry, nil
}
