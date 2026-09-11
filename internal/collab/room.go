package collab

import (
	"errors"
	"sync"
	"time"

	"developer-toolbox/internal/auth"
)

const (
	MaxMessageSizeBytes = 256 * 1024 // 256 KB
	MaxMessagesPerSecond = 30
)

type CollaborationMessage struct {
	WorkspaceID string `json:"workspaceId"`
	ActorID     string `json:"actorId"`
	Kind        string `json:"kind"` // "shape_update", "cursor", "sync"
	Payload     []byte `json:"payload"`
}

type Client struct {
	ActorID     string
	WorkspaceID string
	sendChan    chan CollaborationMessage
	msgCount    int
	windowStart time.Time
}

type Room struct {
	WorkspaceID string
	mu          sync.RWMutex
	clients     map[string]*Client
}

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewHub() *Hub {
	return &Hub{
		rooms: make(map[string]*Room),
	}
}

func (h *Hub) AuthorizeRoom(principal auth.Principal, workspaceID string) error {
	if workspaceID == "" {
		return errors.New("workspace ID cannot be empty")
	}
	if principal.Subject == "" {
		return errors.New("unauthorized: missing principal")
	}
	return nil
}

func (h *Hub) Join(workspaceID, actorID string) (*Client, error) {
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

	client := &Client{
		ActorID:     actorID,
		WorkspaceID: workspaceID,
		sendChan:    make(chan CollaborationMessage, 50),
		windowStart: time.Now(),
	}
	room.clients[actorID] = client
	return client, nil
}

func (h *Hub) Leave(workspaceID, actorID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, exists := h.rooms[workspaceID]
	if !exists {
		return
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	if client, ok := room.clients[actorID]; ok {
		close(client.sendChan)
		delete(room.clients, actorID)
	}

	if len(room.clients) == 0 {
		delete(h.rooms, workspaceID)
	}
}

func (h *Hub) Broadcast(msg CollaborationMessage) error {
	if len(msg.Payload) > MaxMessageSizeBytes {
		return errors.New("message payload exceeds maximum permitted size of 256 KB")
	}

	h.mu.RLock()
	room, exists := h.rooms[msg.WorkspaceID]
	h.mu.RUnlock()

	if !exists {
		return nil
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	sender, exists := room.clients[msg.ActorID]
	if exists {
		now := time.Now()
		if now.Sub(sender.windowStart) > time.Second {
			sender.windowStart = now
			sender.msgCount = 0
		}
		sender.msgCount++
		if sender.msgCount > MaxMessagesPerSecond {
			return errors.New("rate limit exceeded: max 30 messages per second")
		}
	}

	for _, client := range room.clients {
		if client.ActorID != msg.ActorID {
			select {
			case client.sendChan <- msg:
			default:
				// Buffer full; skip drop non-blocking
			}
		}
	}

	return nil
}
