package collab

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"

	"developer-toolbox/internal/auth"
)

const (
	// writeTimeout bounds how long a single frame write may take before the
	// connection is considered stuck.
	writeTimeout = 10 * time.Second

	// pongWait is how long a connection may be silent before it is closed. Clients
	// are expected to answer the server's pings well inside this window.
	pongWait = 60 * time.Second

	// pingInterval must be comfortably shorter than pongWait.
	pingInterval = 25 * time.Second
)

// TokenValidator is the subset of auth.TokenValidator the handler needs.
type TokenValidator interface {
	ValidateIDToken(ctx context.Context, rawToken string) (auth.Principal, error)
}

// SnapshotStore persists the latest accepted state for a workspace.
//
// The Phase 4 plan requires snapshots to be persisted through the workspace service
// rather than kept only in relay memory, so a reconnecting client can recover.
type SnapshotStore interface {
	SaveSnapshot(ctx context.Context, workspaceID, actorID string, payload []byte) error
	LoadSnapshot(ctx context.Context, workspaceID string) ([]byte, error)
}

// Handler serves the authenticated collaboration WebSocket.
type Handler struct {
	Hub       *Hub
	Validator TokenValidator
	Snapshots SnapshotStore

	// AllowedOrigins restricts which browser origins may open a socket. Empty means
	// same-origin only, which is what the local-first deployment wants.
	AllowedOrigins []string
}

// NewHandler builds a collaboration WebSocket handler.
func NewHandler(hub *Hub, validator TokenValidator, snapshots SnapshotStore) *Handler {
	return &Handler{Hub: hub, Validator: validator, Snapshots: snapshots}
}

// RegisterRoutes mounts the relay under /api/collab/.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/collab/workspaces/{id}/socket", h.serveSocket)
}

// serveSocket authenticates the request, authorizes room membership, and then
// upgrades. Authorization happens before the upgrade so an unauthorized caller
// receives a plain HTTP status rather than an open socket that is closed later.
func (h *Handler) serveSocket(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("id")

	principal, err := h.authenticate(r)
	if err != nil {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}

	if err := h.Hub.AuthorizeRoom(r.Context(), principal, workspaceID); err != nil {
		// Membership failures return 404 so room existence does not leak, matching
		// the team workspace routes.
		http.Error(w, "workspace not found", http.StatusNotFound)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: h.AllowedOrigins,
	})
	if err != nil {
		slog.Warn("collab websocket upgrade failed", "error", err)
		return
	}
	// Refuse oversized frames at the transport layer too, so a hostile client cannot
	// force the server to buffer more than the documented cap.
	conn.SetReadLimit(MaxMessageSizeBytes)

	defer func() {
		_ = conn.CloseNow()
	}()

	client, err := h.Hub.Join(workspaceID, principal.Subject)
	if err != nil {
		_ = conn.Close(websocket.StatusInternalError, "join failed")
		return
	}
	defer h.Hub.Leave(workspaceID, principal.Subject)

	slog.Info("collab client joined",
		"workspace", workspaceID,
		"actor", principal.Subject,
		"room_size", h.Hub.RoomSize(workspaceID),
	)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Send the current snapshot so a joining client starts from shared state.
	if h.Snapshots != nil {
		if snapshot, err := h.Snapshots.LoadSnapshot(ctx, workspaceID); err == nil && len(snapshot) > 0 {
			initial := CollaborationMessage{
				WorkspaceID: workspaceID,
				ActorID:     "",
				Kind:        "sync",
				Payload:     snapshot,
			}
			if err := writeMessage(ctx, conn, initial); err != nil {
				return
			}
		}
	}

	go h.writeLoop(ctx, cancel, conn, client)
	h.readLoop(ctx, conn, client, principal)
}

// authenticate resolves the principal from either the Authorization header or the
// `access_token` query parameter, which browsers must use because the WebSocket API
// cannot set headers.
func (h *Handler) authenticate(r *http.Request) (auth.Principal, error) {
	if h.Validator == nil {
		return auth.Principal{}, errors.New("token validation is not configured")
	}

	raw := ""
	if hdr := r.Header.Get("Authorization"); strings.HasPrefix(hdr, "Bearer ") {
		raw = strings.TrimPrefix(hdr, "Bearer ")
	} else if q := r.URL.Query().Get("access_token"); q != "" {
		raw = q
	}
	if raw == "" {
		return auth.Principal{}, errors.New("missing bearer token")
	}

	return h.Validator.ValidateIDToken(r.Context(), raw)
}

// writeLoop drains the hub queue to the socket and keeps the connection alive.
func (h *Handler) writeLoop(ctx context.Context, cancel context.CancelFunc, conn *websocket.Conn, client *Client) {
	defer cancel()

	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-client.Done():
			return
		case msg := <-client.Receive():
			if err := writeMessage(ctx, conn, msg); err != nil {
				return
			}
		case <-ticker.C:
			pingCtx, pingCancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.Ping(pingCtx)
			pingCancel()
			if err != nil {
				return
			}
		}
	}
}

// readLoop accepts client frames, enforces the relay policy, and rebroadcasts.
func (h *Handler) readLoop(ctx context.Context, conn *websocket.Conn, client *Client, principal auth.Principal) {
	for {
		readCtx, cancelRead := context.WithTimeout(ctx, pongWait)
		typ, data, err := conn.Read(readCtx)
		cancelRead()
		if err != nil {
			return
		}
		if typ != websocket.MessageText {
			_ = conn.Close(websocket.StatusUnsupportedData, "only text frames are accepted")
			return
		}

		var incoming CollaborationMessage
		if err := json.Unmarshal(data, &incoming); err != nil {
			// Malformed input is a client error, not a reason to tear down the room.
			_ = writeMessage(ctx, conn, CollaborationMessage{
				WorkspaceID: client.WorkspaceID,
				Kind:        "error",
				Payload:     []byte(`{"message":"malformed message"}`),
			})
			continue
		}

		// The actor and workspace are taken from the authenticated session, never
		// from the frame. This is what stops a client from writing into another
		// workspace or impersonating another actor by editing the JSON.
		incoming.WorkspaceID = client.WorkspaceID
		incoming.ActorID = principal.Subject

		if err := h.Hub.Broadcast(incoming); err != nil {
			switch {
			case errors.Is(err, ErrRateLimited):
				_ = conn.Close(websocket.StatusPolicyViolation, "rate limit exceeded")
				return
			case errors.Is(err, ErrMessageTooLarge):
				_ = conn.Close(websocket.StatusMessageTooBig, "message too large")
				return
			default:
				_ = conn.Close(websocket.StatusPolicyViolation, "message rejected")
				return
			}
		}

		// Persist accepted canvas state so the room can be rebuilt after a restart.
		// Only "sync" frames carry a whole-document snapshot; incremental updates are
		// relayed but not stored.
		if h.Snapshots != nil && incoming.Kind == "sync" {
			if err := h.Snapshots.SaveSnapshot(ctx, client.WorkspaceID, principal.Subject, incoming.Payload); err != nil {
				slog.Error("failed to persist collaboration snapshot",
					"workspace", client.WorkspaceID, "error", err)
			}
		}
	}
}

func writeMessage(ctx context.Context, conn *websocket.Conn, msg CollaborationMessage) error {
	encoded, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return conn.Write(writeCtx, websocket.MessageText, encoded)
}
