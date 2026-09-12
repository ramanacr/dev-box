package collab

import (
	"bytes"
	"context"
	"errors"
	"sync"
	"testing"

	"developer-toolbox/internal/auth"
)

// allowAll admits any principal to any workspace.
func allowAll() Authorizer {
	return AuthorizerFunc(func(context.Context, auth.Principal, string) error { return nil })
}

// membersOnly admits a principal only to the workspaces listed for its subject.
func membersOnly(membership map[string][]string) Authorizer {
	return AuthorizerFunc(func(_ context.Context, p auth.Principal, workspaceID string) error {
		for _, ws := range membership[p.Subject] {
			if ws == workspaceID {
				return nil
			}
		}
		return errors.New("not a member")
	})
}

func TestCollabHubJoinLeaveAndBroadcast(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())
	ctx := context.Background()

	pAlice := auth.Principal{Subject: "alice"}
	if err := hub.AuthorizeRoom(ctx, pAlice, "ws-1"); err != nil {
		t.Fatalf("expected alice authorized: %v", err)
	}
	if err := hub.AuthorizeRoom(ctx, auth.Principal{}, "ws-1"); err == nil {
		t.Fatal("expected anonymous rejected")
	}
	if err := hub.AuthorizeRoom(ctx, pAlice, ""); err == nil {
		t.Fatal("expected empty workspace id rejected")
	}

	if _, err := hub.Join("ws-1", "alice"); err != nil {
		t.Fatalf("failed alice join: %v", err)
	}
	bobClient, err := hub.Join("ws-1", "bob")
	if err != nil {
		t.Fatalf("failed bob join: %v", err)
	}
	if got := hub.RoomSize("ws-1"); got != 2 {
		t.Fatalf("expected 2 clients in room, got %d", got)
	}

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
	case received := <-bobClient.Receive():
		if received.ActorID != "alice" || string(received.Payload) != `{"shape":"rect"}` {
			t.Fatalf("unexpected payload received by bob: %v", received)
		}
	default:
		t.Fatal("expected bob to receive broadcast message")
	}

	hub.Leave("ws-1", "alice")
	hub.Leave("ws-1", "bob")
	if got := hub.RoomSize("ws-1"); got != 0 {
		t.Errorf("expected room emptied, got %d", got)
	}
}

// TestUnauthorizedConnectionRejected is the regression test for AuthorizeRoom having
// checked only that the principal was non-empty: any authenticated user could join
// any workspace room and observe another team's traffic.
func TestUnauthorizedConnectionRejected(t *testing.T) {
	hub := NewHubWithAuthorizer(membersOnly(map[string][]string{
		"alice": {"ws-1"},
	}))
	ctx := context.Background()

	if err := hub.AuthorizeRoom(ctx, auth.Principal{Subject: "alice"}, "ws-1"); err != nil {
		t.Fatalf("expected member authorized: %v", err)
	}
	if err := hub.AuthorizeRoom(ctx, auth.Principal{Subject: "alice"}, "ws-2"); err == nil {
		t.Fatal("a member of ws-1 must not be admitted to ws-2")
	}
	if err := hub.AuthorizeRoom(ctx, auth.Principal{Subject: "mallory"}, "ws-1"); err == nil {
		t.Fatal("a non-member must not be admitted")
	}
}

// TestHubWithoutAuthorizerFailsClosed proves the boundary denies rather than admits
// when no membership check has been supplied.
func TestHubWithoutAuthorizerFailsClosed(t *testing.T) {
	hub := NewHub()
	if err := hub.AuthorizeRoom(context.Background(), auth.Principal{Subject: "alice"}, "ws-1"); err == nil {
		t.Fatal("a hub with no authorizer must reject every join")
	}
}

func TestCrossWorkspaceMessageRejected(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())

	aliceIn1, err := hub.Join("ws-1", "alice")
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	bobIn2, err := hub.Join("ws-2", "bob")
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	_ = aliceIn1

	// Alice is not a member of ws-2, so naming it must be refused outright rather
	// than relayed to that room's members.
	err = hub.Broadcast(CollaborationMessage{
		WorkspaceID: "ws-2",
		ActorID:     "alice",
		Kind:        "shape_update",
		Payload:     []byte(`{"shape":"leak"}`),
	})
	if !errors.Is(err, ErrNotAuthorized) {
		t.Fatalf("expected ErrNotAuthorized, got %v", err)
	}

	select {
	case got := <-bobIn2.Receive():
		t.Fatalf("bob must not receive a cross-workspace message, got %v", got)
	default:
	}
}

