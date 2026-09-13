package observability

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// TestCounterAccumulates covers the basic contract and the label-keyed series
// split.
func TestCounterAccumulates(t *testing.T) {
	reg := NewRegistry()
	reg.Counter("toolbox_test_total", "help", Labels("route", "/a"))
	reg.Counter("toolbox_test_total", "help", Labels("route", "/a"))
	reg.Counter("toolbox_test_total", "help", Labels("route", "/b"))

	out := reg.Gather()
	if !strings.Contains(out, `toolbox_test_total{route="/a"} 2`) {
		t.Errorf("expected /a to be 2:\n%s", out)
	}
	if !strings.Contains(out, `toolbox_test_total{route="/b"} 1`) {
		t.Errorf("expected /b to be 1:\n%s", out)
	}
	if !strings.Contains(out, "# TYPE toolbox_test_total counter") {
		t.Errorf("missing TYPE header:\n%s", out)
	}
}

// TestLabelOrderIsNormalised guards the map key: the same logical series must not
// split in two because a caller passed labels in a different order.
func TestLabelOrderIsNormalised(t *testing.T) {
	reg := NewRegistry()
	reg.Counter("toolbox_test_total", "help", Labels("a", "1", "b", "2"))
	reg.Counter("toolbox_test_total", "help", Labels("b", "2", "a", "1"))

	if got := strings.Count(reg.Gather(), "toolbox_test_total{"); got != 1 {
		t.Errorf("expected one series, got %d:\n%s", got, reg.Gather())
	}
	if !strings.Contains(reg.Gather(), `{a="1",b="2"} 2`) {
		t.Errorf("expected the merged series to be 2:\n%s", reg.Gather())
	}
}

// TestHistogramBucketsAreCumulative is the property a scraper depends on: each le
// bucket must include everything at or below its boundary, and +Inf must equal the
// observation count.
func TestHistogramBucketsAreCumulative(t *testing.T) {
	reg := NewRegistry()
	buckets := []float64{1, 10, 100}
	for _, v := range []float64{0.5, 5, 50, 500} {
		reg.ObserveWithBuckets("toolbox_test_seconds", "help", nil, v, buckets)
	}

	out := reg.Gather()
	for _, want := range []string{
		`toolbox_test_seconds_bucket{le="1"} 1`,
		`toolbox_test_seconds_bucket{le="10"} 2`,
		`toolbox_test_seconds_bucket{le="100"} 3`,
		`toolbox_test_seconds_bucket{le="+Inf"} 4`,
		`toolbox_test_seconds_count 4`,
		`toolbox_test_seconds_sum 555.5`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

// TestHistogramBucketsAreFixedAtFirstUse covers the corruption guard: changing a
// histogram's boundaries mid-process would invalidate every series already
// recorded against it.
func TestHistogramBucketsAreFixedAtFirstUse(t *testing.T) {
	reg := NewRegistry()
	reg.ObserveWithBuckets("toolbox_test_seconds", "help", nil, 1, []float64{1, 2})
	reg.ObserveWithBuckets("toolbox_test_seconds", "help", nil, 1, []float64{100, 200})

	if strings.Contains(reg.Gather(), `le="100"`) {
		t.Errorf("later buckets must not replace the originals:\n%s", reg.Gather())
	}
}

func TestGaugeAddGoesNegativeAndBack(t *testing.T) {
	reg := NewRegistry()
	reg.GaugeAdd("toolbox_test_inflight", "help", nil, 1)
	reg.GaugeAdd("toolbox_test_inflight", "help", nil, 1)
	reg.GaugeAdd("toolbox_test_inflight", "help", nil, -2)

	if !strings.Contains(reg.Gather(), "toolbox_test_inflight 0") {
		t.Errorf("expected 0:\n%s", reg.Gather())
	}
}

// TestLabelValuesAreEscaped guards the whole endpoint: one unescaped quote
// produces a line no scraper can parse, which silently drops every metric.
func TestLabelValuesAreEscaped(t *testing.T) {
	reg := NewRegistry()
	reg.Counter("toolbox_test_total", "help", Labels("v", `a"b\c`+"\n"+"d"))

	out := reg.Gather()
	if !strings.Contains(out, `v="a\"b\\c\nd"`) {
		t.Errorf("label value not escaped:\n%s", out)
	}
	// Exactly one metric line, i.e. the newline did not break the series in two.
	if got := strings.Count(out, "toolbox_test_total{"); got != 1 {
		t.Errorf("expected one line, got %d:\n%s", got, out)
	}
}

// TestGatherIsStable keeps the endpoint diffable and these tests deterministic.
func TestGatherIsStable(t *testing.T) {
	reg := NewRegistry()
	for _, route := range []string{"/z", "/a", "/m"} {
		reg.Counter("toolbox_test_total", "help", Labels("route", route))
	}
	if reg.Gather() != reg.Gather() {
		t.Error("Gather is not stable across calls")
	}
}

// TestConcurrentRecording is what -race actually checks here.
func TestConcurrentRecording(t *testing.T) {
	reg := NewRegistry()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				reg.Counter("toolbox_test_total", "help", Labels("route", "/a"))
				reg.Observe("toolbox_test_seconds", "help", nil, 0.01)
				reg.GaugeAdd("toolbox_test_gauge", "help", nil, 1)
			}
		}()
	}
	wg.Wait()

	if !strings.Contains(reg.Gather(), `toolbox_test_total{route="/a"} 1000`) {
		t.Errorf("lost increments:\n%s", reg.Gather())
	}
}

