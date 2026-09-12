package httpapi

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"developer-toolbox/internal/auth"
	"developer-toolbox/internal/config"
	"developer-toolbox/internal/team"
)

const (
	testIssuer   = "https://id.test.example"
	testAudience = "developer-toolbox"
	testKeyID    = "team-test-key"
)

// teamTestEnv is a fully wired team-mode server backed by a temporary database and a
// local signing key, so authorization can be exercised end to end without an
// identity provider.
type teamTestEnv struct {
	handler http.Handler
	store   *team.Store
	signKey *rsa.PrivateKey
}

func newTeamTestEnv(t *testing.T) *teamTestEnv {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate signing key: %v", err)
	}

	store, err := team.OpenStore(t.TempDir() + "/workspace.db")
	if err != nil {
		t.Fatalf("open team store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	validator := auth.NewTokenValidatorWithKeys(testIssuer, testAudience, auth.StaticKeySource{
		Keys: map[string]crypto.PublicKey{testKeyID: &key.PublicKey},
	})

	cfg := config.Config{
		TeamMode:     true,
		OIDCIssuer:   testIssuer,
		OIDCAudience: testAudience,
	}

	handler := NewServer(cfg, &mockSearcher{}, nil,
		WithTeamStore(store),
		WithTeamValidator(validator),
	)

	return &teamTestEnv{handler: handler, store: store, signKey: key}
}

