package team

import (
	"context"
	"path/filepath"
	"testing"

	"developer-toolbox/internal/auth"
)

func TestWorkspaceServiceAuthorization(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "workspace.db")

	store, err := OpenStore(dbPath)
	if err != nil {
		t.Fatalf("failed to open store: %v", err)
	}
	defer store.Close()

	svc := NewWorkspaceService(store)
	ctx := context.Background()

	adminUser := auth.Principal{Subject: "admin_1", Roles: []auth.Role{auth.RoleAdmin}}
	editorUser := auth.Principal{Subject: "editor_1", Roles: []auth.Role{auth.RoleEditor}}
	viewerUser := auth.Principal{Subject: "viewer_1", Roles: []auth.Role{auth.RoleViewer}}

	_ = store.UpsertUser(ctx, adminUser)
	_ = store.UpsertUser(ctx, editorUser)
	_ = store.UpsertUser(ctx, viewerUser)

	ws, err := svc.Create(ctx, adminUser, "Dev Team")
	if err != nil {
		t.Fatalf("failed to create workspace: %v", err)
	}

	_ = store.AddMember(ctx, adminUser.Subject, ws.ID, editorUser.Subject, auth.RoleEditor)
	_ = store.AddMember(ctx, adminUser.Subject, ws.ID, viewerUser.Subject, auth.RoleViewer)

	// 1. Viewer can read, cannot write, cannot manage members
	if err := svc.Authorize(ctx, viewerUser, ws.ID, ActionRead); err != nil {
		t.Errorf("expected viewer to read: %v", err)
	}
	if err := svc.Authorize(ctx, viewerUser, ws.ID, ActionWrite); err == nil {
		t.Errorf("expected viewer write to be forbidden")
	}
	if err := svc.Authorize(ctx, viewerUser, ws.ID, ActionManageMembers); err == nil {
		t.Errorf("expected viewer member manage to be forbidden")
	}

	// 2. Editor can read and write, cannot manage members
	if err := svc.Authorize(ctx, editorUser, ws.ID, ActionWrite); err != nil {
		t.Errorf("expected editor to write: %v", err)
	}
	if err := svc.Authorize(ctx, editorUser, ws.ID, ActionManageMembers); err == nil {
		t.Errorf("expected editor manage members to be forbidden")
	}

	// 3. Admin can do all
	if err := svc.Authorize(ctx, adminUser, ws.ID, ActionManageMembers); err != nil {
		t.Errorf("expected admin to manage members: %v", err)
	}
}
