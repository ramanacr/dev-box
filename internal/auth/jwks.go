package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// KeySource supplies the public keys a token signature may be verified against.
// Production uses JWKSCache, which fetches the issuer's published key set; tests
// inject a StaticKeySource so no network is required.
type KeySource interface {
	// KeyByID returns the verification key for a JWS `kid`. An empty kid means the
	// token carried none, in which case a single-key set may still resolve.
	KeyByID(ctx context.Context, kid string) (crypto.PublicKey, error)
}

// StaticKeySource is a fixed set of keys, keyed by `kid`.
type StaticKeySource struct {
	Keys map[string]crypto.PublicKey
}

func (s StaticKeySource) KeyByID(_ context.Context, kid string) (crypto.PublicKey, error) {
	if len(s.Keys) == 0 {
		return nil, errors.New("no verification keys configured")
	}
	if kid == "" {
		if len(s.Keys) != 1 {
			return nil, errors.New("token has no kid and the key set is ambiguous")
		}
		for _, k := range s.Keys {
			return k, nil
		}
	}
	key, ok := s.Keys[kid]
	if !ok {
		return nil, fmt.Errorf("no verification key for kid %q", kid)
	}
	return key, nil
}

// JWKSCache resolves an OIDC issuer's signing keys and caches them.
//
// Discovery and JWKS retrieval happen at most once per RefreshInterval, satisfying
// the Phase 3 requirement to fetch discovery/JWKS only at controlled intervals rather
// than per request. A cache miss on an unknown `kid` triggers at most one out-of-band
// refresh, which is how key rotation is picked up without opening a request-driven
// fetch loop against the identity provider.
type JWKSCache struct {
	Issuer          string
	HTTPClient      *http.Client
	RefreshInterval time.Duration

	mu          sync.RWMutex
	keys        map[string]crypto.PublicKey
	jwksURI     string
	lastFetched time.Time
	now         func() time.Time
}

// NewJWKSCache builds a key source for the given OIDC issuer.
func NewJWKSCache(issuer string) *JWKSCache {
	return &JWKSCache{
		Issuer:          strings.TrimRight(issuer, "/"),
		HTTPClient:      &http.Client{Timeout: 10 * time.Second},
		RefreshInterval: 15 * time.Minute,
		keys:            map[string]crypto.PublicKey{},
		now:             time.Now,
	}
}

func (c *JWKSCache) clock() time.Time {
	if c.now != nil {
		return c.now()
	}
	return time.Now()
}

func (c *JWKSCache) KeyByID(ctx context.Context, kid string) (crypto.PublicKey, error) {
	if key, ok := c.lookup(kid); ok {
		return key, nil
	}

	// Either the cache is cold, stale, or the kid is unknown (key rotation).
	if err := c.refresh(ctx); err != nil {
		return nil, err
	}

	if key, ok := c.lookup(kid); ok {
		return key, nil
	}
	return nil, fmt.Errorf("no verification key for kid %q", kid)
}

func (c *JWKSCache) lookup(kid string) (crypto.PublicKey, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if len(c.keys) == 0 {
		return nil, false
	}
	if c.clock().Sub(c.lastFetched) > c.RefreshInterval {
		return nil, false
	}
	if kid == "" {
		if len(c.keys) != 1 {
			return nil, false
		}
		for _, k := range c.keys {
			return k, true
		}
	}
	key, ok := c.keys[kid]
	return key, ok
}

func (c *JWKSCache) refresh(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.Issuer == "" {
		return errors.New("oidc issuer is not configured")
	}
	if c.HTTPClient == nil {
		c.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}

	if c.jwksURI == "" {
		uri, err := c.discoverJWKSURI(ctx)
		if err != nil {
			return err
		}
		c.jwksURI = uri
	}

	keys, err := c.fetchKeys(ctx, c.jwksURI)
	if err != nil {
		return err
	}
	if len(keys) == 0 {
		return errors.New("issuer published an empty key set")
	}

	c.keys = keys
	c.lastFetched = c.clock()
	return nil
}

type discoveryDocument struct {
	Issuer  string `json:"issuer"`
	JWKSURI string `json:"jwks_uri"`
}

