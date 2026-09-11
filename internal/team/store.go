package team

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"developer-toolbox/internal/auth"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
	mu sync.RWMutex
}

type Workspace struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	OwnerSubject string    `json:"ownerSubject"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type WorkspaceMember struct {
	WorkspaceID string    `json:"workspaceId"`
	UserSubject string    `json:"userSubject"`
	Role        auth.Role `json:"role"`
}

type AuditRecord struct {
	ActorID   string    `json:"actorId"`
	Action    string    `json:"action"`
	TargetID  string    `json:"targetId"`
	CreatedAt time.Time `json:"createdAt"`
}

type ActivePack struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Checksum    string `json:"checksum"`
	License     string `json:"license"`
	Attribution string `json:"attribution"`
	ActivatedBy string `json:"activatedBy"`
}

func OpenStore(dbPath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory for team db: %w", err)
	}

	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open team db: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to run team db migrations: %w", err)
	}

	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	schema := `
	PRAGMA foreign_keys = ON;

	CREATE TABLE IF NOT EXISTS users (
		subject TEXT PRIMARY KEY,
		email TEXT NOT NULL,
		display_name TEXT NOT NULL,
		roles TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS workspaces (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		owner_subject TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(owner_subject) REFERENCES users(subject) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS workspace_members (
		workspace_id TEXT NOT NULL,
		user_subject TEXT NOT NULL,
		role TEXT NOT NULL CHECK(role IN ('viewer', 'editor', 'admin')),
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (workspace_id, user_subject),
		FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY(user_subject) REFERENCES users(subject) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS audit_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		actor_id TEXT NOT NULL,
		action TEXT NOT NULL,
		target_id TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS active_packs (
		name TEXT PRIMARY KEY,
		version TEXT NOT NULL,
		checksum TEXT NOT NULL,
		license TEXT NOT NULL,
		attribution TEXT NOT NULL,
		activated_by TEXT NOT NULL,
		activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) UpsertUser(ctx context.Context, p auth.Principal) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	rolesJSON, err := json.Marshal(p.Roles)
	if err != nil {
		return err
	}

	query := `
	INSERT INTO users (subject, email, display_name, roles, updated_at)
	VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
	ON CONFLICT(subject) DO UPDATE SET
		email = excluded.email,
		display_name = excluded.display_name,
		roles = excluded.roles,
		updated_at = CURRENT_TIMESTAMP;
	`
	_, err = s.db.ExecContext(ctx, query, p.Subject, p.Email, p.DisplayName, string(rolesJSON))
	return err
}

func (s *Store) CreateWorkspace(ctx context.Context, id, name string, ownerSubject string) (Workspace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Workspace{}, err
	}
	defer tx.Rollback()

	insertWS := `INSERT INTO workspaces (id, name, owner_subject) VALUES (?, ?, ?);`
	if _, err := tx.ExecContext(ctx, insertWS, id, name, ownerSubject); err != nil {
		return Workspace{}, err
	}

	insertMember := `INSERT INTO workspace_members (workspace_id, user_subject, role) VALUES (?, ?, 'admin');`
	if _, err := tx.ExecContext(ctx, insertMember, id, ownerSubject); err != nil {
		return Workspace{}, err
	}

	insertAudit := `INSERT INTO audit_events (actor_id, action, target_id) VALUES (?, 'create-workspace', ?);`
	if _, err := tx.ExecContext(ctx, insertAudit, ownerSubject, id); err != nil {
		return Workspace{}, err
	}

	if err := tx.Commit(); err != nil {
		return Workspace{}, err
	}

	return Workspace{
		ID:           id,
		Name:         name,
		OwnerSubject: ownerSubject,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}, nil
}

func (s *Store) ListWorkspaces(ctx context.Context, userSubject string) ([]Workspace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `
	SELECT w.id, w.name, w.owner_subject, w.created_at, w.updated_at
	FROM workspaces w
	JOIN workspace_members m ON w.id = m.workspace_id
	WHERE m.user_subject = ?
	ORDER BY w.created_at DESC;
	`
	rows, err := s.db.QueryContext(ctx, query, userSubject)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaces []Workspace
	for rows.Next() {
		var ws Workspace
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.OwnerSubject, &ws.CreatedAt, &ws.UpdatedAt); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, ws)
	}
	return workspaces, rows.Err()
}

func (s *Store) GetMemberRole(ctx context.Context, workspaceID, userSubject string) (auth.Role, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var roleStr string
	query := `SELECT role FROM workspace_members WHERE workspace_id = ? AND user_subject = ?;`
	err := s.db.QueryRowContext(ctx, query, workspaceID, userSubject).Scan(&roleStr)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errors.New("not a member of workspace")
	}
	if err != nil {
		return "", err
	}
	return auth.Role(roleStr), nil
}

func (s *Store) AddMember(ctx context.Context, actorSubject, workspaceID, userSubject string, role auth.Role) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	query := `
	INSERT INTO workspace_members (workspace_id, user_subject, role)
	VALUES (?, ?, ?)
	ON CONFLICT(workspace_id, user_subject) DO UPDATE SET
		role = excluded.role;
	`
	if _, err := tx.ExecContext(ctx, query, workspaceID, userSubject, string(role)); err != nil {
		return err
	}

	audit := `INSERT INTO audit_events (actor_id, action, target_id) VALUES (?, ?, ?);`
	action := fmt.Sprintf("set-member-role:%s", role)
	if _, err := tx.ExecContext(ctx, audit, actorSubject, action, workspaceID); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) ActivatePack(ctx context.Context, actorSubject string, pack ActivePack) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	query := `
	INSERT INTO active_packs (name, version, checksum, license, attribution, activated_by)
	VALUES (?, ?, ?, ?, ?, ?)
	ON CONFLICT(name) DO UPDATE SET
		version = excluded.version,
		checksum = excluded.checksum,
		license = excluded.license,
		attribution = excluded.attribution,
		activated_by = excluded.activated_by,
		activated_at = CURRENT_TIMESTAMP;
	`
	if _, err := tx.ExecContext(ctx, query, pack.Name, pack.Version, pack.Checksum, pack.License, pack.Attribution, actorSubject); err != nil {
		return err
	}

	audit := `INSERT INTO audit_events (actor_id, action, target_id) VALUES (?, 'activate-pack', ?);`
	if _, err := tx.ExecContext(ctx, audit, actorSubject, pack.Name); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) ListActivePacks(ctx context.Context) ([]ActivePack, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT name, version, checksum, license, attribution, activated_by FROM active_packs;`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var packs []ActivePack
	for rows.Next() {
		var p ActivePack
		if err := rows.Scan(&p.Name, &p.Version, &p.Checksum, &p.License, &p.Attribution, &p.ActivatedBy); err != nil {
			return nil, err
		}
		packs = append(packs, p)
	}
	return packs, rows.Err()
}

func (s *Store) ListAuditRecords(ctx context.Context) ([]AuditRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT actor_id, action, target_id, created_at FROM audit_events ORDER BY id DESC;`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var audits []AuditRecord
	for rows.Next() {
		var a AuditRecord
		if err := rows.Scan(&a.ActorID, &a.Action, &a.TargetID, &a.CreatedAt); err != nil {
			return nil, err
		}
		audits = append(audits, a)
	}
	return audits, rows.Err()
}
