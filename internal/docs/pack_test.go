package docs

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidatePack_ValidPack(t *testing.T) {
	manifest, err := ValidatePack("../../packs/core")
	if err != nil {
		t.Fatalf("expected valid pack, got error: %v", err)
	}
	if manifest.ID != "core" {
		t.Errorf("expected id 'core', got %q", manifest.ID)
	}
	if len(manifest.Sources) != 4 {
		t.Errorf("expected 4 sources, got %d", len(manifest.Sources))
	}
}

func TestValidatePack_MissingManifest(t *testing.T) {
	tmpDir := t.TempDir()
	_, err := ValidatePack(tmpDir)
	if err == nil {
		t.Fatal("expected error for missing manifest, got nil")
	}
}

func TestValidatePack_MalformedSha256(t *testing.T) {
	tmpDir := t.TempDir()
	manifestJSON := `{"id":"test","version":"0.1.0","database":"docs.db","sha256":"invalid","sources":[{"name":"s","url":"u","license":"l","attribution":"a"}]}`
	_ = os.WriteFile(filepath.Join(tmpDir, "manifest.json"), []byte(manifestJSON), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "docs.db"), []byte("sample"), 0644)

	_, err := ValidatePack(tmpDir)
	if err == nil {
		t.Fatal("expected error for malformed sha256, got nil")
	}
}

func TestValidatePack_ChecksumMismatch(t *testing.T) {
	tmpDir := t.TempDir()
	manifestJSON := `{"id":"test","version":"0.1.0","database":"docs.db","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","sources":[{"name":"s","url":"u","license":"l","attribution":"a"}]}`
	_ = os.WriteFile(filepath.Join(tmpDir, "manifest.json"), []byte(manifestJSON), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "docs.db"), []byte("different content"), 0644)

	_, err := ValidatePack(tmpDir)
	if err == nil {
		t.Fatal("expected error for checksum mismatch, got nil")
	}
}

func TestValidatePack_MissingSourceAttribution(t *testing.T) {
	tmpDir := t.TempDir()
	manifestJSON := `{"id":"test","version":"0.1.0","database":"docs.db","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","sources":[{"name":"","url":"u","license":"","attribution":""}]}`
	_ = os.WriteFile(filepath.Join(tmpDir, "manifest.json"), []byte(manifestJSON), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "docs.db"), []byte("sample"), 0644)

	_, err := ValidatePack(tmpDir)
	if err == nil {
		t.Fatal("expected error for missing attribution, got nil")
	}
}
