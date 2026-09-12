package collab

import (
	"context"
	"errors"
	"sync"
	"time"

	"developer-toolbox/internal/auth"
)

const (
	MaxMessageSizeBytes  = 256 * 1024 // 256 KB
	MaxMessagesPerSecond = 30

	// sendBuffer is how many outbound messages may queue per client before the hub
	// starts dropping. A slow reader must never block the broadcaster.
	sendBuffer = 50
)

// ErrRateLimited is returned when an actor exceeds MaxMessagesPerSecond.
var ErrRateLimited = errors.New("rate limit exceeded: max 30 messages per second")

// ErrMessageTooLarge is returned when a payload exceeds MaxMessageSizeBytes.
var ErrMessageTooLarge = errors.New("message payload exceeds maximum permitted size of 256 KB")

// ErrNotAuthorized is returned when a principal may not participate in a room.
var ErrNotAuthorized = errors.New("unauthorized: not a member of this workspace")

type CollaborationMessage struct {
	WorkspaceID string `json:"workspaceId"`
	ActorID     string `json:"actorId"`
	Kind        string `json:"kind"` // "shape_update", "cursor", "sync"
	Payload     []byte `json:"payload"`
}

// Authorizer decides whether a principal may join a workspace room.
//
// Membership is not something the collaboration hub can determine on its own, so it
// is injected. A hub with no authorizer denies every join: this boundary fails
// closed rather than admitting any authenticated caller to any room.
type Authorizer interface {
	AuthorizeRoomAccess(ctx context.Context, principal auth.Principal, workspaceID string) error
}

// AuthorizerFunc adapts a function to the Authorizer interface.
type AuthorizerFunc func(ctx context.Context, principal auth.Principal, workspaceID string) error

func (f AuthorizerFunc) AuthorizeRoomAccess(ctx context.Context, p auth.Principal, workspaceID string) error {
	return f(ctx, p, workspaceID)
}

type Client struct {
	ActorID     string
	WorkspaceID string

	sendChan chan CollaborationMessage

	// done is closed exactly once when the client leaves. Broadcasters select on it
	// instead of the hub closing sendChan, so a concurrent Leave can never cause a
	// send on a closed channel.
	done     chan struct{}
	doneOnce sync.Once

	// rate limiting state, guarded by mu
	mu          sync.Mutex
	msgCount    int
	windowStart time.Time
}

// Receive exposes the client's inbound queue for the transport to drain.
func (c *Client) Receive() <-chan CollaborationMessage { return c.sendChan }

// Done is closed when the client is removed from its room.
func (c *Client) Done() <-chan struct{} { return c.done }

func (c *Client) close() {
	c.doneOnce.Do(func() { close(c.done) })
}

// allow reports whether this actor may send another message now, advancing the
// sliding one-second window.
func (c *Client) allow(now time.Time) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if now.Sub(c.windowStart) > time.Second {
		c.windowStart = now
		c.msgCount = 0
	}
	c.msgCount++
	return c.msgCount <= MaxMessagesPerSecond
}

type Room struct {
	WorkspaceID string
	mu          sync.RWMutex
	clients     map[string]*Client
}

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room

	authorizer Authorizer
}

// NewHub builds a hub that denies every join. Use NewHubWithAuthorizer to supply the
// membership check.
func NewHub() *Hub {
	return &Hub{rooms: make(map[string]*Room)}
}

// NewHubWithAuthorizer builds a hub that admits principals the authorizer accepts.
func NewHubWithAuthorizer(a Authorizer) *Hub {
	return &Hub{rooms: make(map[string]*Room), authorizer: a}
}

// AuthorizeRoom checks that a principal may participate in a workspace room.
//
// Identity alone is not sufficient: an authenticated user who is not a member of the
// workspace must be rejected, otherwise any signed-in account could subscribe to
// every team's diagram traffic.
func (h *Hub) AuthorizeRoom(ctx context.Context, principal auth.Principal, workspaceID string) error {
	if workspaceID == "" {
		return errors.New("workspace ID cannot be empty")
	}
	if principal.Subject == "" {
		return errors.New("unauthorized: missing principal")
	}
	if h.authorizer == nil {
		return ErrNotAuthorized
	}
	if err := h.authorizer.AuthorizeRoomAccess(ctx, principal, workspaceID); err != nil {
		return ErrNotAuthorized
	}
	return nil
}

// Join adds an actor to a workspace room. Re-joining with the same actor id retires
// the previous connection so a reconnect cannot leak the earlier reader goroutine.
func (h *Hub) Join(workspaceID, actorID string) (*Client, error) {
	if workspaceID == "" || actorID == "" {
		return nil, errors.New("workspace and actor ids are required")
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	room, exists := h.rooms[workspaceID]
	if !exists {
		room = &Room{
			WorkspaceID: workspaceID,
			clients:     make(map[string]*Client),
		}
		h.rooms[workspaceID] = room
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	if previous, ok := room.clients[actorID]; ok {
		previous.close()
	}

	client := &Client{
		ActorID:     actorID,
		WorkspaceID: workspaceID,
		sendChan:    make(chan CollaborationMessage, sendBuffer),
		done:        make(chan struct{}),
		windowStart: time.Now(),
	}
	room.clients[actorID] = client
	return client, nil
}

// Leave removes an actor and signals its transport to shut down.
func (h *Hub) Leave(workspaceID, actorID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, exists := h.rooms[workspaceID]
	if !exists {
		return
	}

	room.mu.Lock()
	client, ok := room.clients[actorID]
	if ok {
		delete(room.clients, actorID)
	}
	empty := len(room.clients) == 0
	room.mu.Unlock()

	if ok {
		client.close()
	}
	if empty {
		delete(h.rooms, workspaceID)
	}
}

// Broadcast fans a message out to the other members of its workspace room.
//
// The sender is rate limited and the payload size capped. A message is only ever
// delivered inside msg.WorkspaceID, so a client cannot address another workspace by
// forging the field: the caller is required to have joined that room, and a sender
// absent from the room is rejected.
func (h *Hub) Broadcast(msg CollaborationMessage) error {
	if len(msg.Payload) > MaxMessageSizeBytes {
		return ErrMessageTooLarge
	}

	h.mu.RLock()
	room, exists := h.rooms[msg.WorkspaceID]
	h.mu.RUnlock()

	if !exists {
		return nil
	}

	room.mu.RLock()
	sender, senderPresent := room.clients[msg.ActorID]
	recipients := make([]*Client, 0, len(room.clients))
	for _, client := range room.clients {
		if client.ActorID != msg.ActorID {
			recipients = append(recipients, client)
		}
	}
	room.mu.RUnlock()

	// A sender that is not a member of the room it names must not be relayed.
	if !senderPresent {
		return ErrNotAuthorized
	}
	if !sender.allow(time.Now()) {
		return ErrRateLimited
	}

	for _, client := range recipients {
		select {
		case <-client.Done():
			// Client is leaving; nothing to deliver.
		case client.sendChan <- msg:
		default:
			// Buffer full: drop rather than block the broadcaster.
		}
	}

	return nil
}

// RoomSize reports how many actors are connected to a workspace room.
func (h *Hub) RoomSize(workspaceID string) int {
	h.mu.RLock()
	room, exists := h.rooms[workspaceID]
	h.mu.RUnlock()
	if !exists {
		return 0
	}

	room.mu.RLock()
	defer room.mu.RUnlock()
	return len(room.clients)
}
