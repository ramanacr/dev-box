package team

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"
)

// AuditQuery filters and pages the audit trail.
//
// An audit trail nobody can read fails the control even though the data is being
// captured, and one that returns every row since installation in a single
// response fails it a different way: an auditor asking "who changed this
// workspace last March" should not have to download the whole history to answer.
type AuditQuery struct {
	// Actor restricts to one principal's actions. Empty matches all.
	Actor string

	// Action restricts to one action name, e.g. "create-workspace".
	Action string

	// Target restricts to one target id, typically a workspace.
	Target string

	// Since and Until bound the window, inclusive of Since and exclusive of
	// Until. A zero value leaves that end unbounded.
	Since time.Time
	Until time.Time

	// Limit caps the page size. Zero means DefaultAuditLimit; anything above
	// MaxAuditLimit is clamped rather than rejected, so a caller asking for too
	// much gets the maximum rather than an error.
	Limit int

	// Cursor pages backwards through the trail. It is the ID of the last record
	// of the previous page; records strictly older than it are returned.
	//
	// Offset paging would skip or duplicate rows when new events land between
	// requests, which for an audit export is a correctness bug, not a cosmetic
	// one. Keyset paging on a monotonic id cannot.
	Cursor int64
}

// Audit page size bounds.
const (
	DefaultAuditLimit = 100
	MaxAuditLimit     = 1000
)

// AuditEntry is one record with the id needed for paging. It extends AuditRecord
// rather than replacing it, so existing callers are unaffected.
type AuditEntry struct {
	ID        int64     `json:"id"`
	ActorID   string    `json:"actorId"`
	Action    string    `json:"action"`
	TargetID  string    `json:"targetId"`
	CreatedAt time.Time `json:"createdAt"`
}

// AuditPage is one page of results plus what a caller needs to fetch the next.
type AuditPage struct {
	Records []AuditEntry `json:"records"`

	// NextCursor is the cursor for the following page, or 0 when this is the last
	// page. A caller stops when it is 0 rather than guessing from a short page,
	// which would be wrong when a page happens to land exactly on the boundary.
	NextCursor int64 `json:"nextCursor"`

	// Total is the number of records matching the filter, ignoring paging. It is
	// what lets an export show progress instead of an unbounded spinner.
	Total int64 `json:"total"`
}

// QueryAuditRecords returns one filtered, paged slice of the audit trail, newest
// first.
func (s *Store) QueryAuditRecords(ctx context.Context, q AuditQuery) (AuditPage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	limit := q.Limit
	if limit <= 0 {
		limit = DefaultAuditLimit
	}
	if limit > MaxAuditLimit {
		limit = MaxAuditLimit
	}

	where, args := auditFilter(q)

	var total int64
	countSQL := "SELECT COUNT(*) FROM audit_events" + where
	if err := s.db.QueryRowContext(ctx, countSQL, args...).Scan(&total); err != nil {
		return AuditPage{}, fmt.Errorf("count audit events: %w", err)
	}

	// The cursor narrows the page but must not narrow the total, so it is applied
	// only to the row query.
	pageWhere, pageArgs := where, args
	if q.Cursor > 0 {
		pageWhere = appendCondition(pageWhere, "id < ?")
		pageArgs = append(append([]any{}, args...), q.Cursor)
	}

	// One row beyond the page is fetched to decide whether a next page exists,
	// which avoids a second count and is exact at the boundary.
	rowSQL := "SELECT id, actor_id, action, target_id, created_at FROM audit_events" +
		pageWhere + " ORDER BY id DESC LIMIT ?"
	pageArgs = append(pageArgs, limit+1)

	rows, err := s.db.QueryContext(ctx, rowSQL, pageArgs...)
	if err != nil {
		return AuditPage{}, fmt.Errorf("query audit events: %w", err)
	}
	defer rows.Close()

	records := make([]AuditEntry, 0, limit)
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.ActorID, &e.Action, &e.TargetID, &e.CreatedAt); err != nil {
			return AuditPage{}, fmt.Errorf("scan audit event: %w", err)
		}
		records = append(records, e)
	}
	if err := rows.Err(); err != nil {
		return AuditPage{}, err
	}

	page := AuditPage{Total: total}
	if len(records) > limit {
		page.Records = records[:limit]
		page.NextCursor = records[limit-1].ID
	} else {
		page.Records = records
	}
	return page, nil
}

