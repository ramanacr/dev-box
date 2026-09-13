package observability

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Metric names. These follow Prometheus naming conventions: a base unit suffix,
// no units in the label, and _total on counters.
const (
	MetricRequestsTotal    = "toolbox_http_requests_total"
	MetricRequestDuration  = "toolbox_http_request_duration_seconds"
	MetricRequestsInFlight = "toolbox_http_requests_in_flight"
	MetricResponseSize     = "toolbox_http_response_size_bytes"
	MetricBuildInfo        = "toolbox_build_info"
)

// RequestIDHeader is both read and written. An upstream proxy that already
// assigns one wins, so a request can be followed across the whole hop chain
// rather than acquiring a new identity at this boundary.
const RequestIDHeader = "X-Request-Id"

// TraceParentHeader is the W3C trace context header. The trace id is extracted
// for logging so entries correlate with spans from a service that does emit
// traces; this service does not create spans of its own.
const TraceParentHeader = "Traceparent"

type contextKey int

const (
	requestIDKey contextKey = iota
	traceIDKey
)

// RequestIDFrom returns the request id carried on a context, or "" if there is
// none. Handlers use it to tie their own log lines to the request log.
func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

// TraceIDFrom returns the upstream W3C trace id, or "" if the caller sent none.
func TraceIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(traceIDKey).(string)
	return id
}

// newRequestID returns a 128-bit random hex id. It falls back to a timestamp if
// the system entropy source fails, because a request must never fail over an
// identifier that exists only for correlation.
func newRequestID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(buf[:])
}

// parseTraceID extracts the trace-id field from a W3C traceparent header.
//
// The format is version-traceid-spanid-flags, with a 32-hex-character trace id.
// Anything that does not match is discarded rather than logged as-is: the header
// is attacker-controlled, and an unvalidated value would put arbitrary text into
// the log stream.
func parseTraceID(header string) string {
	parts := strings.Split(header, "-")
	if len(parts) < 4 || len(parts[1]) != 32 {
		return ""
	}
	traceID := parts[1]
	for _, c := range traceID {
		isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')
		if !isHex {
			return ""
		}
	}
	// An all-zero trace id is explicitly invalid per the specification.
	if traceID == strings.Repeat("0", 32) {
		return ""
	}
	return traceID
}

// sanitizeRequestID bounds an inbound request id so a proxy header cannot inject
// newlines into the log stream or unbounded label cardinality into metrics. The
// id is never used as a metric label, but it is logged, and log injection is real.
func sanitizeRequestID(raw string) string {
	const maxLen = 64
	if raw == "" {
		return ""
	}
	// Validated before truncation, deliberately. Truncating first would let a
	// hostile trailing byte be silently trimmed away and the remainder accepted,
	// so whether an injection attempt is rejected would depend on where in the
	// string it sat. Rejecting the whole value keeps that predictable.
	for _, c := range raw {
		safe := c == '-' || c == '_' || c == '.' ||
			(c >= '0' && c <= '9') ||
			(c >= 'a' && c <= 'z') ||
			(c >= 'A' && c <= 'Z')
		if !safe {
			return ""
		}
	}
	if len(raw) > maxLen {
		raw = raw[:maxLen]
	}
	return raw
}

// statusRecorder captures the response status and size for metrics and logging.
type statusRecorder struct {
	http.ResponseWriter
	status  int
	written int64
	wrote   bool
}

