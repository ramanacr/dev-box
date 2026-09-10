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
}

// Default settings as specified in the architecture document.
const (
	DefaultBindAddress    = "127.0.0.1"
	DefaultPort           = 8080
	DefaultDocsDBPath     = "/app/packs/core/docs.db"
	DefaultUserDocsDBPath = "/app/packs/user/user-docs.db"
	DefaultWebRoot        = "/app/web"
)

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

	// Validate host/port combination can be formed safely
	_ = net.JoinHostPort(cfg.BindAddress, strconv.Itoa(cfg.Port))

	return cfg, nil
}

// ListenAddr returns the combined host:port string for net.Listen.
func (c Config) ListenAddr() string {
	return net.JoinHostPort(c.BindAddress, strconv.Itoa(c.Port))
}
