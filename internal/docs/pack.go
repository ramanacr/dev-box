package docs

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
)

var hexSha256Regex = regexp.MustCompile(`^[a-f0-9]{64}$`)

// ValidatePack checks manifest structure, source attributions, and checksum against the database file.
func ValidatePack(packDir string) (*PackManifest, error) {
	manifestPath := filepath.Join(packDir, "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("missing or unreadable pack manifest: %w", err)
	}

	var manifest PackManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("invalid manifest JSON: %w", err)
	}

	if manifest.ID == "" {
		return nil, errors.New("pack manifest missing id")
	}
	if manifest.Version == "" {
		return nil, errors.New("pack manifest missing version")
	}
	if manifest.Database == "" {
		return nil, errors.New("pack manifest missing database path")
	}
	if !hexSha256Regex.MatchString(manifest.SHA256) {
		return nil, fmt.Errorf("pack manifest has invalid sha256 checksum %q: must be 64 lowercase hex characters", manifest.SHA256)
	}
	if len(manifest.Sources) == 0 {
		return nil, errors.New("pack manifest must define at least one source")
	}

	for i, src := range manifest.Sources {
		if src.Name == "" || src.License == "" || src.Attribution == "" {
			return nil, fmt.Errorf("pack source [%d] missing required name, license, or attribution", i)
		}
	}

	// Verify database file exists and checksum matches
	dbPath := filepath.Join(packDir, manifest.Database)
	f, err := os.Open(dbPath)
	if err != nil {
		return nil, fmt.Errorf("cannot open pack database %q: %w", dbPath, err)
	}
	defer f.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return nil, fmt.Errorf("error reading pack database for checksum: %w", err)
	}

	calculatedHex := hex.EncodeToString(hasher.Sum(nil))
	if calculatedHex != manifest.SHA256 {
		return nil, fmt.Errorf("pack database checksum mismatch: expected %s, calculated %s", manifest.SHA256, calculatedHex)
	}

	return &manifest, nil
}
