package team

import (
	"errors"
	"strings"

	"developer-toolbox/internal/config"
)

// Config encapsulates team-mode settings.
type Config struct {
	Enabled      bool
	OIDCIssuer   string
	OIDCAudience string
	OIDCClientID string
	WorkspaceDB  string
}

// Enabled reports whether team mode is active for the given service configuration.
// This is the interface fixed by the Phase 3 plan; it reads the centrally parsed
// application config rather than the environment.
func Enabled(cfg config.Config) bool {
	return cfg.TeamMode
}

// ConfigFromApp projects the centrally parsed service configuration onto the
// team-mode settings. Team mode owns no environment parsing of its own at runtime:
// config.Load is the single place TOOLBOX_TEAM_MODE and the OIDC settings are read,
// so the server and this package can never disagree about whether team mode is on.
func ConfigFromApp(cfg config.Config) Config {
	if !cfg.TeamMode {
		return Config{Enabled: false}
	}
	return Config{
		Enabled:      true,
		OIDCIssuer:   cfg.OIDCIssuer,
		OIDCAudience: cfg.OIDCAudience,
		OIDCClientID: cfg.OIDCClientID,
		WorkspaceDB:  cfg.WorkspaceDBPath,
	}
}

// LoadConfig extracts team configuration from an environment lookup function.
func LoadConfig(getenv func(string) string) (Config, error) {
	rawEnabled := strings.ToLower(strings.TrimSpace(getenv("TOOLBOX_TEAM_MODE")))
	enabled := rawEnabled == "true" || rawEnabled == "1"

	if !enabled {
		return Config{Enabled: false}, nil
	}

	issuer := strings.TrimSpace(getenv("TOOLBOX_OIDC_ISSUER"))
	audience := strings.TrimSpace(getenv("TOOLBOX_OIDC_AUDIENCE"))
	clientID := strings.TrimSpace(getenv("TOOLBOX_OIDC_CLIENT_ID"))
	dbPath := strings.TrimSpace(getenv("TOOLBOX_TEAM_DB_PATH"))

	if dbPath == "" {
		dbPath = "/var/lib/toolbox/workspace.db"
	}

	if issuer == "" {
		return Config{}, errors.New("team mode requires TOOLBOX_OIDC_ISSUER")
	}
	if audience == "" {
		return Config{}, errors.New("team mode requires TOOLBOX_OIDC_AUDIENCE")
	}

	return Config{
		Enabled:      true,
		OIDCIssuer:   issuer,
		OIDCAudience: audience,
		OIDCClientID: clientID,
		WorkspaceDB:  dbPath,
	}, nil
}