func (s *statusRecorder) WriteHeader(code int) {
	if !s.wrote {
		s.status = code
		s.wrote = true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if !s.wrote {
		s.status = http.StatusOK
		s.wrote = true
	}
	n, err := s.ResponseWriter.Write(b)
	s.written += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach the underlying writer, which keeps
// flushing and hijacking working for the WebSocket relay through this wrapper.
func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// Instrument returns middleware that assigns a request id, records metrics, and
// makes both available to the wrapped handler through the request context.
//
// It does not log: logging stays in the server's own middleware so there is one
// place that decides what is safe to record. This returns the data that decision
// needs.
func Instrument(reg *Registry, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := sanitizeRequestID(r.Header.Get(RequestIDHeader))
		if requestID == "" {
			requestID = newRequestID()
		}
		traceID := parseTraceID(r.Header.Get(TraceParentHeader))

		ctx := context.WithValue(r.Context(), requestIDKey, requestID)
		if traceID != "" {
			ctx = context.WithValue(ctx, traceIDKey, traceID)
		}

		// Echoed before the handler runs so it is present even on a response the
		// handler writes and returns from immediately.
		w.Header().Set(RequestIDHeader, requestID)

		route := RouteLabel(r.URL.Path)
		inFlightLabels := Labels("route", route)
		reg.GaugeAdd(MetricRequestsInFlight, "In-flight HTTP requests.", inFlightLabels, 1)

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()

		defer func() {
			elapsed := time.Since(start).Seconds()
			reg.GaugeAdd(MetricRequestsInFlight, "In-flight HTTP requests.", inFlightLabels, -1)

			labels := Labels(
				"method", methodLabel(r.Method),
				"route", route,
				"status", strconv.Itoa(rec.status),
			)
			reg.Counter(MetricRequestsTotal, "Total HTTP requests handled.", labels)

			// Duration carries no status label: a latency series split by status
			// multiplies cardinality without answering a question an operator asks.
			durationLabels := Labels("method", methodLabel(r.Method), "route", route)
			reg.Observe(MetricRequestDuration, "HTTP request duration in seconds.", durationLabels, elapsed)
			reg.ObserveWithBuckets(
				MetricResponseSize,
				"HTTP response body size in bytes.",
				durationLabels,
				float64(rec.written),
				responseSizeBuckets,
			)
		}()

		next.ServeHTTP(rec, r.WithContext(ctx))
	})
}

// responseSizeBuckets span an empty JSON error through a full documentation pack
// response.
var responseSizeBuckets = []float64{64, 256, 1024, 4096, 16384, 65536, 262144, 1048576}

// knownMethods bounds the method label. An arbitrary verb from a scanner must not
// create a new time series.
var knownMethods = map[string]bool{
	http.MethodGet: true, http.MethodPost: true, http.MethodPut: true,
	http.MethodPatch: true, http.MethodDelete: true, http.MethodHead: true,
	http.MethodOptions: true,
}

func methodLabel(method string) string {
	if knownMethods[method] {
		return method
	}
	return "other"
}

// routePatterns maps a path prefix to the label reported for it. Order matters:
// the first match wins, so more specific prefixes are listed first.
//
// This exists because the route label must be the pattern, not the path. A label
// carrying the raw path would mint a new time series for every document id and
// every workspace id, which is the classic way a metrics endpoint takes down the
// monitoring system it reports to. Go's ServeMux knows the matched pattern, but
// only inside the mux; this middleware wraps it, so the mapping is explicit here
// and deliberately bounded.
var routePatterns = []struct {
	prefix string
	label  string
}{
	{"/api/docs/search", "/api/docs/search"},
	{"/api/docs/sources", "/api/docs/sources"},
	{"/api/docs/custom", "/api/docs/custom"},
	{"/api/docs/upload", "/api/docs/upload"},
	{"/api/docs/", "/api/docs/{id}"},
	{"/api/team/admin/packs", "/api/team/admin/packs"},
	{"/api/team/workspaces", "/api/team/workspaces/{id}"},
	{"/api/team/me", "/api/team/me"},
	{"/api/collab/", "/api/collab/{id}/socket"},
	{"/api/extensions/", "/api/extensions"},
	{"/api/ai/", "/api/ai"},
	{"/healthz", "/healthz"},
	{"/readyz", "/readyz"},
	{"/metrics", "/metrics"},
}

// RouteLabel maps a request path onto a bounded set of route labels.
//
// Anything unrecognised collapses to "other" rather than passing the path
// through. That is the whole point: an unbounded label is a production incident,
// not a monitoring gap.
func RouteLabel(path string) string {
	for _, pattern := range routePatterns {
		if path == pattern.prefix || strings.HasPrefix(path, pattern.prefix) {
			return pattern.label
		}
	}
	if !strings.HasPrefix(path, "/api/") {
		// Static assets and the SPA shell. One label for the whole surface, since
		// per-asset latency is a CDN question, not a server one.
		return "static"
	}
	return "other"
}

// Handler serves the registry in Prometheus text exposition format.
func Handler(reg *Registry) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(reg.Gather()))
	})
}

// SetBuildInfo records the binary's identity as a gauge fixed at 1, the standard
// Prometheus pattern for exporting labels that are facts rather than measurements.
// It lets an operator group a dashboard by version and see a deploy land.
func SetBuildInfo(reg *Registry, version, commit, goVersion string) {
	reg.GaugeSet(
		MetricBuildInfo,
		"Build identity of the running binary, always 1.",
		Labels("version", version, "commit", commit, "go_version", goVersion),
		1,
	)
}
