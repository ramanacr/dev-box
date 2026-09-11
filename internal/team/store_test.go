package team

import (
	"context"
	"path/filepath"
	"testing"

	"developer-toolbox/internal/auth"
)

func TestTeamStoreWorkspacesAndAudits(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "workspace.db")

	store, err := OpenStore(dbPath)
	if err != nil {
		t.Fatalf("failed to open store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	// 1. Upsert users
	alice := auth.Principal{Subject: "alice_sub", Email: "alice@example.com", DisplayName: "Alice", Roles: []auth.Role{auth.RoleAdmin}}
	bob := auth.Principal{Subject: "bob_sub", Email: "bob@example.com", DisplayName: "Bob", Roles: []auth.Role{auth.RoleViewer}}

	if err := store.UpsertUser(ctx, alice); err != nil {
		t.Fatalf("failed to upsert alice: %v", err)
	}
	if err := store.UpsertUser(ctx, bob); err != nil {
		t.Fatalf("failed to upsert bob: %v", err)
	}

	// 2. Create workspace
	ws, err := store.CreateWorkspace(ctx, "ws-1", "Backend Team", alice.Subject)
	if err != nil {
		t.Fatalf("failed to create workspace: %v", err)
	}
	if ws.Name != "Backend Team" {
		t.Fatalf("unexpected workspace name %s", ws.Name)
	}

	// 3. Alice should be admin of ws-1
	role, err := store.GetMemberRole(ctx, "ws-1", alice.Subject)
	if err != nil || role != auth.RoleAdmin {
		t.Fatalf("expected alice to be admin, got %v (err: %v)", role, err)
	}

	// 4. Bob not yet member
	if _, err := store.GetMemberRole(ctx, "ws-1", bob.Subject); err == nil {
		t.Fatalf("expected bob not to be member")
	}

	// 5. Add Bob as editor
	if err := store.AddMember(ctx, alice.Subject, "ws-1", bob.Subject, auth.RoleEditor); err != nil {
		t.Fatalf("failed to add bob: %v", err)
	}

	role, err = store.GetMemberRole(ctx, "ws-1", bob.Subject)
	if err != nil || role != auth.RoleEditor {
		t.Fatalf("expected bob to be editor, got %v (err: %v)", role, err)
	}

	// 6. Check audits recorded
	audits, err := store.ListAuditRecords(ctx)
	if err != nil {
		t.Fatalf("failed to list audits: %v", err)
	}
	if len(audits) < 2 {
		t.Fatalf("expected at least 2 audit entries, got %d", len(audits))
	}
}
