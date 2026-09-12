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
	"runtime"
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

	// Kind defaults to a content pack so existing manifests keep validating.
	kind := manifest.Kind
	if kind == "" {
		kind = PackKindContent
	}
	if kind != PackKindContent && kind != PackKindModule {
		return nil, fmt.Errorf("pack manifest has unknown kind %q", manifest.Kind)
	}

	// Licensing provenance is required for every pack regardless of kind: the white
	// paper treats content rights as a product requirement, and a learning pack ships
	// tutorial content just as a docs pack ships documentation.
	if len(manifest.Sources) == 0 {
		return nil, errors.New("pack manifest must define at least one source")
	}
	for i, src := range manifest.Sources {
		if src.Name == "" || src.License == "" || src.Attribution == "" {
			return nil, fmt.Errorf("pack source [%d] missing required name, license, or attribution", i)
		}
	}

	// A module pack carries browser modules rather than a documentation database, so
	// there is nothing to checksum. Requiring a database here is what made
	// packs/learning unvalidatable.
	if kind == PackKindModule {
		if manifest.Database != "" {
			return nil, errors.New("module pack must not declare a database")
		}
		if len(manifest.Modules) == 0 {
			return nil, errors.New("module pack must list at least one module")
		}
		manifest.Kind = kind
		return &manifest, nil
	}

	if manifest.Database == "" {
		return nil, errors.New("pack manifest missing database path")
	}
	if !hexSha256Regex.MatchString(manifest.SHA256) {
		return nil, fmt.Errorf("pack manifest has invalid sha256 checksum %q: must be 64 lowercase hex characters", manifest.SHA256)
	}

	// Verify database file exists and checksum matches
	dbPath := filepath.Join(packDir, manifest.Database)
	info, err := os.Stat(dbPath)
	if err != nil {
		return nil, fmt.Errorf("cannot open pack database %q: %w", dbPath, err)
	}

	// Content packs are immutable artifacts. A group- or world-writable database
	// could be modified after its checksum was verified, so the mode is rejected
	// rather than trusted. Windows does not model these bits, so the check only
	// applies where the platform reports them.
	if runtime.GOOS != "windows" {
		if mode := info.Mode().Perm(); mode&0o022 != 0 {
			return nil, fmt.Errorf("pack database %q is writable (mode %04o); content packs must be read-only", dbPath, mode)
		}
	}

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

	manifest.Kind = kind
	return &manifest, nil
}
