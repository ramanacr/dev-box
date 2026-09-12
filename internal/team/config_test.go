package team

import (
	"testing"

	"developer-toolbox/internal/config"
)

func TestTeamConfigDisabledByDefault(t *testing.T) {
	cfg, err := LoadConfig(func(string) string { return "" })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Enabled {
		t.Fatalf("expected team mode to be disabled")
	}
}

func TestTeamConfigRequiresIssuerAndAudience(t *testing.T) {
	env := map[string]string{
		"TOOLBOX_TEAM_MODE": "true",
	}
	_, err := LoadConfig(func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error when issuer/audience missing")
	}

	env["TOOLBOX_OIDC_ISSUER"] = "https://id.example.com"
	_, err = LoadConfig(func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error when audience missing")
	}

	env["TOOLBOX_OIDC_AUDIENCE"] = "dev-box-client"
	cfg, err := LoadConfig(func(k string) string { return env[k] })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.Enabled {
		t.Fatalf("expected team mode to be enabled")
	}
	if cfg.WorkspaceDB != "/var/lib/toolbox/workspace.db" {
		t.Fatalf("expected default db path, got %q", cfg.WorkspaceDB)
	}
}

func TestEnabledReadsAppConfig(t *testing.T) {
	if Enabled(config.Config{}) {
		t.Fatal("expected team mode disabled for zero config")
	}
	if !Enabled(config.Config{TeamMode: true}) {
		t.Fatal("expected team mode enabled when app config says so")
	}
}

func TestConfigFromApp(t *testing.T) {
	// Disabled app config must not leak any team settings through.
	got := ConfigFromApp(config.Config{
		TeamMode:        false,
		OIDCIssuer:      "https://id.example.com",
		WorkspaceDBPath: "/var/lib/toolbox/workspace.db",
	})
	if got.Enabled {
		t.Error("expected disabled team config")
	}
	if got.OIDCIssuer != "" || got.WorkspaceDB != "" {
		t.Errorf("disabled team config must carry no settings, got %+v", got)
	}

	got = ConfigFromApp(config.Config{
		TeamMode:        true,
		OIDCIssuer:      "https://id.example.com",
		OIDCAudience:    "developer-toolbox",
		OIDCClientID:    "toolbox-web",
		WorkspaceDBPath: "/var/lib/toolbox/workspace.db",
	})
	if !got.Enabled {
		t.Fatal("expected enabled team config")
	}
	if got.OIDCIssuer != "https://id.example.com" || got.OIDCAudience != "developer-toolbox" {
		t.Errorf("unexpected oidc settings: %+v", got)
	}
	if got.WorkspaceDB != "/var/lib/toolbox/workspace.db" {
		t.Errorf("unexpected workspace db: %q", got.WorkspaceDB)
	}
}
