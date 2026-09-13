// Package ratelimit throttles HTTP requests per caller.
//
// Before this, the only rate limit in the service was on the collaboration
// WebSocket. Every HTTP route was unthrottled, including document upload, which
// writes to a SQLite store, and the team surface, which is reachable by any
// authenticated principal.
//
// The limiter is in-process and per-instance. That matches the deployment model:
// the service is a single node with a file-backed database, so there is no shared
// state a distributed limiter could coordinate through, and adding Redis to gain
// one would cost more than the single-node ceiling it lifts. An operator running
// several replicas behind a load balancer gets the limit per replica, which is
// documented rather than hidden.
package ratelimit

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Limit describes one token bucket's shape.
type Limit struct {
	// RPS is the sustained rate, in requests per second, that a caller may hold.
	RPS float64

	// Burst is the bucket depth: how many requests a caller may make back to back
	// before the sustained rate applies. A burst below one would make every
	// request wait, so it is clamped up at construction.
	Burst float64
}

// Defaults. These are set so that no human driving the web UI will ever meet
// them, while an unattended loop is stopped well before it can exhaust the disk
// or the CPU. A local-first tool that rate-limits its own user has failed.
var (
	// DefaultLimit covers ordinary reads: search, document fetch, the SPA shell.
	DefaultLimit = Limit{RPS: 50, Burst: 100}

	// ExpensiveLimit covers routes that write, spend money, or do real work per
	// call: document upload, the AI gateway, pack activation.
	ExpensiveLimit = Limit{RPS: 2, Burst: 10}
)

// bucket is one caller's token bucket. Tokens refill lazily on access rather than
// on a timer, so an idle caller costs nothing until they return.
type bucket struct {
	tokens float64
	last   time.Time
	seen   time.Time
}

// Limiter holds a bucket per caller key.
type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	limit   Limit
	now     func() time.Time

	// idleTTL bounds memory. A key not seen for this long is dropped on the next
	// sweep. Without it, one key per client IP would grow without limit, which is
	// a denial of service delivered through the defence against one.
	idleTTL   time.Duration
	lastSweep time.Time
}

// New returns a limiter enforcing the given limit.
func New(limit Limit) *Limiter {
	if limit.Burst < 1 {
		limit.Burst = 1
	}
	if limit.RPS <= 0 {
		limit.RPS = 1
	}
	return &Limiter{
		buckets: make(map[string]*bucket),
		limit:   limit,
		now:     time.Now,
		idleTTL: 10 * time.Minute,
	}
}

// Decision is the outcome of one Allow call, carrying what the response headers
// need.
type Decision struct {
	Allowed bool

	// Remaining is the whole tokens left after this request.
	Remaining int

	// RetryAfter is how long the caller should wait before retrying. Zero when
	// the request was allowed.
	RetryAfter time.Duration

	// Limit is the configured burst, reported so a client can size its own
	// behaviour rather than discovering the ceiling by hitting it.
	Limit int
}

// Allow consumes one token for key and reports whether the request may proceed.
func (l *Limiter) Allow(key string) Decision {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.sweepLocked(now)

	b, ok := l.buckets[key]
	if !ok {
		// A new caller starts full, so a first request is never thrown away.
		b = &bucket{tokens: l.limit.Burst, last: now}
		l.buckets[key] = b
	}

	// Lazy refill: credit the tokens that accrued since the last request.
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens = math.Min(l.limit.Burst, b.tokens+elapsed*l.limit.RPS)
		b.last = now
	}
	b.seen = now

	if b.tokens < 1 {
		// Time until one whole token is available.
		deficit := 1 - b.tokens
		wait := time.Duration(deficit / l.limit.RPS * float64(time.Second))
		// Retry-After is expressed in whole seconds, so a sub-second wait must
		// round up to 1: rounding down would advise an immediate retry that is
		// guaranteed to fail again.
		if wait < time.Second {
			wait = time.Second
		}
		return Decision{
			Allowed:    false,
			Remaining:  0,
			RetryAfter: wait,
			Limit:      int(l.limit.Burst),
		}
	}

	b.tokens--
	return Decision{
		Allowed:   true,
		Remaining: int(b.tokens),
		Limit:     int(l.limit.Burst),
	}
}

