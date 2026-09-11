package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Role string

const (
	RoleViewer Role = "viewer"
	RoleEditor Role = "editor"
	RoleAdmin  Role = "admin"
)

type Principal struct {
	Subject     string   `json:"sub"`
	Email       string   `json:"email"`
	DisplayName string   `json:"name"`
	Roles       []Role   `json:"roles"`
}

type TokenClaims struct {
	Issuer    string   `json:"iss"`
	Audience  any      `json:"aud"` // Can be string or []string
	Subject   string   `json:"sub"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	Roles     []string `json:"roles,omitempty"`
	Groups    []string `json:"groups,omitempty"`
	ExpiresAt int64    `json:"exp"`
}

type TokenValidator struct {
	ExpectedIssuer   string
	ExpectedAudience string
}

func NewTokenValidator(issuer, audience string) *TokenValidator {
	return &TokenValidator{
		ExpectedIssuer:   issuer,
		ExpectedAudience: audience,
	}
}

func (v *TokenValidator) ValidateIDToken(ctx context.Context, rawToken string) (Principal, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 {
		return Principal{}, errors.New("invalid jwt format: must contain 3 segments")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Principal{}, fmt.Errorf("failed to decode jwt payload: %w", err)
	}

	var claims TokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return Principal{}, fmt.Errorf("failed to unmarshal token claims: %w", err)
	}

	if claims.Subject == "" {
		return Principal{}, errors.New("token missing required subject claim")
	}

	if v.ExpectedIssuer != "" && claims.Issuer != v.ExpectedIssuer {
		return Principal{}, fmt.Errorf("token issuer mismatch: expected %q, got %q", v.ExpectedIssuer, claims.Issuer)
	}

	// Audience check
	if v.ExpectedAudience != "" {
		match := false
		switch aud := claims.Audience.(type) {
		case string:
			match = aud == v.ExpectedAudience
		case []any:
			for _, item := range aud {
				if s, ok := item.(string); ok && s == v.ExpectedAudience {
					match = true
					break
				}
			}
		case []string:
			for _, s := range aud {
				if s == v.ExpectedAudience {
					match = true
					break
				}
			}
		}
		if !match {
			return Principal{}, fmt.Errorf("token audience mismatch: expected %q", v.ExpectedAudience)
		}
	}

	// Expiry check
	if claims.ExpiresAt > 0 {
		expTime := time.Unix(claims.ExpiresAt, 0)
		if time.Now().After(expTime) {
			return Principal{}, errors.New("token has expired")
		}
	}

	// Role mapping
	roles := make([]Role, 0)
	rawRoles := append(claims.Roles, claims.Groups...)
	hasExplicitRole := false
	for _, r := range rawRoles {
		lower := strings.ToLower(r)
		switch lower {
		case "admin":
			roles = append(roles, RoleAdmin)
			hasExplicitRole = true
		case "editor":
			roles = append(roles, RoleEditor)
			hasExplicitRole = true
		case "viewer":
			roles = append(roles, RoleViewer)
			hasExplicitRole = true
		}
	}
	if !hasExplicitRole {
		roles = append(roles, RoleViewer) // Default role is viewer
	}

	displayName := claims.Name
	if displayName == "" {
		displayName = claims.Email
	}
	if displayName == "" {
		displayName = claims.Subject
	}

	return Principal{
		Subject:     claims.Subject,
		Email:       claims.Email,
		DisplayName: displayName,
		Roles:       roles,
	}, nil
}
