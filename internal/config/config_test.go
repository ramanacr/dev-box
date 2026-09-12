package config

import (
	"testing"
)

func TestLoad_DefaultsToLoopback(t *testing.T) {
	mockEnv := map[string]string{}
	cfg, err := Load(func(k string) string { return mockEnv[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.BindAddress != "127.0.0.1" {
		t.Errorf("expected BindAddress to be 127.0.0.1, got %q", cfg.BindAddress)
	}
	if cfg.Port != 8080 {
		t.Errorf("expected Port to be 8080, got %d", cfg.Port)
	}
	if cfg.ListenAddr() != "127.0.0.1:8080" {
		t.Errorf("expected ListenAddr to be 127.0.0.1:8080, got %q", cfg.ListenAddr())
	}
	if cfg.DocsDBPath != "/app/packs/core/docs.db" {
		t.Errorf("expected DocsDBPath default, got %q", cfg.DocsDBPath)
	}
	if cfg.WebRoot != "/app/web" {
		t.Errorf("expected WebRoot default, got %q", cfg.WebRoot)
	}
}

func TestLoad_AllowsExplicitBindAddress(t *testing.T) {
	mockEnv := map[string]string{
		"TOOLBOX_BIND_ADDRESS": "0.0.0.0",
		"TOOLBOX_PORT":         "9090",
	}
	cfg, err := Load(func(k string) string { return mockEnv[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.BindAddress != "0.0.0.0" {
		t.Errorf("expected BindAddress to be 0.0.0.0, got %q", cfg.BindAddress)
	}
	if cfg.Port != 9090 {
		t.Errorf("expected Port to be 9090, got %d", cfg.Port)
	}
	if cfg.ListenAddr() != "0.0.0.0:9090" {
		t.Errorf("expected ListenAddr to be 0.0.0.0:9090, got %q", cfg.ListenAddr())
	}
}

func TestLoad_RejectsNonNumericPort(t *testing.T) {
	mockEnv := map[string]string{
		"TOOLBOX_PORT": "abc",
	}
	_, err := Load(func(k string) string { return mockEnv[k] })
	if err == nil {
		t.Fatal("expected error for non-numeric port, got nil")
	}
}

func TestLoad_RejectsOutOfRangePort(t *testing.T) {
	mockEnv := map[string]string{
		"TOOLBOX_PORT": "70000",
	}
	_, err := Load(func(k string) string { return mockEnv[k] })
	if err == nil {
		t.Fatal("expected error for port > 65535, got nil")
	}
}

func TestLoad_TeamModeDisabledByDefault(t *testing.T) {
	cfg, err := Load(func(string) string { return "" })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.TeamMode {
		t.Fatal("expected team mode off by default")
	}
	// Anonymous localhost mode must not nominate a workspace database at all.
	if cfg.WorkspaceDBPath != "" {
		t.Errorf("expected no workspace db path when team mode is off, got %q", cfg.WorkspaceDBPath)
	}
}

func TestLoad_TeamModeRequiresIssuerAndAudience(t *testing.T) {
	env := map[string]string{"TOOLBOX_TEAM_MODE": "true"}
	getenv := func(k string) string { return env[k] }

	if _, err := Load(getenv); err == nil {
		t.Fatal("expected error when issuer is missing")
	}

	env["TOOLBOX_OIDC_ISSUER"] = "https://id.example.com"
	if _, err := Load(getenv); err == nil {
		t.Fatal("expected error when audience is missing")
	}

	env["TOOLBOX_OIDC_AUDIENCE"] = "developer-toolbox"
	cfg, err := Load(getenv)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.TeamMode {
		t.Fatal("expected team mode enabled")
	}
	if cfg.WorkspaceDBPath != DefaultWorkspaceDBPath {
		t.Errorf("expected default workspace db path, got %q", cfg.WorkspaceDBPath)
	}
}

func TestLoad_FeatureFlagsDefaultOff(t *testing.T) {
	cfg, err := Load(func(string) string { return "" })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, name := range KnownFeatures {
		if cfg.FeatureEnabled(name) {
			t.Errorf("expected feature %q to default to off", name)
		}
	}
	if cfg.FeatureEnabled("not-a-real-extension") {
		t.Error("unknown feature names must never report enabled")
	}
}

func TestLoad_FeatureFlagsParsedFromEnvironment(t *testing.T) {
	env := map[string]string{
		"TOOLBOX_FEATURE_TYPESENSE": "true",
		"TOOLBOX_TYPESENSE_URL":     "http://typesense:8108",
	}
	cfg, err := Load(func(k string) string { return env[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.FeatureEnabled(FeatureTypesense) {
		t.Error("expected typesense feature enabled")
	}
	if cfg.TypesenseURL != "http://typesense:8108" {
		t.Errorf("unexpected typesense url %q", cfg.TypesenseURL)
	}
	if cfg.FeatureEnabled(FeatureAI) {
		t.Error("ai must stay off when its flag is absent")
	}
}

func TestLoad_TypesenseFeatureRequiresURL(t *testing.T) {
	env := map[string]string{"TOOLBOX_FEATURE_TYPESENSE": "true"}
	if _, err := Load(func(k string) string { return env[k] }); err == nil {
		t.Fatal("expected error when typesense url is missing")
	}
}

func TestLoad_AIFeatureRequiresGatewayURL(t *testing.T) {
	env := map[string]string{"TOOLBOX_FEATURE_AI": "1"}
	if _, err := Load(func(k string) string { return env[k] }); err == nil {
		t.Fatal("expected error when ai gateway url is missing")
	}
}

func TestLoad_CollaborationRequiresTeamMode(t *testing.T) {
	env := map[string]string{"TOOLBOX_FEATURE_COLLABORATION": "true"}
	if _, err := Load(func(k string) string { return env[k] }); err == nil {
		t.Fatal("expected collaboration without team mode to be rejected")
	}

	env["TOOLBOX_TEAM_MODE"] = "true"
	env["TOOLBOX_OIDC_ISSUER"] = "https://id.example.com"
	env["TOOLBOX_OIDC_AUDIENCE"] = "developer-toolbox"
	cfg, err := Load(func(k string) string { return env[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.FeatureEnabled(FeatureCollaboration) {
		t.Error("expected collaboration enabled alongside team mode")
	}
}
