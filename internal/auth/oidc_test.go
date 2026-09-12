package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"testing"
	"time"
)

// testSigner holds a key pair and issues correctly signed tokens for tests.
type testSigner struct {
	kid string
	key *rsa.PrivateKey
}

func newTestSigner(t *testing.T) *testSigner {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	return &testSigner{kid: "test-key-1", key: key}
}

func (s *testSigner) keySource() KeySource {
	return StaticKeySource{Keys: map[string]crypto.PublicKey{s.kid: &s.key.PublicKey}}
}

// sign produces a valid RS256 compact JWS.
func (s *testSigner) sign(t *testing.T, claims TokenClaims) string {
	t.Helper()
	return s.signWithHeader(t, claims, map[string]string{"alg": "RS256", "typ": "JWT", "kid": s.kid})
}

func (s *testSigner) signWithHeader(t *testing.T, claims TokenClaims, header map[string]string) string {
	t.Helper()

	headerJSON, err := json.Marshal(header)
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	payloadJSON, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}

	signingInput := base64.RawURLEncoding.EncodeToString(headerJSON) + "." +
		base64.RawURLEncoding.EncodeToString(payloadJSON)

	digest := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, s.key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func validClaims() TokenClaims {
	return TokenClaims{
		Issuer:    "https://auth.example.com",
		Audience:  "my-client",
		Subject:   "usr_123",
		Email:     "user@example.com",
		Name:      "Alice Developer",
		Roles:     []string{"editor"},
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	}
}

func newValidator(s *testSigner) *TokenValidator {
	return NewTokenValidatorWithKeys("https://auth.example.com", "my-client", s.keySource())
}

func TestValidateIDTokenSuccess(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)

	principal, err := v.ValidateIDToken(context.Background(), signer.sign(t, validClaims()))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if principal.Subject != "usr_123" {
		t.Errorf("expected subject usr_123, got %s", principal.Subject)
	}
	if len(principal.Roles) != 1 || principal.Roles[0] != RoleEditor {
		t.Errorf("expected role editor, got %v", principal.Roles)
	}
	if principal.DisplayName != "Alice Developer" {
		t.Errorf("unexpected display name %q", principal.DisplayName)
	}
}

