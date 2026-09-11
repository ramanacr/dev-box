package team

import (
	"context"
	"errors"
	"fmt"

	"developer-toolbox/internal/auth"
)

type WorkspaceAction string

const (
	ActionRead          WorkspaceAction = "read"
	ActionWrite         WorkspaceAction = "write"
	ActionManageMembers WorkspaceAction = "manage-members"
	ActionManagePacks   WorkspaceAction = "manage-packs"
)

type WorkspaceService struct {
	store *Store
}

func NewWorkspaceService(store *Store) *WorkspaceService {
	return &WorkspaceService{store: store}
}

func (s *WorkspaceService) Create(ctx context.Context, p auth.Principal, name string) (Workspace, error) {
	if name == "" {
		return Workspace{}, errors.New("workspace name cannot be empty")
	}

	wsID := fmt.Sprintf("ws-%d", timeNowUnixNano())
	return s.store.CreateWorkspace(ctx, wsID, name, p.Subject)
}

func (s *WorkspaceService) Authorize(ctx context.Context, p auth.Principal, workspaceID string, action WorkspaceAction) error {
	// If the user has global system admin role, they can perform all actions
	for _, r := range p.Roles {
		if r == auth.RoleAdmin {
			return nil
		}
	}

	if action == ActionManagePacks {
		return errors.New("forbidden: only global admins can manage packs")
	}

	role, err := s.store.GetMemberRole(ctx, workspaceID, p.Subject)
	if err != nil {
		return fmt.Errorf("forbidden: not authorized on workspace: %w", err)
	}

	switch action {
	case ActionRead:
		return nil // All members can read
	case ActionWrite:
		if role == auth.RoleViewer {
			return errors.New("forbidden: viewers cannot modify workspace contents")
		}
		return nil
	case ActionManageMembers:
		if role != auth.RoleAdmin {
			return errors.New("forbidden: only workspace admins can manage membership")
		}
		return nil
	default:
		return errors.New("unrecognized action")
	}
}

var timeNowUnixNano = func() int64 {
	return 1773300000000
}