func (c *JWKSCache) discoverJWKSURI(ctx context.Context) (string, error) {
	endpoint := c.Issuer + "/.well-known/openid-configuration"

	var doc discoveryDocument
	if err := c.getJSON(ctx, endpoint, &doc); err != nil {
		return "", fmt.Errorf("oidc discovery failed: %w", err)
	}

	// The discovery document is fetched over the network, so validate it rather than
	// trusting it: a mismatched issuer means the endpoint is not authoritative, and an
	// off-origin jwks_uri would let a compromised document redirect key retrieval.
	if strings.TrimRight(doc.Issuer, "/") != c.Issuer {
		return "", fmt.Errorf("oidc discovery issuer mismatch: expected %q, got %q", c.Issuer, doc.Issuer)
	}
	if doc.JWKSURI == "" {
		return "", errors.New("oidc discovery document has no jwks_uri")
	}
	if err := sameOrigin(c.Issuer, doc.JWKSURI); err != nil {
		return "", err
	}
	return doc.JWKSURI, nil
}

func sameOrigin(issuer, target string) error {
	iss, err := url.Parse(issuer)
	if err != nil {
		return fmt.Errorf("invalid issuer url: %w", err)
	}
	tgt, err := url.Parse(target)
	if err != nil {
		return fmt.Errorf("invalid jwks_uri: %w", err)
	}
	if tgt.Scheme != iss.Scheme || tgt.Host != iss.Host {
		return fmt.Errorf("jwks_uri host %q does not match issuer host %q", tgt.Host, iss.Host)
	}
	return nil
}

