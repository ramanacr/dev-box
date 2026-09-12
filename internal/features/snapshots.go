package features

import (
	"context"

	"developer-toolbox/internal/team"
)

// snapshotStore adapts the team store to the collaboration snapshot interface.
//
// Collaboration state is workspace data, so it belongs in the writable workspace
// database rather than in relay memory: a container restart must not lose a team's
// canvas, and a reconnecting client needs shared state to start from.
type snapshotStore struct {
	store *team.Store
}

func newSnapshotStore(store *team.Store) *snapshotStore {
	if store == nil {
		return nil
	}
	return &snapshotStore{store: store}
}

func (s *snapshotStore) SaveSnapshot(ctx context.Context, workspaceID, actorID string, payload []byte) error {
	return s.store.SaveDiagramSnapshot(ctx, workspaceID, actorID, payload)
}

func (s *snapshotStore) LoadSnapshot(ctx context.Context, workspaceID string) ([]byte, error) {
	return s.store.LoadDiagramSnapshot(ctx, workspaceID)
}
