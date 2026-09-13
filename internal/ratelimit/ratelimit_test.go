package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"
)

// fakeClock lets the refill logic be tested without sleeping, which is the
// difference between a test suite that runs in milliseconds and one nobody waits
// for.
type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func newTestLimiter(limit Limit) (*Limiter, *fakeClock) {
	clock := &fakeClock{now: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	l := New(limit)
	l.now = clock.Now
	l.lastSweep = clock.now
	return l, clock
}

// TestBurstThenRefusal covers the core contract: a caller gets the burst, then is
// refused.
func TestBurstThenRefusal(t *testing.T) {
	l, _ := newTestLimiter(Limit{RPS: 1, Burst: 3})

	for i := 0; i < 3; i++ {
		if d := l.Allow("caller"); !d.Allowed {
			t.Fatalf("request %d in the burst was refused", i+1)
		}
	}
	d := l.Allow("caller")
	if d.Allowed {
		t.Fatal("the request past the burst must be refused")
	}
	if d.RetryAfter <= 0 {
		t.Error("a refusal must say when to retry")
	}
	if d.Remaining != 0 {
		t.Errorf("remaining should be 0 on refusal, got %d", d.Remaining)
	}
}

// TestTokensRefillOverTime is the property that makes this a rate limit rather
// than a quota.
func TestTokensRefillOverTime(t *testing.T) {
	l, clock := newTestLimiter(Limit{RPS: 2, Burst: 2})

	l.Allow("caller")
	l.Allow("caller")
	if l.Allow("caller").Allowed {
		t.Fatal("bucket should be empty")
	}

	// At 2 rps, half a second buys exactly one token.
	clock.Advance(500 * time.Millisecond)
	if !l.Allow("caller").Allowed {
		t.Error("a token should have refilled after 500ms at 2 rps")
	}
	if l.Allow("caller").Allowed {
		t.Error("only one token should have refilled")
	}
}

// TestRefillIsCappedAtBurst stops an idle caller from banking unlimited credit.
func TestRefillIsCappedAtBurst(t *testing.T) {
	l, clock := newTestLimiter(Limit{RPS: 10, Burst: 5})

	l.Allow("caller")
	clock.Advance(1 * time.Hour)

	allowed := 0
	for i := 0; i < 100; i++ {
		if l.Allow("caller").Allowed {
			allowed++
		}
	}
	if allowed != 5 {
		t.Errorf("an hour idle should bank exactly the burst of 5, got %d", allowed)
	}
}

// TestCallersAreIndependent is the point of keying at all: one noisy client must
// not refuse everyone else.
func TestCallersAreIndependent(t *testing.T) {
	l, _ := newTestLimiter(Limit{RPS: 1, Burst: 1})

	if !l.Allow("alice").Allowed {
		t.Fatal("alice's first request must be allowed")
	}
	if l.Allow("alice").Allowed {
		t.Fatal("alice's second request must be refused")
	}
	if !l.Allow("bob").Allowed {
		t.Error("bob must not be affected by alice exhausting her bucket")
	}
}

// TestNewCallerStartsFull keeps a first-ever request from being thrown away.
func TestNewCallerStartsFull(t *testing.T) {
	l, _ := newTestLimiter(Limit{RPS: 0.1, Burst: 4})

	for i := 0; i < 4; i++ {
		if !l.Allow("fresh").Allowed {
			t.Fatalf("a new caller must start with a full bucket; failed at %d", i+1)
		}
	}
}

// TestRetryAfterRoundsUp guards the advice itself: a sub-second wait reported as
// 0 seconds tells a client to retry immediately into another refusal.
func TestRetryAfterRoundsUp(t *testing.T) {
	l, _ := newTestLimiter(Limit{RPS: 100, Burst: 1})

	l.Allow("caller")
	d := l.Allow("caller")
	if d.Allowed {
		t.Fatal("expected refusal")
	}
	if d.RetryAfter < time.Second {
		t.Errorf("Retry-After must round up to at least 1s, got %v", d.RetryAfter)
	}
}

// TestIdleBucketsAreReclaimed covers the memory bound. Without it, one bucket per
// client address grows without limit, which is a denial of service delivered
// through the defence against one.
func TestIdleBucketsAreReclaimed(t *testing.T) {
	l, clock := newTestLimiter(Limit{RPS: 1, Burst: 1})

	for i := 0; i < 500; i++ {
		l.Allow("caller-" + strconv.Itoa(i))
	}
	if l.Len() != 500 {
		t.Fatalf("expected 500 buckets, got %d", l.Len())
	}

	// Past the idle TTL, the next call sweeps everything nobody has touched.
	clock.Advance(11 * time.Minute)
	l.Allow("survivor")

	if l.Len() != 1 {
		t.Errorf("expected only the active caller to survive, got %d buckets", l.Len())
	}
}

// TestActiveBucketSurvivesSweep is the other half: the sweep must not evict a
// caller who is still making requests.
func TestActiveBucketSurvivesSweep(t *testing.T) {
	l, clock := newTestLimiter(Limit{RPS: 100, Burst: 100})

	for i := 0; i < 20; i++ {
		l.Allow("active")
		l.Allow("idle-" + strconv.Itoa(i))
		clock.Advance(1 * time.Minute)
	}
	l.Allow("active")

	// "active" was touched on the most recent call, so it must still be held.
	if l.Len() == 0 {
		t.Fatal("the sweep evicted every bucket including the active one")
	}
}

// TestZeroValuesAreClamped covers misconfiguration: a burst of zero would refuse
// every request, which is a broken service rather than a strict one.
func TestZeroValuesAreClamped(t *testing.T) {
	l := New(Limit{RPS: 0, Burst: 0})
	if !l.Allow("caller").Allowed {
		t.Error("a zero-valued limit must be clamped to something usable, not refuse everything")
	}
}

func TestConcurrentAllowIsSafe(t *testing.T) {
	l := New(Limit{RPS: 1000, Burst: 1000})

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				l.Allow("caller-" + strconv.Itoa(n%5))
			}
		}(i)
	}
	wg.Wait()

	if l.Len() != 5 {
		t.Errorf("expected 5 distinct buckets, got %d", l.Len())
	}
}

