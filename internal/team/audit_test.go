package team

import (
	"bytes"
	"context"
	"encoding/csv"
	"strings"
	"testing"
	"time"
)

func newAuditStore(t *testing.T) *Store {
	t.Helper()
	store, err := OpenStore(t.TempDir() + "/workspace.db")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

// insertAudit writes a record directly with an explicit timestamp, which the
// public API cannot do - retention needs records that are genuinely old.
func insertAudit(t *testing.T, s *Store, actor, action, target string, at time.Time) {
	t.Helper()
	_, err := s.db.ExecContext(context.Background(),
		"INSERT INTO audit_events (actor_id, action, target_id, created_at) VALUES (?, ?, ?, ?)",
		actor, action, target, at.UTC())
	if err != nil {
		t.Fatalf("insert audit record: %v", err)
	}
}

func TestQueryAuditRecordsFiltersByWindow(t *testing.T) {
	store := newAuditStore(t)
	ctx := context.Background()
	base := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

	insertAudit(t, store, "alice", "create-workspace", "w1", base.AddDate(0, 0, -10))
	insertAudit(t, store, "bob", "rename-workspace", "w1", base.AddDate(0, 0, -5))
	insertAudit(t, store, "alice", "create-workspace", "w2", base.AddDate(0, 0, -1))

	page, err := store.QueryAuditRecords(ctx, AuditQuery{
		Since: base.AddDate(0, 0, -7),
		Until: base,
	})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if page.Total != 2 {
		t.Errorf("expected 2 records in the window, got %d", page.Total)
	}

	// Since is inclusive and Until exclusive, so a record exactly on Until is out.
	onBoundary, err := store.QueryAuditRecords(ctx, AuditQuery{
		Since: base.AddDate(0, 0, -5),
		Until: base.AddDate(0, 0, -1),
	})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if onBoundary.Total != 1 {
		t.Errorf("expected the half-open window to hold 1 record, got %d", onBoundary.Total)
	}
}

func TestQueryAuditRecordsIsNewestFirst(t *testing.T) {
	store := newAuditStore(t)
	base := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

	for i := 0; i < 5; i++ {
		insertAudit(t, store, "alice", "act", "target", base.Add(time.Duration(i)*time.Hour))
	}

	page, err := store.QueryAuditRecords(context.Background(), AuditQuery{})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	for i := 1; i < len(page.Records); i++ {
		if !page.Records[i-1].CreatedAt.After(page.Records[i].CreatedAt) {
			t.Errorf("records are not newest first at index %d", i)
		}
	}
}

// TestAuditLimitIsClamped: a caller asking for too much gets the maximum rather
// than an error, so an export script does not have to know the ceiling.
func TestAuditLimitIsClamped(t *testing.T) {
	store := newAuditStore(t)
	base := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 20; i++ {
		insertAudit(t, store, "alice", "act", "target", base.Add(time.Duration(i)*time.Minute))
	}

	page, err := store.QueryAuditRecords(context.Background(), AuditQuery{Limit: 999999})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(page.Records) != 20 {
		t.Errorf("expected all 20 records, got %d", len(page.Records))
	}
}

// TestPruneRemovesOnlyOldRecords is the retention control. Deleting a record that
// is still inside the retention window is a compliance failure, not a tidy-up.
func TestPruneRemovesOnlyOldRecords(t *testing.T) {
	store := newAuditStore(t)
	ctx := context.Background()
	now := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

	insertAudit(t, store, "alice", "old", "w1", now.AddDate(0, 0, -400))
	insertAudit(t, store, "alice", "old", "w2", now.AddDate(0, 0, -200))
	insertAudit(t, store, "alice", "recent", "w3", now.AddDate(0, 0, -10))

	deleted, err := store.PruneAuditRecords(ctx, now.AddDate(0, 0, -90))
	if err != nil {
		t.Fatalf("prune: %v", err)
	}
	if deleted != 2 {
		t.Errorf("expected 2 records pruned, got %d", deleted)
	}

	page, err := store.QueryAuditRecords(ctx, AuditQuery{})
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if page.Total != 1 {
		t.Fatalf("expected 1 surviving record, got %d", page.Total)
	}
	if page.Records[0].Action != "recent" {
		t.Errorf("the wrong record survived: %q", page.Records[0].Action)
	}
}

// TestPruneWithZeroCutoffDeletesNothing: the service must never prune on its own
// initiative, because it cannot know the operator's retention obligation.
func TestPruneWithZeroCutoffDeletesNothing(t *testing.T) {
	store := newAuditStore(t)
	insertAudit(t, store, "alice", "act", "w1", time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC))

	deleted, err := store.PruneAuditRecords(context.Background(), time.Time{})
	if err != nil {
		t.Fatalf("prune: %v", err)
	}
	if deleted != 0 {
		t.Errorf("a zero cutoff must delete nothing, deleted %d", deleted)
	}

	page, _ := store.QueryAuditRecords(context.Background(), AuditQuery{})
	if page.Total != 1 {
		t.Errorf("record was deleted despite a zero cutoff")
	}
}

func TestWriteAuditCSVEscapesFields(t *testing.T) {
	store := newAuditStore(t)
	now := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

	// A comma and a quote in an actor id would break a naively concatenated CSV.
	insertAudit(t, store, `acme\,inc "ops"`, "create-workspace", "w1", now)

	var buf bytes.Buffer
	if err := store.WriteAuditCSV(context.Background(), AuditQuery{}, &buf); err != nil {
		t.Fatalf("export: %v", err)
	}

	rows, err := csv.NewReader(strings.NewReader(buf.String())).ReadAll()
	if err != nil {
		t.Fatalf("export is not valid CSV: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected a header and one record, got %d rows", len(rows))
	}
	if rows[1][2] != `acme\,inc "ops"` {
		t.Errorf("actor field did not round-trip: %q", rows[1][2])
	}
}

// TestWriteAuditCSVPagesBeyondOnePage covers the internal paging: the export must
// not stop at MaxAuditLimit.
func TestWriteAuditCSVPagesBeyondOnePage(t *testing.T) {
	store := newAuditStore(t)
	base := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

	const count = MaxAuditLimit + 250
	for i := 0; i < count; i++ {
		insertAudit(t, store, "alice", "act", "target", base.Add(time.Duration(i)*time.Second))
	}

	var buf bytes.Buffer
	if err := store.WriteAuditCSV(context.Background(), AuditQuery{}, &buf); err != nil {
		t.Fatalf("export: %v", err)
	}

	rows, err := csv.NewReader(strings.NewReader(buf.String())).ReadAll()
	if err != nil {
		t.Fatalf("export is not valid CSV: %v", err)
	}
	if got := len(rows) - 1; got != count {
		t.Errorf("export stopped at %d records, expected %d", got, count)
	}
}

// TestWriteAuditCSVHonoursCancellation stops an abandoned download from reading
// the database to the end.
func TestWriteAuditCSVHonoursCancellation(t *testing.T) {
	store := newAuditStore(t)
	base := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < MaxAuditLimit+10; i++ {
		insertAudit(t, store, "alice", "act", "target", base.Add(time.Duration(i)*time.Second))
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	var buf bytes.Buffer
	if err := store.WriteAuditCSV(ctx, AuditQuery{}, &buf); err == nil {
		t.Error("expected a cancelled export to report an error")
	}
}