// sweepLocked drops buckets nobody has touched recently. Callers hold the lock.
//
// It runs at most once per idleTTL rather than on every request: the sweep is
// O(buckets), and paying that on every call would make the limiter itself the
// bottleneck it exists to prevent.
func (l *Limiter) sweepLocked(now time.Time) {
	if now.Sub(l.lastSweep) < l.idleTTL {
		return
	}
	l.lastSweep = now
	for key, b := range l.buckets {
		if now.Sub(b.seen) > l.idleTTL {
			delete(l.buckets, key)
		}
	}
}

// Len reports how many buckets are held. Used by tests to assert that memory is
// actually reclaimed.
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

// KeyFunc derives the identity a request is limited against.
type KeyFunc func(*http.Request) string

// ClientIPKey limits by source address.
//
// It reads the connection's remote address and never a forwarded header. A header
// is caller-controlled, so trusting one would let anyone bypass the limit by
// varying a string, which is worse than no limit because it looks like one. An
// operator terminating TLS at a proxy should enforce their own per-client limit
// there, where the real peer is known.
func ClientIPKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// PrincipalKey limits by authenticated principal when there is one, falling back
// to source address.
//
// In team mode several people commonly share one source address behind NAT or a
// proxy, and keying purely by address would collapse a whole office into one
// bucket. The bearer token distinguishes them. It is hashed, never stored raw:
// the key lives in a map for the bucket's lifetime, and a bearer token is a
// credential that has no business sitting in process memory as a map key.
//
// The token is deliberately not validated here. This is a bucket key, not an
// authorization decision - the handler still authenticates. An invalid token
// therefore gets its own bucket, which is correct: a caller spraying bad tokens
// is rate-limited per token, and the address-keyed limit still applies to anyone
// sending none.
func PrincipalKey(r *http.Request) string {
	const prefix = "Bearer "
	authorization := r.Header.Get("Authorization")
	if len(authorization) > len(prefix) && strings.EqualFold(authorization[:len(prefix)], prefix) {
		token := strings.TrimSpace(authorization[len(prefix):])
		if token != "" {
			sum := sha256.Sum256([]byte(token))
			// Half the digest is far more than enough to avoid collisions here and
			// keeps the key small.
			return "sub:" + hex.EncodeToString(sum[:16])
		}
	}
	return "ip:" + ClientIPKey(r)
}

// Middleware enforces a fixed limit, keyed by key, over next.
func Middleware(l *Limiter, key KeyFunc, next http.Handler) http.Handler {
	return MiddlewareFunc(func(*http.Request) *Limiter { return l }, key, next)
}

// MiddlewareFunc enforces whichever limiter pick returns for a request, so
// expensive routes can be held to a tighter limit than ordinary reads. A nil
// return means the route is not limited.
func MiddlewareFunc(pick func(*http.Request) *Limiter, key KeyFunc, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		l := pick(r)
		if l == nil {
			next.ServeHTTP(w, r)
			return
		}

		decision := l.Allow(key(r))

		// The draft IETF RateLimit header fields. Clients that understand them can
		// back off before being refused rather than after.
		w.Header().Set("RateLimit-Limit", strconv.Itoa(decision.Limit))
		w.Header().Set("RateLimit-Remaining", strconv.Itoa(decision.Remaining))

		if !decision.Allowed {
			seconds := int(decision.RetryAfter.Seconds())
			w.Header().Set("Retry-After", strconv.Itoa(seconds))
			w.Header().Set("RateLimit-Reset", strconv.Itoa(seconds))
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusTooManyRequests)
			// The message says what to do, not just what went wrong.
			_, _ = w.Write([]byte(`{"error":"rate limit exceeded","retry_after_seconds":` +
				strconv.Itoa(seconds) + `}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}
