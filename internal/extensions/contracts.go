package extensions

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"

	"developer-toolbox/internal/config"
)

type FeatureFlag string

type Extension interface {
	Name() string
	Enabled(cfg config.Config) bool
	Register(mux *http.ServeMux) error
	HealthCheck() error
}

type Registry struct {
	mu         sync.RWMutex
	extensions map[string]Extension
}

func NewRegistry() *Registry {
	return &Registry{
		extensions: make(map[string]Extension),
	}
}

func IsFlagEnabled(flag FeatureFlag, getenv func(string) string) bool {
	if getenv == nil {
		getenv = os.Getenv
	}
	envKey := fmt.Sprintf("TOOLBOX_FEATURE_%s", strings.ToUpper(string(flag)))
	val := strings.ToLower(strings.TrimSpace(getenv(envKey)))
	return val == "true" || val == "1"
}

func (r *Registry) Register(ext Extension) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	name := strings.ToLower(strings.TrimSpace(ext.Name()))
	if name == "" {
		return errors.New("extension name cannot be empty")
	}
	if _, exists := r.extensions[name]; exists {
		return fmt.Errorf("extension %q is already registered", name)
	}

	r.extensions[name] = ext
	return nil
}

func (r *Registry) InitializeRoutes(cfg config.Config, mux *http.ServeMux) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for name, ext := range r.extensions {
		if !ext.Enabled(cfg) {
			continue
		}

		if err := ext.Register(mux); err != nil {
			return fmt.Errorf("failed to register routes for extension %q: %w", name, err)
		}

		// Register health check endpoint
		healthPath := fmt.Sprintf("GET /api/extensions/%s/health", name)
		currentExt := ext
		mux.HandleFunc(healthPath, func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			if err := currentExt.HealthCheck(); err != nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"status": "unhealthy",
					"error":  err.Error(),
				})
				return
			}
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "healthy",
			})
		})
	}

	return nil
}
