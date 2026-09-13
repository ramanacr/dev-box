package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"developer-toolbox/internal/config"
	"developer-toolbox/internal/docs"
)

type mockSearcher struct {
	readyErr error
	results  []docs.SearchResult
	doc      docs.Document
	docErr   error
}

func (m *mockSearcher) Search(ctx context.Context, q docs.Query) ([]docs.SearchResult, error) {
	return m.results, nil
}

func (m *mockSearcher) Document(ctx context.Context, id string) (docs.Document, error) {
	if m.docErr != nil {
		return docs.Document{}, m.docErr
	}
	return m.doc, nil
}

func (m *mockSearcher) Ready() error {
	return m.readyErr
}

func TestHealth(t *testing.T) {
	cfg := config.Config{}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json, got %q", ct)
	}
	// Probes and the container smoke test match on the status field, so it has to
	// keep its exact value even as build identity is added alongside it.
	var body struct {
		Status    string `json:"status"`
		Version   string `json:"version"`
		GoVersion string `json:"go_version"`
		Platform  string `json:"platform"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("health body is not JSON: %v (%q)", err, rec.Body.String())
	}
	if body.Status != "ok" {
		t.Errorf(`expected status "ok", got %q`, body.Status)
	}
	if !strings.Contains(rec.Body.String(), `"status":"ok"`) {
		t.Errorf("probes grep for the literal status pair; got %q", rec.Body.String())
	}

	// An unstamped test binary reports the development version rather than
	// inventing one, which is the property that keeps a local build from being
	// mistaken for a release in a bug report.
	if body.Version == "" {
		t.Error("health must report a version")
	}
	if body.GoVersion == "" || body.Platform == "" {
		t.Errorf("health must report the runtime: go=%q platform=%q", body.GoVersion, body.Platform)
	}
}

func TestReady(t *testing.T) {
	cfg := config.Config{}

	// When unavailable
	srvUnavail := NewServer(cfg, &mockSearcher{readyErr: errors.New("db not loaded")}, nil)
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	srvUnavail.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}

	// When available
	srvAvail := NewServer(cfg, &mockSearcher{readyErr: nil}, nil)
	req2 := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec2 := httptest.NewRecorder()
	srvAvail.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec2.Code)
	}
}

func TestSecurityHeaders(t *testing.T) {
	cfg := config.Config{}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	expectedCSP := "default-src 'self'; " +
		"connect-src 'self'; " +
		"img-src 'self' data: blob:; " +
		"style-src 'self' 'unsafe-inline'; " +
		"script-src 'self'; " +
		"object-src 'none'; " +
		"base-uri 'none'; " +
		"frame-ancestors 'none'"
	got := rec.Header().Get("Content-Security-Policy")
	if got != expectedCSP {
		t.Errorf("CSP mismatch:\nexpected: %s\ngot:      %s", expectedCSP, got)
	}

	// script-src is the injection control and must never be relaxed. Assert the
	// dangerous relaxations explicitly so a future edit to the policy string cannot
	// loosen script execution without failing here.
	for _, forbidden := range []string{
		"script-src 'self' 'unsafe-inline'",
		"script-src 'self' 'unsafe-eval'",
		"script-src *",
	} {
		if strings.Contains(got, forbidden) {
			t.Errorf("CSP must not permit %q, got: %s", forbidden, got)
		}
	}
	for _, required := range []string{
		"script-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
		"connect-src 'self'",
	} {
		if !strings.Contains(got, required) {
			t.Errorf("CSP must contain %q, got: %s", required, got)
		}
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("expected nosniff, got %q", got)
	}
	if got := rec.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Errorf("expected no-referrer, got %q", got)
	}
}

func TestSPAFallback(t *testing.T) {
	mockFS := fstest.MapFS{
		"index.html":       &fstest.MapFile{Data: []byte("<!doctype html><html>SPA</html>")},
		"assets/style.css": &fstest.MapFile{Data: []byte("body { color: red; }")},
	}

	cfg := config.Config{}
	srv := NewServer(cfg, &mockSearcher{}, mockFS)

	// Direct asset hit
	reqAsset := httptest.NewRequest(http.MethodGet, "/assets/style.css", nil)
	recAsset := httptest.NewRecorder()
	srv.ServeHTTP(recAsset, reqAsset)

	if recAsset.Code != http.StatusOK {
		t.Fatalf("expected 200 for existing asset, got %d", recAsset.Code)
	}
	if cc := recAsset.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Errorf("expected immutable cache for assets, got %q", cc)
	}

	// SPA route fallback
	reqSPA := httptest.NewRequest(http.MethodGet, "/docs", nil)
	recSPA := httptest.NewRecorder()
	srv.ServeHTTP(recSPA, reqSPA)

	if recSPA.Code != http.StatusOK {
		t.Fatalf("expected 200 for SPA route, got %d", recSPA.Code)
	}
	if body := recSPA.Body.String(); body != "<!doctype html><html>SPA</html>" {
		t.Errorf("expected SPA index.html content, got %q", body)
	}
}

func TestUserDocsEndpoints(t *testing.T) {
	tempDir := t.TempDir()
	userDBPath := tempDir + "/test-user-docs.db"

	userStore, err := docs.OpenUserStore(userDBPath)
	if err != nil {
		t.Fatalf("failed to open user store: %v", err)
	}
	defer userStore.Close()

	multiSearcher := docs.NewMultiSearcher(nil, userStore)
	srv := NewServer(config.Config{}, multiSearcher, nil)

	// 1. Initially custom docs list should be empty
	reqList := httptest.NewRequest(http.MethodGet, "/api/docs/custom", nil)
	recList := httptest.NewRecorder()
	srv.ServeHTTP(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 from list, got %d", recList.Code)
	}

	var initialList []docs.UserDocumentSummary
	if err := json.NewDecoder(recList.Body).Decode(&initialList); err != nil {
		t.Fatalf("failed to decode list: %v", err)
	}
	if len(initialList) != 0 {
		t.Fatalf("expected 0 documents, got %d", len(initialList))
	}

	// 2. Test document upload (multipart/form-data)
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("title", "Runbook for Deployment")
	part, err := writer.CreateFormFile("file", "runbook.md")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	_, _ = part.Write([]byte("# Deployment Guide\nStep 1: Run migrations.\nStep 2: Start service."))
	_ = writer.Close()

	reqUpload := httptest.NewRequest(http.MethodPost, "/api/docs/upload", body)
	reqUpload.Header.Set("Content-Type", writer.FormDataContentType())
	recUpload := httptest.NewRecorder()
	srv.ServeHTTP(recUpload, reqUpload)

	if recUpload.Code != http.StatusCreated {
		t.Fatalf("expected 201 from upload, got %d: %s", recUpload.Code, recUpload.Body.String())
	}

	var createdDoc docs.Document
	if err := json.NewDecoder(recUpload.Body).Decode(&createdDoc); err != nil {
		t.Fatalf("failed to decode created doc: %v", err)
	}
	if createdDoc.Title != "Runbook for Deployment" {
		t.Errorf("expected title 'Runbook for Deployment', got %q", createdDoc.Title)
	}

	// 3. Search should find the uploaded document
	reqSearch := httptest.NewRequest(http.MethodGet, "/api/docs/search?q=migrations", nil)
	recSearch := httptest.NewRecorder()
	srv.ServeHTTP(recSearch, reqSearch)

	if recSearch.Code != http.StatusOK {
		t.Fatalf("expected 200 from search, got %d", recSearch.Code)
	}
	var results []docs.SearchResult
	if err := json.NewDecoder(recSearch.Body).Decode(&results); err != nil {
		t.Fatalf("decode search results: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("expected at least 1 search hit for 'migrations', got 0")
	}

	// 4. Custom list should now have 1 item
	recList2 := httptest.NewRecorder()
	srv.ServeHTTP(recList2, reqList)
	var updatedList []docs.UserDocumentSummary
	_ = json.NewDecoder(recList2.Body).Decode(&updatedList)
	if len(updatedList) != 1 {
		t.Fatalf("expected 1 item in list, got %d", len(updatedList))
	}

	// 5. Delete the uploaded document
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/docs/custom/"+createdDoc.ID, nil)
	recDel := httptest.NewRecorder()
	srv.ServeHTTP(recDel, reqDel)

	if recDel.Code != http.StatusOK {
		t.Fatalf("expected 200 from delete, got %d: %s", recDel.Code, recDel.Body.String())
	}

	// 6. Searching after delete should return 0 results
	recSearch2 := httptest.NewRecorder()
	srv.ServeHTTP(recSearch2, reqSearch)
	var results2 []docs.SearchResult
	_ = json.NewDecoder(recSearch2.Body).Decode(&results2)
	if len(results2) != 0 {
		t.Errorf("expected 0 results after deletion, got %d", len(results2))
	}
}

// TestUnknownAPIPathReturnsJSON404 is the regression test for the SPA fallback
// swallowing unmatched API paths: /api/extensions/typesense/health returned index.html
// with status 200 while the extension was disabled, so a disabled endpoint was
// indistinguishable from a healthy one.
func TestUnknownAPIPathReturnsJSON404(t *testing.T) {
	mockFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html>SPA</html>")},
	}
	srv := NewServer(config.Config{}, &mockSearcher{}, mockFS)

	for _, path := range []string{
		"/api/does-not-exist",
		"/api/extensions/typesense/health",
		"/api/ai/evaluate",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: expected 404, got %d", path, rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
			t.Errorf("%s: expected a JSON response, got %q", path, ct)
		}
		if strings.Contains(rec.Body.String(), "<html") {
			t.Errorf("%s: an API path must never return the SPA shell", path)
		}
	}
}

// TestSPAFallbackOnlyForClientRoutes covers the Phase 1 requirement that the shell is
// served "only for known client routes".
func TestSPAFallbackOnlyForClientRoutes(t *testing.T) {
	mockFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html>SPA</html>")},
	}
	srv := NewServer(config.Config{}, &mockSearcher{}, mockFS)

	// Known routes, including a deep link under one.
	for _, path := range []string{"/", "/docs", "/data", "/api-workbench", "/docs/typescript/interfaces"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("%s: expected the SPA shell, got %d", path, rec.Code)
		}
	}

	// Unknown paths must 404 rather than render an empty application.
	for _, path := range []string{"/not-a-tool", "/wp-admin", "/docsx"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: expected 404, got %d", path, rec.Code)
		}
	}
}

// TestClientRoutesCoverNavigation guards the routing contract between this list and
// the browser application.
func TestClientRoutesCoverNavigation(t *testing.T) {
	required := []string{
		"/", "/docs", "/data", "/regex", "/text", "/code-image",
		"/api-workbench", "/diagrams", "/git", "/algorithms",
		"/command", "/query", "/types", "/jwt", "/diff", "/sql", "/cron", "/encode",
	}

	present := map[string]bool{}
	for _, r := range ClientRoutes {
		present[r] = true
	}
	for _, r := range required {
		if !present[r] {
			t.Errorf("ClientRoutes is missing the navigation route %q", r)
		}
	}
}

// TestDocumentRouteAcceptsMultiSegmentID is the regression test for document ids that
// contain a slash. With a single-segment {id} pattern only the percent-encoded form
// matched, so the natural unencoded path an external client builds returned 404.
func TestDocumentRouteAcceptsMultiSegmentID(t *testing.T) {
	searcher := &mockSearcher{doc: docs.Document{
		ID:          "regex/catastrophic-backtracking",
		Source:      "regex",
		Title:       "Catastrophic backtracking",
		BodyHTML:    "<p>body</p>",
		Attribution: "Fixture.",
	}}
	srv := NewServer(config.Config{}, searcher, nil)

	for _, path := range []string{
		"/api/docs/regex/catastrophic-backtracking",
		"/api/docs/regex%2Fcatastrophic-backtracking",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("%s: expected 200, got %d", path, rec.Code)
			continue
		}

		var doc docs.Document
		if err := json.NewDecoder(rec.Body).Decode(&doc); err != nil {
			t.Errorf("%s: decode: %v", path, err)
			continue
		}
		if doc.ID != "regex/catastrophic-backtracking" {
			t.Errorf("%s: unexpected id %q", path, doc.ID)
		}
	}
}

// TestLiteralDocsRoutesOutrankTheWildcard guards the ServeMux precedence the
// multi-segment document route depends on: /api/docs/search and /api/docs/sources
// must not be swallowed by /api/docs/{id...}.
func TestLiteralDocsRoutesOutrankTheWildcard(t *testing.T) {
	srv := NewServer(config.Config{}, &mockSearcher{}, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/docs/search?q=anything", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("search route: expected 200, got %d", rec.Code)
	}
	// A document response would carry a bodyHtml field; a search response is an array.
	if body := rec.Body.String(); !strings.HasPrefix(strings.TrimSpace(body), "[") {
		t.Errorf("search route did not return a result array: %s", body)
	}

	reqSources := httptest.NewRequest(http.MethodGet, "/api/docs/sources", nil)
	recSources := httptest.NewRecorder()
	srv.ServeHTTP(recSources, reqSources)
	if recSources.Code != http.StatusOK {
		t.Errorf("sources route: expected 200, got %d", recSources.Code)
	}
}

// TestSourcesEndpoint covers the derived source list that replaced the UI's
// hardcoded four-entry filter.
func TestSourcesEndpoint(t *testing.T) {
	tempDir := t.TempDir()
	userStore, err := docs.OpenUserStore(tempDir + "/sources-user.db")
	if err != nil {
		t.Fatalf("open user store: %v", err)
	}
	defer userStore.Close()

	srv := NewServer(config.Config{}, docs.NewMultiSearcher(nil, userStore), nil)

	// With no uploads, the user source is not offered at all.
	req := httptest.NewRequest(http.MethodGet, "/api/docs/sources", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var sources []docs.SourceSummary
	if err := json.NewDecoder(rec.Body).Decode(&sources); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, s := range sources {
		if s.ID == "user" {
			t.Error("the user source must not be listed while no uploads exist")
		}
	}

	// After an upload it appears, with a count.
	if _, err := userStore.InsertDocument(context.Background(), docs.UserDocumentInput{
		Title:    "Runbook",
		Filename: "runbook.md",
		Content:  "# Deploy\nStep one.",
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/docs/sources", nil)
	rec2 := httptest.NewRecorder()
	srv.ServeHTTP(rec2, req2)

	var after []docs.SourceSummary
	if err := json.NewDecoder(rec2.Body).Decode(&after); err != nil {
		t.Fatalf("decode: %v", err)
	}

	found := false
	for _, s := range after {
		if s.ID == "user" {
			found = true
			if s.Count != 1 {
				t.Errorf("expected a count of 1, got %d", s.Count)
			}
			if s.Title == "" {
				t.Error("a source must carry a display title")
			}
		}
	}
	if !found {
		t.Error("expected the user source to be listed after an upload")
	}
}

// TestMetricsEndpointExposesRequests covers the wiring end to end: a request goes
// through the instrumentation, and the scrape reflects it.
func TestMetricsEndpointExposesRequests(t *testing.T) {
	cfg := config.Config{MetricsEnabled: true}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	srv.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/healthz", nil))

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from /metrics, got %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `toolbox_http_requests_total{method="GET",route="/healthz",status="200"} 1`) {
		t.Errorf("health request not recorded:\n%s", body)
	}
	if !strings.Contains(body, "toolbox_http_request_duration_seconds_bucket") {
		t.Errorf("duration histogram missing:\n%s", body)
	}
}

// TestMetricsCanBeDisabled covers the opt-out an operator needs when the port is
// published somewhere less private than loopback.
func TestMetricsCanBeDisabled(t *testing.T) {
	cfg := config.Config{MetricsEnabled: false}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if rec.Code == http.StatusOK {
		t.Error("/metrics must not be served when disabled")
	}
}

// TestRequestIDOnEveryResponse is the correlation contract an operator relies on
// when correlating a user's report with the log stream.
func TestRequestIDOnEveryResponse(t *testing.T) {
	cfg := config.Config{}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Header().Get("X-Request-Id") == "" {
		t.Error("every response must carry a request id")
	}

	// A 404 goes nowhere near a handler, so it is the case most likely to miss
	// the header if instrumentation were mounted inside the mux.
	rec404 := httptest.NewRecorder()
	srv.ServeHTTP(rec404, httptest.NewRequest(http.MethodGet, "/no/such/path", nil))
	if rec404.Header().Get("X-Request-Id") == "" {
		t.Error("a 404 must still carry a request id")
	}
}

// TestMetricsDoNotLeakSearchQueries guards the local-first promise: what a user
// types into the search box must not reach the metrics endpoint, which is the one
// surface designed to be scraped off the machine.
func TestMetricsDoNotLeakSearchQueries(t *testing.T) {
	cfg := config.Config{MetricsEnabled: true}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	const secret = "my-unreleased-project-codename"
	req := httptest.NewRequest(http.MethodGet, "/api/docs/search?q="+secret, nil)
	srv.ServeHTTP(httptest.NewRecorder(), req)

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if strings.Contains(rec.Body.String(), secret) {
		t.Errorf("search query leaked into metrics:\n%s", rec.Body.String())
	}
}

// TestRateLimitRefusesFlood covers the wiring: the limiter is actually mounted,
// and it is stateful across requests.
func TestRateLimitRefusesFlood(t *testing.T) {
	cfg := config.Config{
		RateLimitEnabled: true,
		RateLimitRPS:     20,
		RateLimitBurst:   5,
	}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	refused := 0
	for i := 0; i < 20; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/docs/search?q=x", nil)
		req.RemoteAddr = "10.1.2.3:5000"
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			refused++
		}
	}

	if refused == 0 {
		t.Fatal("a 20-request flood against a burst of 5 was never refused")
	}
}

// TestHealthAndReadyAreNeverRateLimited: an orchestrator probing every few seconds
// must not be able to throttle itself out of the cluster.
func TestHealthAndReadyAreNeverRateLimited(t *testing.T) {
	cfg := config.Config{
		RateLimitEnabled: true,
		RateLimitRPS:     1,
		RateLimitBurst:   1,
	}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	for _, path := range []string{"/healthz", "/readyz"} {
		for i := 0; i < 50; i++ {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.RemoteAddr = "10.1.2.3:5000"
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, req)
			if rec.Code == http.StatusTooManyRequests {
				t.Fatalf("%s was rate limited on request %d", path, i+1)
			}
		}
	}
}

// TestUploadIsHeldToATighterLimitThanSearch pins the route classing. Upload
// writes to SQLite; search does not.
func TestUploadIsHeldToATighterLimitThanSearch(t *testing.T) {
	cfg := config.Config{
		RateLimitEnabled: true,
		RateLimitRPS:     100,
		RateLimitBurst:   100,
	}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	countRefusals := func(path string) int {
		refused := 0
		for i := 0; i < 30; i++ {
			req := httptest.NewRequest(http.MethodPost, path, nil)
			req.RemoteAddr = "10.9.9.9:6000"
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, req)
			if rec.Code == http.StatusTooManyRequests {
				refused++
			}
		}
		return refused
	}

	uploadRefusals := countRefusals("/api/docs/upload")
	searchRefusals := countRefusals("/api/docs/search")

	if uploadRefusals == 0 {
		t.Error("upload should hit the expensive limit within 30 requests")
	}
	if searchRefusals != 0 {
		t.Errorf("search should stay under the standard limit, got %d refusals", searchRefusals)
	}
}

// TestRateLimitCanBeDisabled covers the escape hatch for an operator who fronts
// the service with their own limiter.
func TestRateLimitCanBeDisabled(t *testing.T) {
	cfg := config.Config{RateLimitEnabled: false}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	for i := 0; i < 100; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/docs/search?q=x", nil)
		req.RemoteAddr = "10.1.2.3:5000"
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			t.Fatalf("rate limiting is disabled but request %d was refused", i+1)
		}
	}
}

// TestRefusedRequestsAreStillCounted: a limiter that hides its own refusals is
// undiagnosable, so 429s must reach the metrics.
func TestRefusedRequestsAreStillCounted(t *testing.T) {
	cfg := config.Config{
		MetricsEnabled:   true,
		RateLimitEnabled: true,
		RateLimitRPS:     1,
		RateLimitBurst:   1,
	}
	srv := NewServer(cfg, &mockSearcher{}, nil)

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/docs/search?q=x", nil)
		req.RemoteAddr = "10.4.4.4:7000"
		srv.ServeHTTP(httptest.NewRecorder(), req)
	}

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if !strings.Contains(rec.Body.String(), `status="429"`) {
		t.Errorf("refusals must appear in metrics:\n%s", rec.Body.String())
	}
}