func TestMessageSizeLimitEnforced(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())
	if _, err := hub.Join("ws-1", "alice"); err != nil {
		t.Fatalf("join: %v", err)
	}

	err := hub.Broadcast(CollaborationMessage{
		WorkspaceID: "ws-1",
		ActorID:     "alice",
		Kind:        "shape_update",
		Payload:     bytes.Repeat([]byte("A"), MaxMessageSizeBytes+10),
	})
	if !errors.Is(err, ErrMessageTooLarge) {
		t.Fatalf("expected ErrMessageTooLarge, got %v", err)
	}

	// Exactly at the cap must still be accepted.
	if err := hub.Broadcast(CollaborationMessage{
		WorkspaceID: "ws-1",
		ActorID:     "alice",
		Kind:        "shape_update",
		Payload:     bytes.Repeat([]byte("A"), MaxMessageSizeBytes),
	}); err != nil {
		t.Fatalf("a payload at the cap must be accepted, got %v", err)
	}
}

func TestRateLimitEnforced(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())
	if _, err := hub.Join("ws-1", "alice"); err != nil {
		t.Fatalf("join: %v", err)
	}

	msg := CollaborationMessage{
		WorkspaceID: "ws-1",
		ActorID:     "alice",
		Kind:        "cursor",
		Payload:     []byte(`{}`),
	}

	for i := 0; i < MaxMessagesPerSecond; i++ {
		if err := hub.Broadcast(msg); err != nil {
			t.Fatalf("message %d should be accepted, got %v", i+1, err)
		}
	}
	if err := hub.Broadcast(msg); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected ErrRateLimited after %d messages, got %v", MaxMessagesPerSecond, err)
	}
}

func TestDisconnectCleanup(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())

	client, err := hub.Join("ws-1", "alice")
	if err != nil {
		t.Fatalf("join: %v", err)
	}

	hub.Leave("ws-1", "alice")

	// Done must be closed so the transport's loops terminate.
	select {
	case <-client.Done():
	default:
		t.Fatal("expected the client's done channel to be closed on leave")
	}

	// Leaving twice must not panic.
	hub.Leave("ws-1", "alice")
	hub.Leave("ws-unknown", "nobody")
}

// TestRejoinRetiresPreviousConnection covers the reconnect case: the earlier client
// record used to be overwritten silently, leaking its reader goroutine.
func TestRejoinRetiresPreviousConnection(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())

	first, err := hub.Join("ws-1", "alice")
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	second, err := hub.Join("ws-1", "alice")
	if err != nil {
		t.Fatalf("rejoin: %v", err)
	}

	select {
	case <-first.Done():
	default:
		t.Fatal("the superseded connection must be signalled to shut down")
	}
	select {
	case <-second.Done():
		t.Fatal("the new connection must remain open")
	default:
	}
	if got := hub.RoomSize("ws-1"); got != 1 {
		t.Errorf("expected 1 client after rejoin, got %d", got)
	}
}

// TestConcurrentBroadcastAndLeave exercises the paths that previously raced: the rate
// limit counters were mutated under a read lock, and Leave closed the send channel
// while Broadcast could still be sending on it.
func TestConcurrentBroadcastAndLeave(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())

	const actors = 8
	for i := 0; i < actors; i++ {
		if _, err := hub.Join("ws-1", string(rune('a'+i))); err != nil {
			t.Fatalf("join: %v", err)
		}
	}

	var wg sync.WaitGroup
	for i := 0; i < actors; i++ {
		actor := string(rune('a' + i))

		wg.Add(1)
		go func() {
			defer wg.Done()
			for n := 0; n < 50; n++ {
				_ = hub.Broadcast(CollaborationMessage{
					WorkspaceID: "ws-1",
					ActorID:     actor,
					Kind:        "cursor",
					Payload:     []byte(`{}`),
				})
			}
		}()

		wg.Add(1)
		go func() {
			defer wg.Done()
			hub.Leave("ws-1", actor)
		}()
	}
	wg.Wait()
}

func TestBroadcastToUnknownRoomIsNoop(t *testing.T) {
	hub := NewHubWithAuthorizer(allowAll())
	if err := hub.Broadcast(CollaborationMessage{
		WorkspaceID: "ws-missing",
		ActorID:     "alice",
		Payload:     []byte(`{}`),
	}); err != nil {
		t.Fatalf("broadcasting into an empty room should be a no-op, got %v", err)
	}
}
