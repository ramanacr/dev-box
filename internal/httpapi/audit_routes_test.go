package httpapi

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"developer-toolbox/internal/team"
)

// seedAudit creates n workspaces as admin, which produces audit records as a side
// effect. It returns the admin token so callers can keep using the same identity.
func seedAudit(t *testing.T, env *teamTestEnv, n int) string {
	t.Helper()

	adminToken := env.token(t, "admin-user", "admin")
	for i := 0; i < n; i++ {
		rec := env.do(t, http.MethodPost, "/api/team/workspaces", adminToken,
			map[string]string{"name": "workspace-" + strconv.Itoa(i)})
		if rec.Code != http.StatusCreated {
			t.Fatalf("seed workspace %d: expected 201, got %d (%s)", i, rec.Code, rec.Body.String())
		}
	}
	return adminToken
}

func decodeAuditPage(t *testing.T, body string) team.AuditPage {
	t.Helper()
	var page team.AuditPage
	if err := json.Unmarshal([]byte(body), &page); err != nil {
		t.Fatalf("decode audit page: %v (%s)", err, body)
	}
	return page
}

// TestAuditTrailIsReadable is the finding this endpoint closes: records were
// being written and there was no way to read them back.
func TestAuditTrailIsReadable(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 3)

	rec := env.do(t, http.MethodGet, "/api/team/admin/audit", adminToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	page := decodeAuditPage(t, rec.Body.String())
	if len(page.Records) == 0 {
		t.Fatal("audit trail came back empty after three workspace creations")
	}
	if page.Total < 3 {
		t.Errorf("expected at least 3 records, total reports %d", page.Total)
	}

	for _, record := range page.Records {
		if record.ActorID == "" {
			t.Error("every audit record must identify the actor")
		}
		if record.CreatedAt.IsZero() {
			t.Error("every audit record must carry a timestamp")
		}
		if record.ID == 0 {
			t.Error("every audit record must carry an id for paging")
		}
	}
}

// TestAuditRequiresAdmin is the access boundary. The trail spans every workspace,
// so anything short of the installation-wide admin right must be refused.
func TestAuditRequiresAdmin(t *testing.T) {
	env := newTeamTestEnv(t)
	seedAudit(t, env, 1)

	for _, path := range []string{"/api/team/admin/audit", "/api/team/admin/audit.csv"} {
		// No token at all.
		if rec := env.do(t, http.MethodGet, path, "", nil); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s unauthenticated: expected 401, got %d", path, rec.Code)
		}

		// Authenticated, but without the admin role.
		for _, role := range []string{"viewer", "editor"} {
			token := env.token(t, role+"-user", role)
			rec := env.do(t, http.MethodGet, path, token, nil)
			if rec.Code != http.StatusForbidden {
				t.Errorf("%s as %s: expected 403, got %d (%s)", path, role, rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "actorId") {
				t.Errorf("%s leaked audit content to a %s", path, role)
			}
		}
	}
}

// TestAuditPagingIsStableUnderWrites is why paging is keyset rather than offset:
// records landing between requests must not cause a page to skip or repeat a row.
func TestAuditPagingIsStableUnderWrites(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 10)

	first := decodeAuditPage(t, env.do(t, http.MethodGet,
		"/api/team/admin/audit?limit=5", adminToken, nil).Body.String())
	if len(first.Records) != 5 {
		t.Fatalf("expected a page of 5, got %d", len(first.Records))
	}
	if first.NextCursor == 0 {
		t.Fatal("a full first page must carry a cursor for the next")
	}

	// New activity lands between the two page requests. With offset paging this is
	// exactly where rows get duplicated.
	env.do(t, http.MethodPost, "/api/team/workspaces", adminToken,
		map[string]string{"name": "arrived-mid-page"})

	second := decodeAuditPage(t, env.do(t, http.MethodGet,
		"/api/team/admin/audit?limit=5&cursor="+strconv.FormatInt(first.NextCursor, 10),
		adminToken, nil).Body.String())

	seen := make(map[int64]bool, len(first.Records))
	for _, record := range first.Records {
		seen[record.ID] = true
	}
	for _, record := range second.Records {
		if seen[record.ID] {
			t.Errorf("record %d appeared on both pages", record.ID)
		}
	}
}

// TestAuditLastPageHasNoCursor keeps a client from looping forever.
func TestAuditLastPageHasNoCursor(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 2)

	page := decodeAuditPage(t, env.do(t, http.MethodGet,
		"/api/team/admin/audit?limit=1000", adminToken, nil).Body.String())
	if page.NextCursor != 0 {
		t.Errorf("a page holding every record must report no next cursor, got %d", page.NextCursor)
	}
}

