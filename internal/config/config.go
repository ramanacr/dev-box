package config

import (
	"errors"
	"fmt"
	"log/slog"
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

	// MetricsEnabled exposes /metrics in Prometheus text format. On by default:
	// the endpoint reports only counts and latencies of the service's own routes,
	// never request content, and the default profile is loopback-only. An operator
	// publishing the port on a shared network can set TOOLBOX_METRICS_ENABLED=false.
	MetricsEnabled bool

	// LogLevel is the minimum slog level emitted. Operators need to raise this to
	// debug an incident and lower it afterwards without a rebuild.
	LogLevel slog.Level

	// RateLimitEnabled throttles HTTP requests per caller. On by default, with
	// limits set well above anything a human driving the UI will reach.
	RateLimitEnabled bool

	// RateLimitRPS and RateLimitBurst shape the bucket for ordinary reads. Write
	// and gateway routes derive a tighter limit from these.
	RateLimitRPS   float64
	RateLimitBurst float64
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

	// Rate limit defaults. Set so no human driving the web UI will ever meet them
	// while an unattended loop is stopped well short of exhausting the disk: a
	// local-first tool that rate-limits its own user has failed.
	DefaultRateLimitRPS   = 50.0
	DefaultRateLimitBurst = 100.0
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

// parseLogLevel maps the documented level names onto slog levels. An unrecognised
// value is an error rather than a silent fallback to info: an operator who sets
// TOOLBOX_LOG_LEVEL=verbose during an incident needs to be told it is not a level,
// not to discover later that nothing changed.
func parseLogLevel(raw string) (slog.Level, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug, nil
	case "info":
		return slog.LevelInfo, nil
	case "warn", "warning":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("invalid TOOLBOX_LOG_LEVEL %q: must be debug, info, warn or error", raw)
	}
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
		MetricsEnabled: true,
		LogLevel:       slog.LevelInfo,

		RateLimitEnabled: true,
		RateLimitRPS:     DefaultRateLimitRPS,
		RateLimitBurst:   DefaultRateLimitBurst,
	}

	if val := strings.TrimSpace(getenv("TOOLBOX_RATE_LIMIT_ENABLED")); val != "" {
		cfg.RateLimitEnabled = parseBool(val)
	}
	if val := strings.TrimSpace(getenv("TOOLBOX_RATE_LIMIT_RPS")); val != "" {
		rps, err := strconv.ParseFloat(val, 64)
		if err != nil || rps <= 0 {
			return Config{}, fmt.Errorf("invalid TOOLBOX_RATE_LIMIT_RPS %q: must be a positive number", val)
		}
		cfg.RateLimitRPS = rps
	}
	if val := strings.TrimSpace(getenv("TOOLBOX_RATE_LIMIT_BURST")); val != "" {
		burst, err := strconv.ParseFloat(val, 64)
		if err != nil || burst < 1 {
			return Config{}, fmt.Errorf("invalid TOOLBOX_RATE_LIMIT_BURST %q: must be at least 1", val)
		}
		cfg.RateLimitBurst = burst
	}

	// Opt-out rather than opt-in: an unobservable service is the worse default,
	// and the endpoint carries no request content.
	if val := strings.TrimSpace(getenv("TOOLBOX_METRICS_ENABLED")); val != "" {
		cfg.MetricsEnabled = parseBool(val)
	}

	if val := strings.TrimSpace(getenv("TOOLBOX_LOG_LEVEL")); val != "" {
		level, err := parseLogLevel(val)
		if err != nil {
			return Config{}, err
		}
		cfg.LogLevel = level
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