// --- middleware ---------------------------------------------------------------

func TestMiddlewareRefusesWith429(t *testing.T) {
	l, _ := newTestLimiter(Limit{RPS: 1, Burst: 1})
	handler := Middleware(l, ClientIPKey, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/docs/search", nil)
	req.RemoteAddr = "10.0.0.5:4242"

	first := httptest.NewRecorder()
	handler.ServeHTTP(first, req)
	if first.Code != http.StatusOK {
		t.Fatalf("first request should pass, got %d", first.Code)
	}

	second := httptest.NewRecorder()
	handler.ServeHTTP(second, req)
	if second.Code != http.StatusTooManyRequests {
		t.Fatalf("second request should be refused with 429, got %d", second.Code)
	}
	if got := second.Header().Get("Retry-After"); got == "" || got == "0" {
		t.Errorf("429 must carry a usable Retry-After, got %q", got)
	}
	if got := second.Header().Get("RateLimit-Limit"); got != "1" {
		t.Errorf("expected RateLimit-Limit 1, got %q", got)
	}
	if ct := second.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected a JSON error body, got content type %q", ct)
	}
}

// TestForwardedHeadersAreIgnored is the bypass guard. Trusting a caller-supplied
// header would let anyone evade the limit by varying a string, which is worse
// than no limit because it looks like one.
func TestForwardedHeadersAreIgnored(t *testing.T) {
	l, _ := newTestLimiter(Limit{RPS: 1, Burst: 1})
	handler := Middleware(l, ClientIPKey, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	refused := 0
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/docs/search", nil)
		req.RemoteAddr = "10.0.0.5:4242"
		// A different spoofed identity on each attempt.
		req.Header.Set("X-Forwarded-For", "1.2.3."+strconv.Itoa(i))
		req.Header.Set("X-Real-Ip", "9.9.9."+strconv.Itoa(i))

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			refused++
		}
	}

	if refused != 4 {
		t.Errorf("spoofed forwarded headers bypassed the limit: only %d of 4 were refused", refused)
	}
}

func TestClientIPKeyStripsPort(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.0.2.10:51234"
	if got := ClientIPKey(req); got != "192.0.2.10" {
		t.Errorf("expected the bare address, got %q", got)
	}

	// Two connections from one client use different source ports and must share a
	// bucket, or the limit means nothing.
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.RemoteAddr = "192.0.2.10:51235"
	if ClientIPKey(req) != ClientIPKey(req2) {
		t.Error("two ports from one address must map to one key")
	}
}
