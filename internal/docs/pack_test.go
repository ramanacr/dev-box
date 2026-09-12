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

// TestValidatePackAcceptsModulePack covers the learning pack, which ships browser
// modules rather than a documentation database. Its manifest previously carried none
// of the required fields and would have been rejected outright.
func TestValidatePackAcceptsModulePack(t *testing.T) {
	dir := t.TempDir()
	manifest := `{
	  "id": "learning",
	  "version": "1.0.0",
	  "kind": "module",
	  "modules": ["git-graph-sandbox", "algorithm-visualizer"],
	  "sources": [
	    {"name": "Toolbox Git Simulation", "url": "local://learning/git", "license": "MIT", "attribution": "Authored for Developer Toolbox."}
	  ]
	}`
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	got, err := ValidatePack(dir)
	if err != nil {
		t.Fatalf("expected a module pack to validate, got %v", err)
	}
	if got.Kind != PackKindModule {
		t.Errorf("expected kind %q, got %q", PackKindModule, got.Kind)
	}
	if len(got.Modules) != 2 {
		t.Errorf("expected 2 modules, got %d", len(got.Modules))
	}
}

func TestValidatePackRejectsModulePackWithDatabase(t *testing.T) {
	dir := t.TempDir()
	manifest := `{
	  "id": "learning",
	  "version": "1.0.0",
	  "kind": "module",
	  "database": "docs.db",
	  "modules": ["git-graph-sandbox"],
	  "sources": [{"name": "x", "url": "local://x", "license": "MIT", "attribution": "y"}]
	}`
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	if _, err := ValidatePack(dir); err == nil {
		t.Fatal("a module pack declaring a database must be rejected")
	}
}

func TestValidatePackRejectsModulePackWithoutModules(t *testing.T) {
	dir := t.TempDir()
	manifest := `{
	  "id": "learning",
	  "version": "1.0.0",
	  "kind": "module",
	  "sources": [{"name": "x", "url": "local://x", "license": "MIT", "attribution": "y"}]
	}`
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	if _, err := ValidatePack(dir); err == nil {
		t.Fatal("a module pack listing no modules must be rejected")
	}
}

func TestValidatePackRejectsUnknownKind(t *testing.T) {
	dir := t.TempDir()
	manifest := `{
	  "id": "x", "version": "1.0.0", "kind": "something-else",
	  "sources": [{"name": "x", "url": "local://x", "license": "MIT", "attribution": "y"}]
	}`
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	if _, err := ValidatePack(dir); err == nil {
		t.Fatal("an unknown pack kind must be rejected")
	}
}

// TestShippedPacksValidate keeps the repository's own packs honest: every manifest
// under packs/ must satisfy the validator.
func TestShippedPacksValidate(t *testing.T) {
	entries, err := os.ReadDir(filepath.Join("..", "..", "packs"))
	if err != nil {
		t.Skipf("packs directory unavailable: %v", err)
	}

	checked := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join("..", "..", "packs", entry.Name())
		if _, err := os.Stat(filepath.Join(dir, "manifest.json")); err != nil {
			continue
		}

		checked++
		if _, err := ValidatePack(dir); err != nil {
			t.Errorf("shipped pack %q does not validate: %v", entry.Name(), err)
		}
	}

	if checked == 0 {
		t.Skip("no shipped pack manifests found")
	}
}
