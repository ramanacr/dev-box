package buildinfo

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestUnstampedBinaryReportsDevelopment covers the property that keeps a local
// build from being mistaken for a release: with no -ldflags, the version must be
// the development sentinel rather than an empty string or an invented number.
func TestUnstampedBinaryReportsDevelopment(t *testing.T) {
	info := Get()

	if info.Version == "" {
		t.Fatal("version must never be empty")
	}
	if !strings.HasPrefix(info.Version, DevelopmentVersion) {
		t.Errorf("an unstamped test binary must report a development version, got %q", info.Version)
	}
	if IsRelease() {
		t.Error("an unstamped binary must not claim to be a release")
	}
}

// TestRuntimeFieldsAlwaysPresent covers the fields that need no stamping. They are
// what a support conversation needs when the version is only "dev".
func TestRuntimeFieldsAlwaysPresent(t *testing.T) {
	info := Get()

	if !strings.HasPrefix(info.GoVersion, "go") {
		t.Errorf("go version looks wrong: %q", info.GoVersion)
	}
	if !strings.Contains(info.Platform, "/") {
		t.Errorf("platform must be os/arch, got %q", info.Platform)
	}
}

// TestGetIsStable guards the sync.Once cache: repeated calls must agree, since the
// value is marshalled into a payload built once at server startup.
func TestGetIsStable(t *testing.T) {
	if first, second := Get(), Get(); first != second {
		t.Errorf("Get() is not stable: %+v then %+v", first, second)
	}
}

// TestEmptyFieldsAreOmitted keeps the health payload clean for development builds,
// where commit and build date may be unknown.
func TestEmptyFieldsAreOmitted(t *testing.T) {
	encoded, err := json.Marshal(Info{Version: "dev", GoVersion: "go1.27.0", Platform: "linux/amd64"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(encoded), "commit") || strings.Contains(string(encoded), "build_date") {
		t.Errorf("unknown fields must be omitted, got %s", encoded)
	}
}