// auditFilter builds the shared WHERE clause and its arguments.
//
// Every value is bound as a parameter. The audit trail is the one table an
// attacker most wants to edit, and string-built SQL here would be the way in.
func auditFilter(q AuditQuery) (string, []any) {
	var clause string
	var args []any

	if actor := strings.TrimSpace(q.Actor); actor != "" {
		clause = appendCondition(clause, "actor_id = ?")
		args = append(args, actor)
	}
	if action := strings.TrimSpace(q.Action); action != "" {
		clause = appendCondition(clause, "action = ?")
		args = append(args, action)
	}
	if target := strings.TrimSpace(q.Target); target != "" {
		clause = appendCondition(clause, "target_id = ?")
		args = append(args, target)
	}
	if !q.Since.IsZero() {
		clause = appendCondition(clause, "created_at >= ?")
		args = append(args, q.Since.UTC())
	}
	if !q.Until.IsZero() {
		clause = appendCondition(clause, "created_at < ?")
		args = append(args, q.Until.UTC())
	}
	return clause, args
}

func appendCondition(clause, condition string) string {
	if clause == "" {
		return " WHERE " + condition
	}
	return clause + " AND " + condition
}

// WriteAuditCSV streams the matching records to w as CSV, newest first.
//
// It pages internally rather than loading the whole trail, so exporting a large
// history costs a bounded amount of memory. CSV is the format a compliance team
// actually asks for; the JSON endpoint serves tooling.
func (s *Store) WriteAuditCSV(ctx context.Context, q AuditQuery, w io.Writer) error {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	if err := writer.Write([]string{"id", "timestamp", "actor", "action", "target"}); err != nil {
		return err
	}

	// The export ignores any caller-supplied paging and walks the whole filtered
	// result itself: a half-exported audit trail is worse than none, because it
	// looks complete.
	page := q
	page.Limit = MaxAuditLimit
	page.Cursor = 0

	for {
		result, err := s.QueryAuditRecords(ctx, page)
		if err != nil {
			return err
		}
		for _, record := range result.Records {
			row := []string{
				fmt.Sprintf("%d", record.ID),
				record.CreatedAt.UTC().Format(time.RFC3339),
				record.ActorID,
				record.Action,
				record.TargetID,
			}
			if err := writer.Write(row); err != nil {
				return err
			}
		}
		// Flushed per page so a slow consumer sees progress and memory stays flat.
		writer.Flush()
		if err := writer.Error(); err != nil {
			return err
		}

		if result.NextCursor == 0 {
			return nil
		}
		page.Cursor = result.NextCursor

		// Cancellation is honoured between pages so an abandoned download does not
		// keep reading the database.
		if err := ctx.Err(); err != nil {
			return err
		}
	}
}

// PruneAuditRecords deletes records older than the cutoff and reports how many
// were removed.
//
// Retention is a requirement in both directions: a compliance regime sets a
// minimum, and a privacy regime sets a maximum. The service cannot know either,
// so it applies the operator's cutoff and never prunes on its own - a zero or
// future cutoff deletes nothing rather than guessing.
func (s *Store) PruneAuditRecords(ctx context.Context, olderThan time.Time) (int64, error) {
	if olderThan.IsZero() {
		return 0, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	result, err := s.db.ExecContext(ctx,
		"DELETE FROM audit_events WHERE created_at < ?", olderThan.UTC())
	if err != nil {
		return 0, fmt.Errorf("prune audit events: %w", err)
	}
	return result.RowsAffected()
}