// TestValidateIDTokenRejectsUnsignedToken is the regression test for the
// authentication bypass this validator originally shipped with: an attacker could
// base64-encode any claim set, append a dummy signature segment, and be trusted.
func TestValidateIDTokenRejectsUnsignedToken(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)

	claims := validClaims()
	claims.Roles = []string{"admin"}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	forged := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`)) + "." +
		base64.RawURLEncoding.EncodeToString(payload) + ".sig"

	if _, err := v.ValidateIDToken(context.Background(), forged); err == nil {
		t.Fatal("an alg=none token must never authenticate")
	}
}

func TestValidateIDTokenRejectsTamperedPayload(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)

	token := signer.sign(t, validClaims())

	// Swap the payload for one granting admin, keeping the original signature.
	escalated := validClaims()
	escalated.Roles = []string{"admin"}
	payload, err := json.Marshal(escalated)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	parts := splitToken(t, token)
	tampered := parts[0] + "." + base64.RawURLEncoding.EncodeToString(payload) + "." + parts[2]

	if _, err := v.ValidateIDToken(context.Background(), tampered); err == nil {
		t.Fatal("a token whose payload was modified after signing must be rejected")
	}
}

func TestValidateIDTokenRejectsForeignKey(t *testing.T) {
	trusted := newTestSigner(t)
	attacker := newTestSigner(t)

	// The attacker signs with their own key but reuses the trusted key's id.
	attacker.kid = trusted.kid

	v := newValidator(trusted)
	if _, err := v.ValidateIDToken(context.Background(), attacker.sign(t, validClaims())); err == nil {
		t.Fatal("a token signed by an untrusted key must be rejected")
	}
}

func TestValidateIDTokenRejectsSymmetricAlgorithm(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)

	// HS256 must be refused outright: verifying it against a published public key
	// would let anyone holding the JWKS mint valid tokens.
	token := signer.signWithHeader(t, validClaims(), map[string]string{
		"alg": "HS256", "typ": "JWT", "kid": signer.kid,
	})
	if _, err := v.ValidateIDToken(context.Background(), token); err == nil {
		t.Fatal("HS256 tokens must be rejected")
	}
}

func TestValidateIDTokenRejectsUnknownKeyID(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)

	token := signer.signWithHeader(t, validClaims(), map[string]string{
		"alg": "RS256", "typ": "JWT", "kid": "rotated-away",
	})
	if _, err := v.ValidateIDToken(context.Background(), token); err == nil {
		t.Fatal("a token referencing an unknown kid must be rejected")
	}
}

func TestValidateIDTokenRejectsWithoutKeySource(t *testing.T) {
	signer := newTestSigner(t)

	// A validator with no keys must fail closed rather than decode claims blindly.
	v := &TokenValidator{ExpectedIssuer: "https://auth.example.com", ExpectedAudience: "my-client"}
	if _, err := v.ValidateIDToken(context.Background(), signer.sign(t, validClaims())); err == nil {
		t.Fatal("validation without a key source must fail")
	}
}

func TestValidateIDTokenRejections(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)
	ctx := context.Background()

	t.Run("expired", func(t *testing.T) {
		claims := validClaims()
		claims.ExpiresAt = time.Now().Add(-2 * time.Hour).Unix()
		if _, err := v.ValidateIDToken(ctx, signer.sign(t, claims)); err == nil {
			t.Error("expected error for expired token")
		}
	})

	t.Run("missing exp", func(t *testing.T) {
		claims := validClaims()
		claims.ExpiresAt = 0
		if _, err := v.ValidateIDToken(ctx, signer.sign(t, claims)); err == nil {
			t.Error("expected error for token without exp")
		}
	})

	t.Run("not yet valid", func(t *testing.T) {
		claims := validClaims()
		claims.NotBefore = time.Now().Add(2 * time.Hour).Unix()
		if _, err := v.ValidateIDToken(ctx, signer.sign(t, claims)); err == nil {
			t.Error("expected error for nbf in the future")
		}
	})

	t.Run("wrong issuer", func(t *testing.T) {
		claims := validClaims()
		claims.Issuer = "https://wrong.example.com"
		if _, err := v.ValidateIDToken(ctx, signer.sign(t, claims)); err == nil {
			t.Error("expected error for wrong issuer")
		}
	})

	t.Run("wrong audience", func(t *testing.T) {
		claims := validClaims()
		claims.Audience = "someone-else"
		if _, err := v.ValidateIDToken(ctx, signer.sign(t, claims)); err == nil {
			t.Error("expected error for wrong audience")
		}
	})

	t.Run("missing subject", func(t *testing.T) {
		claims := validClaims()
		claims.Subject = ""
		if _, err := v.ValidateIDToken(ctx, signer.sign(t, claims)); err == nil {
			t.Error("expected error for missing subject")
		}
	})

	t.Run("malformed", func(t *testing.T) {
		if _, err := v.ValidateIDToken(ctx, "not-a-jwt"); err == nil {
			t.Error("expected error for malformed token")
		}
	})
}

func TestAudienceArrayIsAccepted(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)

	claims := validClaims()
	claims.Audience = []string{"other-client", "my-client"}

	if _, err := v.ValidateIDToken(context.Background(), signer.sign(t, claims)); err != nil {
		t.Fatalf("expected audience array to match, got %v", err)
	}
}

func TestRoleMappingIgnoresUnlistedClaims(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)
	// Only the "roles" claim is allowlisted, so group-derived admin must be ignored.
	v.RoleClaimNames = []string{"roles"}

	claims := validClaims()
	claims.Roles = []string{"viewer"}
	claims.Groups = []string{"admin"}

	principal, err := v.ValidateIDToken(context.Background(), signer.sign(t, claims))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, r := range principal.Roles {
		if r == RoleAdmin {
			t.Fatal("admin must not be granted from a claim outside the allowlist")
		}
	}
}

func TestRoleMappingDefaultsToViewer(t *testing.T) {
	signer := newTestSigner(t)
	v := newValidator(signer)

	claims := validClaims()
	claims.Roles = []string{"superuser", "root"} // unrecognised values
	claims.Groups = nil

	principal, err := v.ValidateIDToken(context.Background(), signer.sign(t, claims))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(principal.Roles) != 1 || principal.Roles[0] != RoleViewer {
		t.Errorf("expected fallback to viewer, got %v", principal.Roles)
	}
}

func TestParseJWKSetRejectsWeakRSAKey(t *testing.T) {
	weak, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	jwk := jsonWebKey{
		Kty: "RSA",
		Kid: "weak",
		Use: "sig",
		N:   base64.RawURLEncoding.EncodeToString(weak.N.Bytes()),
		E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(weak.E)).Bytes()),
	}
	if _, err := ParseJWKSet([]jsonWebKey{jwk}); err == nil {
		t.Fatal("a 1024-bit RSA signing key must be rejected")
	}
}

func TestParseJWKSetParsesECKey(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	jwk := jsonWebKey{
		Kty: "EC",
		Kid: "ec-1",
		Use: "sig",
		Crv: "P-256",
		X:   base64.RawURLEncoding.EncodeToString(key.X.Bytes()),
		Y:   base64.RawURLEncoding.EncodeToString(key.Y.Bytes()),
	}

	keys, err := ParseJWKSet([]jsonWebKey{jwk})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := keys["ec-1"].(*ecdsa.PublicKey); !ok {
		t.Fatal("expected an ecdsa public key")
	}
}

func TestParseJWKSetSkipsEncryptionKeys(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	jwk := jsonWebKey{
		Kty: "RSA",
		Kid: "enc-1",
		Use: "enc",
		N:   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
		E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
	}

	keys, err := ParseJWKSet([]jsonWebKey{jwk})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 0 {
		t.Errorf("encryption keys must not be used for verification, got %d keys", len(keys))
	}
}

func splitToken(t *testing.T, token string) [3]string {
	t.Helper()
	var out [3]string
	start := 0
	idx := 0
	for i := 0; i < len(token) && idx < 3; i++ {
		if token[i] == '.' {
			out[idx] = token[start:i]
			idx++
			start = i + 1
		}
	}
	if idx != 2 {
		t.Fatalf("expected a 3-segment token, got %q", token)
	}
	out[2] = token[start:]
	return out
}