func TestAuditFilters(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 3)

	// Filter by action.
	byAction := decodeAuditPage(t, env.do(t, http.MethodGet,
		"/api/team/admin/audit?action=create-workspace", adminToken, nil).Body.String())
	if len(byAction.Records) == 0 {
		t.Fatal("expected create-workspace records")
	}
	for _, record := range byAction.Records {
		if record.Action != "create-workspace" {
			t.Errorf("action filter leaked %q", record.Action)
		}
	}

	// Filter by actor, using one that did nothing.
	byActor := decodeAuditPage(t, env.do(t, http.MethodGet,
		"/api/team/admin/audit?actor=nobody-at-all", adminToken, nil).Body.String())
	if len(byActor.Records) != 0 {
		t.Errorf("expected no records for an actor who did nothing, got %d", len(byActor.Records))
	}
	if byActor.Total != 0 {
		t.Errorf("total must respect the filter, got %d", byActor.Total)
	}
}

// TestAuditRejectsUnparseableFilters: an auditor who mistypes a date and silently
// receives the unfiltered trail would draw conclusions from the wrong window.
func TestAuditRejectsUnparseableFilters(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 1)

	for _, query := range []string{
		"since=last-tuesday",
		"until=2026/01/01",
		"limit=all",
		"limit=-5",
		"cursor=abc",
		"since=2026-01-02T00:00:00Z&until=2026-01-01T00:00:00Z",
	} {
		rec := env.do(t, http.MethodGet, "/api/team/admin/audit?"+query, adminToken, nil)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("query %q: expected 400, got %d (%s)", query, rec.Code, rec.Body.String())
		}
	}
}

// TestAuditFilterIsParameterised is the injection guard on the one table an
// attacker most wants to edit.
func TestAuditFilterIsParameterised(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 3)

	hostile := "' OR 1=1 --"
	rec := env.do(t, http.MethodGet,
		"/api/team/admin/audit?actor="+strings.ReplaceAll(hostile, " ", "%20"), adminToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	page := decodeAuditPage(t, rec.Body.String())
	if len(page.Records) != 0 {
		t.Errorf("injected filter returned %d records; it must match nothing", len(page.Records))
	}

	// And the table is still there afterwards.
	after := decodeAuditPage(t, env.do(t, http.MethodGet,
		"/api/team/admin/audit", adminToken, nil).Body.String())
	if after.Total == 0 {
		t.Error("audit table was emptied by the injected filter")
	}
}

// TestAuditCSVExport covers the format a compliance team actually asks for.
func TestAuditCSVExport(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 4)

	rec := env.do(t, http.MethodGet, "/api/team/admin/audit.csv", adminToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("expected text/csv, got %q", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "attachment") {
		t.Errorf("export must download rather than render, got %q", cd)
	}

	rows, err := csv.NewReader(strings.NewReader(rec.Body.String())).ReadAll()
	if err != nil {
		t.Fatalf("export is not valid CSV: %v", err)
	}
	if len(rows) < 2 {
		t.Fatalf("expected a header and at least one record, got %d rows", len(rows))
	}

	wantHeader := []string{"id", "timestamp", "actor", "action", "target"}
	for i, column := range wantHeader {
		if rows[0][i] != column {
			t.Errorf("header column %d: expected %q, got %q", i, column, rows[0][i])
		}
	}

	// Every data row must be fully populated; a blank actor in an export is the
	// kind of thing an auditor rejects the whole file over.
	for i, row := range rows[1:] {
		if row[0] == "" || row[1] == "" || row[2] == "" || row[3] == "" {
			t.Errorf("row %d has empty fields: %v", i+1, row)
		}
	}
}

// TestAuditCSVExportIsComplete: the export walks every page itself, because a
// half-exported audit trail is worse than none - it looks complete.
func TestAuditCSVExportIsComplete(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 12)

	page := decodeAuditPage(t, env.do(t, http.MethodGet,
		"/api/team/admin/audit?limit=1000", adminToken, nil).Body.String())

	rec := env.do(t, http.MethodGet, "/api/team/admin/audit.csv", adminToken, nil)
	rows, err := csv.NewReader(strings.NewReader(rec.Body.String())).ReadAll()
	if err != nil {
		t.Fatalf("export is not valid CSV: %v", err)
	}

	// Header plus one row per record.
	if got, want := len(rows)-1, int(page.Total); got != want {
		t.Errorf("export holds %d records but the trail has %d", got, want)
	}
}

// TestAuditCSVRespectsFilters stops an export from quietly ignoring the window an
// auditor asked for.
func TestAuditCSVRespectsFilters(t *testing.T) {
	env := newTeamTestEnv(t)
	adminToken := seedAudit(t, env, 3)

	rec := env.do(t, http.MethodGet,
		"/api/team/admin/audit.csv?actor=nobody-at-all", adminToken, nil)
	rows, err := csv.NewReader(strings.NewReader(rec.Body.String())).ReadAll()
	if err != nil {
		t.Fatalf("export is not valid CSV: %v", err)
	}
	if len(rows) != 1 {
		t.Errorf("filtered export should hold only the header, got %d rows", len(rows))
	}
}