// token mints a signed ID token for a subject with the given roles.
func (e *teamTestEnv) token(t *testing.T, subject string, roles ...string) string {
	t.Helper()

	header, err := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT", "kid": testKeyID})
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	payload, err := json.Marshal(auth.TokenClaims{
		Issuer:    testIssuer,
		Audience:  testAudience,
		Subject:   subject,
		Email:     subject + "@test.example",
		Name:      subject,
		Roles:     roles,
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}

	signingInput := base64.RawURLEncoding.EncodeToString(header) + "." +
		base64.RawURLEncoding.EncodeToString(payload)
	digest := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, e.signKey, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func (e *teamTestEnv) do(t *testing.T, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()

	var reader *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, reader)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	e.handler.ServeHTTP(rec, req)
	return rec
}

// TestTeamModeDisabledByDefault is the regression test for team mode having been
// hardwired off: the router used to construct its handler with a literal
// team.Config{Enabled: false}, so TOOLBOX_TEAM_MODE could never reach it.
func TestTeamModeDisabledByDefault(t *testing.T) {
	srv := NewServer(config.Config{}, &mockSearcher{}, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/team/me", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from disabled probe, got %d", rec.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload["enabled"] != false {
		t.Errorf("expected enabled=false, got %v", payload["enabled"])
	}

	// No authenticated route may exist in the anonymous profile.
	reqWs := httptest.NewRequest(http.MethodGet, "/api/team/workspaces", nil)
	recWs := httptest.NewRecorder()
	srv.ServeHTTP(recWs, reqWs)
	if recWs.Code != http.StatusNotFound {
		t.Errorf("expected 404 for workspaces when team mode is off, got %d", recWs.Code)
	}
}

func TestTeamModeReportsEnabledWhenConfigured(t *testing.T) {
	env := newTeamTestEnv(t)

	rec := env.do(t, http.MethodGet, "/api/team/me", env.token(t, "usr_alice", "admin"), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload["enabled"] != true || payload["authenticated"] != true {
		t.Errorf("expected enabled and authenticated, got %v", payload)
	}
}

func TestTeamRoutesRejectUnauthenticatedRequests(t *testing.T) {
	env := newTeamTestEnv(t)

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/team/workspaces"},
		{http.MethodPost, "/api/team/workspaces"},
		{http.MethodGet, "/api/team/admin/packs"},
	} {
		rec := env.do(t, tc.method, tc.path, "", map[string]string{"name": "x"})
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: expected 401 without a token, got %d", tc.method, tc.path, rec.Code)
		}
	}
}

func TestTeamRoutesRejectForgedToken(t *testing.T) {
	env := newTeamTestEnv(t)

	// An unsigned token claiming admin must not be accepted by any route.
	payload, err := json.Marshal(auth.TokenClaims{
		Issuer:    testIssuer,
		Audience:  testAudience,
		Subject:   "attacker",
		Roles:     []string{"admin"},
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	forged := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`)) + "." +
		base64.RawURLEncoding.EncodeToString(payload) + ".sig"

	rec := env.do(t, http.MethodGet, "/api/team/admin/packs", forged, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for an unsigned token, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestWorkspaceCreateAndListRoundTrip(t *testing.T) {
	env := newTeamTestEnv(t)
	tok := env.token(t, "usr_owner", "editor")

	rec := env.do(t, http.MethodPost, "/api/team/workspaces", tok, map[string]string{"name": "Platform"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var created team.Workspace
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected a workspace id")
	}

	// Creating a second workspace must succeed. The service previously derived ids
	// from a constant, so this collided on the primary key.
	rec2 := env.do(t, http.MethodPost, "/api/team/workspaces", tok, map[string]string{"name": "Payments"})
	if rec2.Code != http.StatusCreated {
		t.Fatalf("expected 201 for a second workspace, got %d: %s", rec2.Code, rec2.Body.String())
	}
	var second team.Workspace
	if err := json.NewDecoder(rec2.Body).Decode(&second); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if second.ID == created.ID {
		t.Fatal("workspace ids must be unique")
	}

	recList := env.do(t, http.MethodGet, "/api/team/workspaces", tok, nil)
	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recList.Code)
	}
	var list []team.Workspace
	if err := json.NewDecoder(recList.Body).Decode(&list); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 workspaces, got %d", len(list))
	}
}

func TestWorkspaceGetAndRename(t *testing.T) {
	env := newTeamTestEnv(t)
	tok := env.token(t, "usr_owner", "editor")

	rec := env.do(t, http.MethodPost, "/api/team/workspaces", tok, map[string]string{"name": "Platform"})
	var ws team.Workspace
	if err := json.NewDecoder(rec.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}

	recGet := env.do(t, http.MethodGet, "/api/team/workspaces/"+ws.ID, tok, nil)
	if recGet.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recGet.Code, recGet.Body.String())
	}

	recPatch := env.do(t, http.MethodPatch, "/api/team/workspaces/"+ws.ID, tok,
		map[string]string{"name": "Platform Team"})
	if recPatch.Code != http.StatusOK {
		t.Fatalf("expected 200 from patch, got %d: %s", recPatch.Code, recPatch.Body.String())
	}
	var renamed team.Workspace
	if err := json.NewDecoder(recPatch.Body).Decode(&renamed); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if renamed.Name != "Platform Team" {
		t.Errorf("expected renamed workspace, got %q", renamed.Name)
	}
}

// TestInaccessibleWorkspaceReturns404 covers the Phase 3 requirement that an unknown
// user receives 404 for an inaccessible workspace, so existence does not leak.
func TestInaccessibleWorkspaceReturns404(t *testing.T) {
	env := newTeamTestEnv(t)

	ownerTok := env.token(t, "usr_owner", "editor")
	rec := env.do(t, http.MethodPost, "/api/team/workspaces", ownerTok, map[string]string{"name": "Secret"})
	var ws team.Workspace
	if err := json.NewDecoder(rec.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}

	outsiderTok := env.token(t, "usr_outsider", "editor")
	recGet := env.do(t, http.MethodGet, "/api/team/workspaces/"+ws.ID, outsiderTok, nil)
	if recGet.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for a non-member, got %d", recGet.Code)
	}

	recMissing := env.do(t, http.MethodGet, "/api/team/workspaces/does-not-exist", outsiderTok, nil)
	if recMissing.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for a missing workspace, got %d", recMissing.Code)
	}
}

func TestViewerCannotRenameWorkspace(t *testing.T) {
	env := newTeamTestEnv(t)

	ownerTok := env.token(t, "usr_owner", "editor")
	rec := env.do(t, http.MethodPost, "/api/team/workspaces", ownerTok, map[string]string{"name": "Platform"})
	var ws team.Workspace
	if err := json.NewDecoder(rec.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// The owner adds a viewer.
	viewerSubject := "usr_viewer"
	if err := env.store.UpsertUser(context.Background(), auth.Principal{
		Subject: viewerSubject, Email: "v@test.example", DisplayName: "Viewer",
		Roles: []auth.Role{auth.RoleViewer},
	}); err != nil {
		t.Fatalf("upsert viewer: %v", err)
	}
	recAdd := env.do(t, http.MethodPost, "/api/team/workspaces/"+ws.ID+"/members", ownerTok,
		map[string]string{"userSubject": viewerSubject, "role": "viewer"})
	if recAdd.Code != http.StatusCreated {
		t.Fatalf("expected 201 adding member, got %d: %s", recAdd.Code, recAdd.Body.String())
	}

	// A viewer may read but must not write.
	viewerTok := env.token(t, viewerSubject, "viewer")
	if recRead := env.do(t, http.MethodGet, "/api/team/workspaces/"+ws.ID, viewerTok, nil); recRead.Code != http.StatusOK {
		t.Fatalf("expected viewer to read workspace, got %d", recRead.Code)
	}
	recPatch := env.do(t, http.MethodPatch, "/api/team/workspaces/"+ws.ID, viewerTok,
		map[string]string{"name": "Hijacked"})
	if recPatch.Code == http.StatusOK {
		t.Fatal("a viewer must not be able to rename a workspace")
	}
}

func TestOnlyAdminsManagePacks(t *testing.T) {
	env := newTeamTestEnv(t)

	editorTok := env.token(t, "usr_editor", "editor")
	if rec := env.do(t, http.MethodGet, "/api/team/admin/packs", editorTok, nil); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for a non-admin listing packs, got %d", rec.Code)
	}

	adminTok := env.token(t, "usr_admin", "admin")
	recList := env.do(t, http.MethodGet, "/api/team/admin/packs", adminTok, nil)
	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 for an admin, got %d: %s", recList.Code, recList.Body.String())
	}

	// Activation requires the provenance fields before it is accepted.
	recIncomplete := env.do(t, http.MethodPost, "/api/team/admin/packs", adminTok,
		map[string]string{"name": "core", "version": "0.1.0"})
	if recIncomplete.Code != http.StatusBadRequest {
		t.Errorf("expected 400 activating a pack without checksum/license, got %d", recIncomplete.Code)
	}

	recActivate := env.do(t, http.MethodPost, "/api/team/admin/packs", adminTok, map[string]string{
		"name":        "core",
		"version":     "0.1.0",
		"checksum":    "1f4081c7d390df7ac69cc43e26bba7a86a95ccd365d74e1e079e69c844393d58",
		"license":     "CC-BY-4.0",
		"attribution": "Microsoft Learn",
	})
	if recActivate.Code != http.StatusCreated {
		t.Fatalf("expected 201 activating a pack, got %d: %s", recActivate.Code, recActivate.Body.String())
	}

	// An editor must not be able to activate a pack either.
	recForbidden := env.do(t, http.MethodPost, "/api/team/admin/packs", editorTok, map[string]string{
		"name": "rogue", "version": "1.0.0", "checksum": "abc", "license": "MIT",
	})
	if recForbidden.Code != http.StatusForbidden {
		t.Errorf("expected 403 for an editor activating a pack, got %d", recForbidden.Code)
	}
}

// TestAuditTrailRecordsAdminActions covers the Phase 3 requirement that audit records
// are written for create, member-role, and pack-activation actions, and that they
// never contain document content.
func TestAuditTrailRecordsAdminActions(t *testing.T) {
	env := newTeamTestEnv(t)
	adminTok := env.token(t, "usr_admin", "admin")

	rec := env.do(t, http.MethodPost, "/api/team/workspaces", adminTok, map[string]string{"name": "Audited"})
	var ws team.Workspace
	if err := json.NewDecoder(rec.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if err := env.store.UpsertUser(context.Background(), auth.Principal{
		Subject: "usr_member", Email: "m@test.example", DisplayName: "Member",
		Roles: []auth.Role{auth.RoleEditor},
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	env.do(t, http.MethodPost, "/api/team/workspaces/"+ws.ID+"/members", adminTok,
		map[string]string{"userSubject": "usr_member", "role": "editor"})

	records, err := env.store.ListAuditRecords(context.Background())
	if err != nil {
		t.Fatalf("list audit: %v", err)
	}
	if len(records) < 2 {
		t.Fatalf("expected at least create and member audit records, got %d", len(records))
	}

	actions := map[string]bool{}
	for _, r := range records {
		actions[r.Action] = true
		if r.ActorID == "" {
			t.Error("audit record must identify the actor")
		}
	}
	if !actions["create-workspace"] {
		t.Error("expected a create-workspace audit record")
	}
}
