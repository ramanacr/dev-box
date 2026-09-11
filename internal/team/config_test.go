package team

import (
	"testing"
)

func TestTeamConfigDisabledByDefault(t *testing.T) {
	cfg, err := LoadConfig(func(string) string { return "" })
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if Enabled(cfg) {
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
