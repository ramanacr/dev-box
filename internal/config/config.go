package config

import (
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
)

// Config represents runtime settings for the developer toolbox service.
type Config struct {
	BindAddress    string
	Port           int
	DocsDBPath     string
	UserDocsDBPath string
	WebRoot        string

	// Team mode. Disabled unless TOOLBOX_TEAM_MODE is set, in which case the OIDC
	// issuer and audience become mandatory. Anonymous localhost operation never
	// touches or creates WorkspaceDBPath.
	TeamMode        bool
	OIDCIssuer      string
	OIDCAudience    string
	OIDCClientID    string
	WorkspaceDBPath string

	// Features holds the parsed TOOLBOX_FEATURE_<NAME> extension flags, keyed by
	// lowercase extension name. Phase 4 requires these to be parsed centrally here
	// rather than read from the environment at each use site.
	Features map[string]bool

	// Extension settings, only consulted when the owning feature flag is enabled.
	TypesenseURL    string
	TypesenseAPIKey string
	AIGatewayURL    string
	AIModel         string

	// AITokenBudget caps the estimated tokens of a single prompt. Zero means no cap.
	AITokenBudget int

	// AIAllowedClassifications lists the data classes permitted to leave the
	// installation. Empty means public-only; restricted data is never permitted.
	AIAllowedClassifications []string
}

// Default settings as specified in the architecture document.
const (
	DefaultBindAddress     = "127.0.0.1"
	DefaultPort            = 8080
	DefaultDocsDBPath      = "/app/packs/core/docs.db"
	DefaultUserDocsDBPath  = "/app/packs/user/user-docs.db"
	DefaultWebRoot         = "/app/web"
	DefaultWorkspaceDBPath = "/var/lib/toolbox/workspace.db"

	// DefaultAITokenBudget caps a single prompt when no explicit budget is set.
	DefaultAITokenBudget = 4096
)

// KnownFeatures lists every extension flag the service recognises. Flags are
// enumerated explicitly so that an injected getenv can be used in tests and so that
// an unrecognised TOOLBOX_FEATURE_* value cannot silently enable anything.
var KnownFeatures = []string{
	FeatureTypesense,
	FeatureCollaboration,
	FeatureAI,
}

// Extension feature names. These map to TOOLBOX_FEATURE_<UPPERCASE> environment keys.
const (
	FeatureTypesense     = "typesense"
	FeatureCollaboration = "collaboration"
	FeatureAI            = "ai"
)

// FeatureEnabled reports whether the named extension flag is on. Unknown names are
// always false.
func (c Config) FeatureEnabled(name string) bool {
	if c.Features == nil {
		return false
	}
	return c.Features[strings.ToLower(strings.TrimSpace(name))]
}

// parseBool treats only "true" and "1" as affirmative, matching the documented
// TOOLBOX_FEATURE_<NAME>=true contract.
func parseBool(raw string) bool {
	v := strings.ToLower(strings.TrimSpace(raw))
	return v == "true" || v == "1"
}