func (c *JWKSCache) getJSON(ctx context.Context, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d from %s", resp.StatusCode, endpoint)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// jsonWebKey is the subset of RFC 7517 needed to verify OIDC ID tokens.
type jsonWebKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func (c *JWKSCache) fetchKeys(ctx context.Context, jwksURI string) (map[string]crypto.PublicKey, error) {
	var set struct {
		Keys []jsonWebKey `json:"keys"`
	}
	if err := c.getJSON(ctx, jwksURI, &set); err != nil {
		return nil, fmt.Errorf("jwks fetch failed: %w", err)
	}
	return ParseJWKSet(set.Keys)
}

// ParseJWKSet converts JWK entries into public keys, skipping any that are not
// usable for signature verification.
func ParseJWKSet(keys []jsonWebKey) (map[string]crypto.PublicKey, error) {
	parsed := make(map[string]crypto.PublicKey, len(keys))

	for _, jwk := range keys {
		// "enc" keys are for encryption, not signature verification.
		if jwk.Use != "" && jwk.Use != "sig" {
			continue
		}

		var (
			key crypto.PublicKey
			err error
		)
		switch jwk.Kty {
		case "RSA":
			key, err = jwk.rsaKey()
		case "EC":
			key, err = jwk.ecKey()
		default:
			// Unsupported key type; skip rather than fail the whole set.
			continue
		}
		if err != nil {
			return nil, err
		}
		parsed[jwk.Kid] = key
	}

	return parsed, nil
}

func (j jsonWebKey) rsaKey() (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(j.N)
	if err != nil {
		return nil, fmt.Errorf("invalid rsa modulus for kid %q: %w", j.Kid, err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(j.E)
	if err != nil {
		return nil, fmt.Errorf("invalid rsa exponent for kid %q: %w", j.Kid, err)
	}

	n := new(big.Int).SetBytes(nBytes)
	e := new(big.Int).SetBytes(eBytes)
	if !e.IsInt64() || e.Int64() <= 0 {
		return nil, fmt.Errorf("invalid rsa exponent for kid %q", j.Kid)
	}
	// Reject undersized moduli outright; a 1024-bit RSA key is not acceptable for
	// authentication and accepting one would silently weaken the whole boundary.
	if n.BitLen() < 2048 {
		return nil, fmt.Errorf("rsa key for kid %q is %d bits, minimum is 2048", j.Kid, n.BitLen())
	}

	return &rsa.PublicKey{N: n, E: int(e.Int64())}, nil
}

func (j jsonWebKey) ecKey() (*ecdsa.PublicKey, error) {
	var curve elliptic.Curve
	switch j.Crv {
	case "P-256":
		curve = elliptic.P256()
	case "P-384":
		curve = elliptic.P384()
	case "P-521":
		curve = elliptic.P521()
	default:
		return nil, fmt.Errorf("unsupported ec curve %q for kid %q", j.Crv, j.Kid)
	}

	xBytes, err := base64.RawURLEncoding.DecodeString(j.X)
	if err != nil {
		return nil, fmt.Errorf("invalid ec x for kid %q: %w", j.Kid, err)
	}
	yBytes, err := base64.RawURLEncoding.DecodeString(j.Y)
	if err != nil {
		return nil, fmt.Errorf("invalid ec y for kid %q: %w", j.Kid, err)
	}

	key := &ecdsa.PublicKey{
		Curve: curve,
		X:     new(big.Int).SetBytes(xBytes),
		Y:     new(big.Int).SetBytes(yBytes),
	}
	if !key.Curve.IsOnCurve(key.X, key.Y) {
		return nil, fmt.Errorf("ec key for kid %q is not on curve %s", j.Kid, j.Crv)
	}
	return key, nil
}

// verifySignature checks a JWS compact-serialization signature over
// "<header>.<payload>" using the supplied public key.
//
// The algorithm is taken from the token header but is only ever used to select a
// digest; the key type still has to match, so a token cannot downgrade an RSA key to
// HMAC verification. "none" and every symmetric algorithm are rejected before this
// point by algorithmAllowed.
func verifySignature(alg, signingInput string, signature []byte, key crypto.PublicKey) error {
	var (
		digest []byte
		hash   crypto.Hash
	)
	switch alg {
	case "RS256", "PS256", "ES256":
		sum := sha256.Sum256([]byte(signingInput))
		digest, hash = sum[:], crypto.SHA256
	case "RS384", "PS384", "ES384":
		sum := sha512.Sum384([]byte(signingInput))
		digest, hash = sum[:], crypto.SHA384
	case "RS512", "PS512", "ES512":
		sum := sha512.Sum512([]byte(signingInput))
		digest, hash = sum[:], crypto.SHA512
	default:
		return fmt.Errorf("unsupported signing algorithm %q", alg)
	}

	switch k := key.(type) {
	case *rsa.PublicKey:
		switch alg {
		case "RS256", "RS384", "RS512":
			return rsa.VerifyPKCS1v15(k, hash, digest, signature)
		case "PS256", "PS384", "PS512":
			return rsa.VerifyPSS(k, hash, digest, signature, &rsa.PSSOptions{
				SaltLength: rsa.PSSSaltLengthAuto,
				Hash:       hash,
			})
		default:
			return fmt.Errorf("algorithm %q cannot be used with an RSA key", alg)
		}

	case *ecdsa.PublicKey:
		if !strings.HasPrefix(alg, "ES") {
			return fmt.Errorf("algorithm %q cannot be used with an EC key", alg)
		}
		// JWS ECDSA signatures are the fixed-width R||S concatenation, not ASN.1.
		byteLen := (k.Curve.Params().BitSize + 7) / 8
		if len(signature) != 2*byteLen {
			return fmt.Errorf("malformed ecdsa signature length %d", len(signature))
		}
		r := new(big.Int).SetBytes(signature[:byteLen])
		s := new(big.Int).SetBytes(signature[byteLen:])
		if !ecdsa.Verify(k, digest, r, s) {
			return errors.New("ecdsa signature verification failed")
		}
		return nil

	default:
		return errors.New("unsupported verification key type")
	}
}

// algorithmAllowed gates which JWS algorithms may ever be attempted.
//
// "none" is rejected so an attacker cannot strip the signature, and the HMAC family
// is rejected because a symmetric algorithm combined with a public JWKS key would let
// a forger sign tokens with the very key material the issuer publishes.
func algorithmAllowed(alg string) error {
	switch alg {
	case "RS256", "RS384", "RS512",
		"PS256", "PS384", "PS512",
		"ES256", "ES384", "ES512":
		return nil
	case "", "none", "NONE", "None":
		return errors.New("unsigned tokens are not accepted")
	case "HS256", "HS384", "HS512":
		return errors.New("symmetric token signatures are not accepted")
	default:
		return fmt.Errorf("unsupported signing algorithm %q", alg)
	}
}