// TestRouteLabelIsBounded is the cardinality guard. An id in the path must never
// reach a metric label.
func TestRouteLabelIsBounded(t *testing.T) {
	cases := map[string]string{
		"/api/docs/search":                       "/api/docs/search",
		"/api/docs/typescript/interfaces":        "/api/docs/{id}",
		"/api/docs/regex/catastrophic":           "/api/docs/{id}",
		"/api/team/workspaces/9f3a-bb12/members": "/api/team/workspaces/{id}",
		"/healthz":                               "/healthz",
		"/metrics":                               "/metrics",
		"/assets/index-a8f3.js":                  "static",
		"/":                                      "static",
		"/api/nonsense/whatever":                 "other",
	}
	for path, want := range cases {
		if got := RouteLabel(path); got != want {
			t.Errorf("RouteLabel(%q) = %q, want %q", path, got, want)
		}
	}
}

// TestDistinctDocumentIDsShareOneSeries states the cardinality property directly,
// rather than only through the label mapping.
func TestDistinctDocumentIDsShareOneSeries(t *testing.T) {
	reg := NewRegistry()
	handler := Instrument(reg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	for _, id := range []string{"a", "b", "c", "d", "e"} {
		req := httptest.NewRequest(http.MethodGet, "/api/docs/source/"+id, nil)
		handler.ServeHTTP(httptest.NewRecorder(), req)
	}

	out := reg.Gather()
	if got := strings.Count(out, MetricRequestsTotal+"{"); got != 1 {
		t.Errorf("five document ids produced %d series, expected 1:\n%s", got, out)
	}
	if !strings.Contains(out, `route="/api/docs/{id}",status="200"} 5`) {
		t.Errorf("expected a single series of 5:\n%s", out)
	}
}

func TestMethodLabelIsBounded(t *testing.T) {
	if got := methodLabel("PROPFIND"); got != "other" {
		t.Errorf("unknown verb must collapse to other, got %q", got)
	}
	if got := methodLabel(http.MethodGet); got != http.MethodGet {
		t.Errorf("GET must pass through, got %q", got)
	}
}

// TestRequestIDGeneratedAndEchoed covers the correlation contract.
func TestRequestIDGeneratedAndEchoed(t *testing.T) {
	reg := NewRegistry()
	var seen string
	handler := Instrument(reg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = RequestIDFrom(r.Context())
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if seen == "" {
		t.Fatal("handler received no request id")
	}
	if got := rec.Header().Get(RequestIDHeader); got != seen {
		t.Errorf("response header %q does not match context id %q", got, seen)
	}
	if len(seen) != 32 {
		t.Errorf("expected a 128-bit hex id, got %q", seen)
	}
}

// TestUpstreamRequestIDWins lets a request be followed across the whole hop chain
// instead of acquiring a new identity at this boundary.
func TestUpstreamRequestIDWins(t *testing.T) {
	reg := NewRegistry()
	var seen string
	handler := Instrument(reg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = RequestIDFrom(r.Context())
	}))

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set(RequestIDHeader, "edge-abc123")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if seen != "edge-abc123" {
		t.Errorf("upstream id must win, got %q", seen)
	}
}

