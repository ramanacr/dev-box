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
	Subject     string `json:"sub"`
	Email       string `json:"email"`
	DisplayName string `json:"name"`
	Roles       []Role `json:"roles"`
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
	NotBefore int64    `json:"nbf"`
}

// jwsHeader is the protected header of a compact-serialization JWS.
type jwsHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
	Type      string `json:"typ"`
}

// DefaultRoleClaimNames are the claims consulted for role mapping when a validator
// does not configure its own allowlist.
var DefaultRoleClaimNames = []string{"roles", "groups"}

// TokenValidator validates OIDC ID tokens.
//
// Validation covers the signature, issuer, audience, expiry, not-before, and subject.
// The signature check is not optional: a validator with no key source rejects every
// token rather than falling back to decoding unverified claims.
type TokenValidator struct {
	ExpectedIssuer   string
	ExpectedAudience string

	// Keys supplies the public keys used to verify signatures. Constructed by
	// NewTokenValidator from the issuer's published JWKS.
	Keys KeySource

	// RoleClaimNames restricts which claims may contribute roles. Phase 3 requires
	// group claims to be mapped only through configured allowlisted claim names.
	RoleClaimNames []string

	// Leeway absorbs small clock differences between this service and the issuer.
	Leeway time.Duration

	now func() time.Time
}

// NewTokenValidator builds a validator that resolves signing keys from the issuer's
// OIDC discovery document and JWKS endpoint.
func NewTokenValidator(issuer, audience string) *TokenValidator {
	v := &TokenValidator{
		ExpectedIssuer:   issuer,
		ExpectedAudience: audience,
		RoleClaimNames:   DefaultRoleClaimNames,
		Leeway:           60 * time.Second,
		now:              time.Now,
	}
	if issuer != "" {
		v.Keys = NewJWKSCache(issuer)
	}
	return v
}

// NewTokenValidatorWithKeys builds a validator against an explicit key source. Used
// by tests and by deployments that pin keys out of band.
func NewTokenValidatorWithKeys(issuer, audience string, keys KeySource) *TokenValidator {
	return &TokenValidator{
		ExpectedIssuer:   issuer,
		ExpectedAudience: audience,
		Keys:             keys,
		RoleClaimNames:   DefaultRoleClaimNames,
		Leeway:           60 * time.Second,
		now:              time.Now,
	}
}

func (v *TokenValidator) clock() time.Time {
	if v.now != nil {
		return v.now()
	}
	return time.Now()
}

// ValidateIDToken verifies a raw compact JWS and returns the authenticated principal.
//
// Error text is intentionally generic about cryptographic failures so that a caller
// cannot use the message as an oracle, while still distinguishing configuration
// problems from rejected tokens in the service log.
func (v *TokenValidator) ValidateIDToken(ctx context.Context, rawToken string) (Principal, error) {
	rawToken = strings.TrimSpace(rawToken)

	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 {
		return Principal{}, errors.New("invalid jwt format: must contain 3 segments")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Principal{}, fmt.Errorf("failed to decode jwt header: %w", err)
	}
	var header jwsHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return Principal{}, fmt.Errorf("failed to unmarshal jwt header: %w", err)
	}

	// Reject unsigned and symmetric algorithms before touching any key material.
	if err := algorithmAllowed(header.Algorithm); err != nil {
		return Principal{}, err
	}
	if header.Type != "" && !strings.EqualFold(header.Type, "JWT") {
		return Principal{}, fmt.Errorf("unsupported token type %q", header.Type)
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return Principal{}, fmt.Errorf("failed to decode jwt signature: %w", err)
	}
	if len(signature) == 0 {
		return Principal{}, errors.New("token carries no signature")
	}

	// Verify the signature before any claim is trusted.
	if v.Keys == nil {
		return Principal{}, errors.New("token validation is not configured with a key source")
	}
	key, err := v.Keys.KeyByID(ctx, header.KeyID)
	if err != nil {
		return Principal{}, fmt.Errorf("cannot resolve signing key: %w", err)
	}
	signingInput := parts[0] + "." + parts[1]
	if err := verifySignature(header.Algorithm, signingInput, signature, key); err != nil {
		return Principal{}, errors.New("token signature verification failed")
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

	if v.ExpectedAudience != "" && !audienceMatches(claims.Audience, v.ExpectedAudience) {
		return Principal{}, fmt.Errorf("token audience mismatch: expected %q", v.ExpectedAudience)
	}

	now := v.clock()

	// An ID token without an expiry can never be revoked by time, so require one.
	if claims.ExpiresAt <= 0 {
		return Principal{}, errors.New("token missing required exp claim")
	}
	if now.Add(-v.Leeway).After(time.Unix(claims.ExpiresAt, 0)) {
		return Principal{}, errors.New("token has expired")
	}
	if claims.NotBefore > 0 && now.Add(v.Leeway).Before(time.Unix(claims.NotBefore, 0)) {
		return Principal{}, errors.New("token is not yet valid")
	}

	return Principal{
		Subject:     claims.Subject,
		Email:       claims.Email,
		DisplayName: displayNameFor(claims),
		Roles:       v.mapRoles(claims),
	}, nil
}

func audienceMatches(aud any, expected string) bool {
	switch v := aud.(type) {
	case string:
		return v == expected
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && s == expected {
				return true
			}
		}
	case []string:
		for _, s := range v {
			if s == expected {
				return true
			}
		}
	}
	return false
}

// mapRoles derives roles from the allowlisted claims only. Any value that is not one
// of the three known roles is discarded, and a principal with no recognised role
// falls back to viewer — the least privileged option.
func (v *TokenValidator) mapRoles(claims TokenClaims) []Role {
	allowed := v.RoleClaimNames
	if len(allowed) == 0 {
		allowed = DefaultRoleClaimNames
	}

	var raw []string
	for _, name := range allowed {
		switch name {
		case "roles":
			raw = append(raw, claims.Roles...)
		case "groups":
			raw = append(raw, claims.Groups...)
		}
	}

	roles := make([]Role, 0, len(raw))
	seen := map[Role]bool{}
	for _, r := range raw {
		var role Role
		switch strings.ToLower(strings.TrimSpace(r)) {
		case "admin":
			role = RoleAdmin
		case "editor":
			role = RoleEditor
		case "viewer":
			role = RoleViewer
		default:
			continue
		}
		if !seen[role] {
			seen[role] = true
			roles = append(roles, role)
		}
	}

	if len(roles) == 0 {
		roles = append(roles, RoleViewer)
	}
	return roles
}

func displayNameFor(claims TokenClaims) string {
	if claims.Name != "" {
		return claims.Name
	}
	if claims.Email != "" {
		return claims.Email
	}
	return claims.Subject
}
