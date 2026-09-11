package collab

import (
	"bytes"
	"testing"

	"developer-toolbox/internal/auth"
)

func TestCollabHubJoinLeaveAndBroadcast(t *testing.T) {
	hub := NewHub()

	// 1. Authorization
	pAlice := auth.Principal{Subject: "alice"}
	if err := hub.AuthorizeRoom(pAlice, "ws-1"); err != nil {
		t.Fatalf("expected alice authorized: %v", err)
	}
	if err := hub.AuthorizeRoom(auth.Principal{}, "ws-1"); err == nil {
		t.Fatalf("expected anonymous rejected")
	}

	// 2. Join
	_, err := hub.Join("ws-1", "alice")
	if err != nil {
		t.Fatalf("failed alice join: %v", err)
	}

	bobClient, err := hub.Join("ws-1", "bob")
	if err != nil {
		t.Fatalf("failed bob join: %v", err)
	}

	// 3. Broadcast from Alice -> Bob should receive
	msg := CollaborationMessage{
		WorkspaceID: "ws-1",
		ActorID:     "alice",
		Kind:        "shape_update",
		Payload:     []byte(`{"shape":"rect"}`),
	}
	if err := hub.Broadcast(msg); err != nil {
		t.Fatalf("unexpected broadcast error: %v", err)
	}

	select {
	case received := <-bobClient.sendChan:
		if received.ActorID != "alice" || string(received.Payload) != `{"shape":"rect"}` {
			t.Fatalf("unexpected payload received by bob: %v", received)
		}
	default:
		t.Fatalf("expected bob to receive broadcast message")
	}

	// 4. Message size limit test
	largePayload := bytes.Repeat([]byte("A"), MaxMessageSizeBytes+10)
	err = hub.Broadcast(CollaborationMessage{
		WorkspaceID: "ws-1",
		ActorID:     "alice",
		Kind:        "shape_update",
		Payload:     largePayload,
	})
	if err == nil {
		t.Fatalf("expected large message rejected")
	}

	// 5. Leave cleanup
	hub.Leave("ws-1", "alice")
	hub.Leave("ws-1", "bob")
}