// TestHostileRequestIDRejected is the log-injection guard.
func TestHostileRequestIDRejected(t *testing.T) {
	for _, hostile := range []string{
		"abc\ndef",
		`abc" injected="yes`,
		"abc def",
		strings.Repeat("x", 65) + "\n",
	} {
		if got := sanitizeRequestID(hostile); got != "" {
			t.Errorf("sanitizeRequestID(%q) = %q, want rejection", hostile, got)
		}
	}

	// An over-long but otherwise clean id is truncated rather than rejected.
	if got := sanitizeRequestID(strings.Repeat("a", 100)); len(got) != 64 {
		t.Errorf("expected truncation to 64, got %d", len(got))
	}
}

func TestTraceParentParsing(t *testing.T) {
	valid := "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
	if got := parseTraceID(valid); got != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Errorf("valid traceparent not parsed, got %q", got)
	}

	for _, bad := range []string{
		"",
		"garbage",
		"00-tooshort-00f067aa0ba902b7-01",
		"00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01", // uppercase is invalid
		"00-00000000000000000000000000000000-00f067aa0ba902b7-01", // all-zero is invalid
	} {
		if got := parseTraceID(bad); got != "" {
			t.Errorf("parseTraceID(%q) = %q, want rejection", bad, got)
		}
	}
}

// TestInFlightReturnsToZero guards the deferred decrement, including on a handler
// that panics.
func TestInFlightReturnsToZero(t *testing.T) {
	reg := NewRegistry()
	handler := Instrument(reg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("handler exploded")
	}))

	func() {
		defer func() { _ = recover() }()
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/healthz", nil))
	}()

	if !strings.Contains(reg.Gather(), `toolbox_http_requests_in_flight{route="/healthz"} 0`) {
		t.Errorf("in-flight did not return to zero after a panic:\n%s", reg.Gather())
	}
}

// TestStatusIsRecorded covers the recorder, including the implicit 200 from a
// handler that writes a body without calling WriteHeader.
func TestStatusIsRecorded(t *testing.T) {
	reg := NewRegistry()
	handler := Instrument(reg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/readyz" {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte("body"))
	}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/healthz", nil))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/readyz", nil))

	out := reg.Gather()
	if !strings.Contains(out, `route="/healthz",status="200"} 1`) {
		t.Errorf("implicit 200 not recorded:\n%s", out)
	}
	if !strings.Contains(out, `route="/readyz",status="503"} 1`) {
		t.Errorf("503 not recorded:\n%s", out)
	}
}

func TestMetricsHandlerContentType(t *testing.T) {
	reg := NewRegistry()
	reg.Counter("toolbox_test_total", "help", nil)

	rec := httptest.NewRecorder()
	Handler(reg).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	// The version parameter is what tells a scraper which exposition format this
	// is; omitting it makes some scrapers fall back to a different parser.
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "version=0.0.4") {
		t.Errorf("unexpected content type %q", ct)
	}
	if !strings.Contains(rec.Body.String(), "toolbox_test_total") {
		t.Errorf("metric missing from body:\n%s", rec.Body.String())
	}
}

func TestSetBuildInfo(t *testing.T) {
	reg := NewRegistry()
	SetBuildInfo(reg, "v1.2.3", "abc1234", "go1.27.0")

	out := reg.Gather()
	if !strings.Contains(out, `toolbox_build_info{commit="abc1234",go_version="go1.27.0",version="v1.2.3"} 1`) {
		t.Errorf("build info not exported as expected:\n%s", out)
	}
}
