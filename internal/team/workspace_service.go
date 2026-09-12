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
	if p.Subject == "" {
		return Workspace{}, errors.New("workspace owner must be an identified principal")
	}

	// workspaces.id is a PRIMARY KEY, so the identifier has to be unique per call.
	wsID, err := newUUID()
	if err != nil {
		return Workspace{}, err
	}
	return s.store.CreateWorkspace(ctx, wsID, name, p.Subject)
}

// Rename changes a workspace name after checking the caller may write to it.
func (s *WorkspaceService) Rename(ctx context.Context, p auth.Principal, workspaceID, name string) (Workspace, error) {
	if name == "" {
		return Workspace{}, errors.New("workspace name cannot be empty")
	}
	if err := s.Authorize(ctx, p, workspaceID, ActionWrite); err != nil {
		return Workspace{}, err
	}
	return s.store.RenameWorkspace(ctx, p.Subject, workspaceID, name)
}

// Get returns a workspace the caller is allowed to read.
func (s *WorkspaceService) Get(ctx context.Context, p auth.Principal, workspaceID string) (Workspace, error) {
	if err := s.Authorize(ctx, p, workspaceID, ActionRead); err != nil {
		return Workspace{}, err
	}
	return s.store.GetWorkspace(ctx, workspaceID)
}

// AddMember grants a role on a workspace. Only workspace admins and global admins
// may do this; the check lives here rather than in the HTTP handler so that every
// caller is subject to it.
func (s *WorkspaceService) AddMember(ctx context.Context, p auth.Principal, workspaceID, userSubject string, role auth.Role) error {
	switch role {
	case auth.RoleViewer, auth.RoleEditor, auth.RoleAdmin:
	default:
		return fmt.Errorf("unsupported role %q", role)
	}
	if userSubject == "" {
		return errors.New("member subject is required")
	}
	if err := s.Authorize(ctx, p, workspaceID, ActionManageMembers); err != nil {
		return err
	}
	return s.store.AddMember(ctx, p.Subject, workspaceID, userSubject, role)
}

// ErrValidation marks an error caused by caller input rather than by a storage or
// authorization failure. Handlers use it to decide which errors are safe to relay
// verbatim; storage errors carry SQL text and must never be echoed to a client.
var ErrValidation = errors.New("validation")

// ActivatePack records an approved content pack. Restricted to global admins by the
// manage-packs action.
func (s *WorkspaceService) ActivatePack(ctx context.Context, p auth.Principal, pack ActivePack) error {
	if pack.Name == "" || pack.Version == "" {
		return fmt.Errorf("%w: pack name and version are required", ErrValidation)
	}
	// A pack may not be activated without the provenance a reviewer needs to approve
	// it: the white paper treats content licensing as a product requirement.
	if pack.Checksum == "" || pack.License == "" {
		return fmt.Errorf("%w: pack checksum and license are required before activation", ErrValidation)
	}
	if err := s.Authorize(ctx, p, "", ActionManagePacks); err != nil {
		return err
	}
	return s.store.ActivatePack(ctx, p.Subject, pack)
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
