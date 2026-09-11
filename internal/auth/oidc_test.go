package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func makeTestToken(claims TokenClaims) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payloadBytes, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	return header + "." + payload + ".sig"
}

func TestValidateIDTokenSuccess(t *testing.T) {
	v := NewTokenValidator("https://auth.example.com", "my-client")

	tok := makeTestToken(TokenClaims{
		Issuer:    "https://auth.example.com",
		Audience:  "my-client",
		Subject:   "usr_123",
		Email:     "user@example.com",
		Name:      "Alice Developer",
		Roles:     []string{"editor"},
		ExpiresAt: time.Now().Add(1 * time.Hour).Unix(),
	})

	principal, err := v.ValidateIDToken(context.Background(), tok)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if principal.Subject != "usr_123" {
		t.Errorf("expected subject usr_123, got %s", principal.Subject)
	}
	if len(principal.Roles) != 1 || principal.Roles[0] != RoleEditor {
		t.Errorf("expected role editor, got %v", principal.Roles)
	}
}

func TestValidateIDTokenRejections(t *testing.T) {
	v := NewTokenValidator("https://auth.example.com", "my-client")

	// Expired token
	tokExpired := makeTestToken(TokenClaims{
		Issuer:    "https://auth.example.com",
		Audience:  "my-client",
		Subject:   "usr_123",
		ExpiresAt: time.Now().Add(-1 * time.Hour).Unix(),
	})
	if _, err := v.ValidateIDToken(context.Background(), tokExpired); err == nil {
		t.Error("expected error for expired token")
	}

	// Wrong issuer
	tokWrongIssuer := makeTestToken(TokenClaims{
		Issuer:    "https://wrong.example.com",
		Audience:  "my-client",
		Subject:   "usr_123",
		ExpiresAt: time.Now().Add(1 * time.Hour).Unix(),
	})
	if _, err := v.ValidateIDToken(context.Background(), tokWrongIssuer); err == nil {
		t.Error("expected error for wrong issuer")
	}

	// Missing subject
	tokNoSub := makeTestToken(TokenClaims{
		Issuer:    "https://auth.example.com",
		Audience:  "my-client",
		ExpiresAt: time.Now().Add(1 * time.Hour).Unix(),
	})
	if _, err := v.ValidateIDToken(context.Background(), tokNoSub); err == nil {
		t.Error("expected error for missing subject")
	}
}
