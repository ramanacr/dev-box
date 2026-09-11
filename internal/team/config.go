package team

import (
	"errors"
	"strings"
)

// Config encapsulates team-mode settings.
type Config struct {
	Enabled       bool
	OIDCIssuer    string
	OIDCAudience  string
	OIDCClientID  string
	WorkspaceDB   string
}

func Enabled(cfg Config) bool {
	return cfg.Enabled
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