// Load reads configuration using the provided environment lookup function.
func Load(getenv func(string) string) (Config, error) {
	if getenv == nil {
		getenv = os.Getenv
	}

	cfg := Config{
		BindAddress:    DefaultBindAddress,
		Port:           DefaultPort,
		DocsDBPath:     DefaultDocsDBPath,
		UserDocsDBPath: DefaultUserDocsDBPath,
		WebRoot:        DefaultWebRoot,
	}

	if val := strings.TrimSpace(getenv("TOOLBOX_BIND_ADDRESS")); val != "" {
		cfg.BindAddress = val
	}

	if val := strings.TrimSpace(getenv("TOOLBOX_PORT")); val != "" {
		p, err := strconv.Atoi(val)
		if err != nil || p < 1 || p > 65535 {
			return Config{}, fmt.Errorf("invalid TOOLBOX_PORT %q: must be integer between 1 and 65535", val)
		}
		cfg.Port = p
	}

	if val := strings.TrimSpace(getenv("TOOLBOX_DOCS_DB_PATH")); val != "" {
		cfg.DocsDBPath = val
	}
	if cfg.DocsDBPath == "" {
		return Config{}, errors.New("docs database path must not be empty")
	}

	if val := strings.TrimSpace(getenv("TOOLBOX_USER_DOCS_DB_PATH")); val != "" {
		cfg.UserDocsDBPath = val
	}

	if val := strings.TrimSpace(getenv("TOOLBOX_WEB_ROOT")); val != "" {
		cfg.WebRoot = val
	}
	if cfg.WebRoot == "" {
		return Config{}, errors.New("web root must not be empty")
	}

	// Team mode. Keep anonymous localhost operation completely free of team state:
	// when the flag is absent nothing below is read and no workspace path is set.
	cfg.TeamMode = parseBool(getenv("TOOLBOX_TEAM_MODE"))
	if cfg.TeamMode {
		cfg.OIDCIssuer = strings.TrimSpace(getenv("TOOLBOX_OIDC_ISSUER"))
		cfg.OIDCAudience = strings.TrimSpace(getenv("TOOLBOX_OIDC_AUDIENCE"))
		cfg.OIDCClientID = strings.TrimSpace(getenv("TOOLBOX_OIDC_CLIENT_ID"))

		cfg.WorkspaceDBPath = strings.TrimSpace(getenv("TOOLBOX_TEAM_DB_PATH"))
		if cfg.WorkspaceDBPath == "" {
			cfg.WorkspaceDBPath = DefaultWorkspaceDBPath
		}

		if cfg.OIDCIssuer == "" {
			return Config{}, errors.New("team mode requires TOOLBOX_OIDC_ISSUER")
		}
		if cfg.OIDCAudience == "" {
			return Config{}, errors.New("team mode requires TOOLBOX_OIDC_AUDIENCE")
		}
	}

	// Extension feature flags, parsed centrally.
	cfg.Features = make(map[string]bool, len(KnownFeatures))
	for _, name := range KnownFeatures {
		key := "TOOLBOX_FEATURE_" + strings.ToUpper(name)
		cfg.Features[name] = parseBool(getenv(key))
	}

	if cfg.Features[FeatureTypesense] {
		cfg.TypesenseURL = strings.TrimSpace(getenv("TOOLBOX_TYPESENSE_URL"))
		cfg.TypesenseAPIKey = strings.TrimSpace(getenv("TOOLBOX_TYPESENSE_API_KEY"))
		if cfg.TypesenseURL == "" {
			return Config{}, errors.New("typesense feature requires TOOLBOX_TYPESENSE_URL")
		}
	}

	if cfg.Features[FeatureAI] {
		cfg.AIGatewayURL = strings.TrimSpace(getenv("TOOLBOX_AI_GATEWAY_URL"))
		cfg.AIModel = strings.TrimSpace(getenv("TOOLBOX_AI_MODEL"))
		if cfg.AIGatewayURL == "" {
			return Config{}, errors.New("ai feature requires TOOLBOX_AI_GATEWAY_URL")
		}

		cfg.AITokenBudget = DefaultAITokenBudget
		if val := strings.TrimSpace(getenv("TOOLBOX_AI_TOKEN_BUDGET")); val != "" {
			budget, err := strconv.Atoi(val)
			if err != nil || budget < 1 {
				return Config{}, fmt.Errorf("invalid TOOLBOX_AI_TOKEN_BUDGET %q: must be a positive integer", val)
			}
			cfg.AITokenBudget = budget
		}

		// Classifications must be opted into explicitly. An operator who sets nothing
		// gets public-only, which is the conservative reading of the privacy boundary.
		if val := strings.TrimSpace(getenv("TOOLBOX_AI_ALLOWED_CLASSIFICATIONS")); val != "" {
			for _, part := range strings.Split(val, ",") {
				if class := strings.ToLower(strings.TrimSpace(part)); class != "" {
					cfg.AIAllowedClassifications = append(cfg.AIAllowedClassifications, class)
				}
			}
		}
	}

	// Collaboration relays messages between authenticated workspace members, so it
	// cannot operate without the identity and workspace storage team mode provides.
	if cfg.Features[FeatureCollaboration] && !cfg.TeamMode {
		return Config{}, errors.New("collaboration feature requires TOOLBOX_TEAM_MODE=true")
	}

	// Validate host/port combination can be formed safely
	_ = net.JoinHostPort(cfg.BindAddress, strconv.Itoa(cfg.Port))

	return cfg, nil
}

// ListenAddr returns the combined host:port string for net.Listen.
func (c Config) ListenAddr() string {
	return net.JoinHostPort(c.BindAddress, strconv.Itoa(c.Port))
}
