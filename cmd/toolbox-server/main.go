package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"developer-toolbox/internal/auth"
	"developer-toolbox/internal/buildinfo"
	"developer-toolbox/internal/config"
	"developer-toolbox/internal/docs"
	"developer-toolbox/internal/features"
	"developer-toolbox/internal/httpapi"
	"developer-toolbox/internal/observability"
	"developer-toolbox/internal/team"
)

func main() {
	// Bootstrap logger. The configured level is not known until config loads, and
	// a failure to load has to be reportable, so this starts at info and is
	// replaced below.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg, err := config.Load(nil)
	if err != nil {
		slog.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	})))

	// Logged first, and at every start: when an operator files a report, this line
	// is what identifies the build they are running.
	info := buildinfo.Get()
	slog.Info("starting developer-toolbox server",
		"version", info.Version,
		"commit", info.Commit,
		"build_date", info.BuildDate,
		"go_version", info.GoVersion,
		"platform", info.Platform,
	)

	metrics := observability.NewRegistry()
	observability.SetBuildInfo(metrics, info.Version, info.Commit, info.GoVersion)

	packDir := filepath.Dir(cfg.DocsDBPath)
	manifest, err := docs.ValidatePack(packDir)
	if err != nil {
		slog.Warn("docs pack validation warning", "error", err, "path", cfg.DocsDBPath)
	} else {
		slog.Info("docs pack verified", "id", manifest.ID, "version", manifest.Version)
	}

	var coreSearcher docs.Searcher
	var corePack *docs.Pack
	sqliteSearcher, err := docs.OpenReadOnly(cfg.DocsDBPath)
	if err != nil {
		slog.Warn("core documentation searcher unavailable", "error", err, "path", cfg.DocsDBPath)
	} else {
		defer sqliteSearcher.Close()
		coreSearcher = sqliteSearcher
		if manifest != nil {
			pack := sqliteSearcher.AsPack(*manifest)
			corePack = &pack
		}
		slog.Info("core documentation searcher initialized", "path", cfg.DocsDBPath)
	}

	// Open user documentation store (writable SQLite with WAL mode)
	var userStore *docs.UserStore
	uStore, err := docs.OpenUserStore(cfg.UserDocsDBPath)
	if err != nil {
		slog.Warn("user documentation store unavailable", "error", err, "path", cfg.UserDocsDBPath)
	} else {
		defer uStore.Close()
		userStore = uStore
		slog.Info("user documentation store initialized", "path", cfg.UserDocsDBPath)
	}

	// Construct federated multi searcher
	searcher := docs.Searcher(docs.NewMultiSearcher(coreSearcher, userStore))

	serverOptions := []httpapi.Option{httpapi.WithMetrics(metrics)}

	// Team mode. Anonymous localhost operation never reaches this branch, so no
	// workspace database is created and no identity subsystem is started.
	var teamStore *team.Store
	var validator *auth.TokenValidator
	if team.Enabled(cfg) {
		teamStore, err = team.OpenStore(cfg.WorkspaceDBPath)
		if err != nil {
			// Team mode was explicitly requested; failing to open its state is fatal
			// rather than a silent downgrade to anonymous mode.
			slog.Error("team mode enabled but workspace database is unavailable",
				"error", err, "path", cfg.WorkspaceDBPath)
			os.Exit(1)
		}
		defer teamStore.Close()

		validator = auth.NewTokenValidator(cfg.OIDCIssuer, cfg.OIDCAudience)

		serverOptions = append(serverOptions,
			httpapi.WithTeamStore(teamStore),
			httpapi.WithTeamValidator(validator),
		)
		slog.Info("team mode enabled",
			"issuer", cfg.OIDCIssuer,
			"audience", cfg.OIDCAudience,
			"workspace_db", cfg.WorkspaceDBPath,
		)
	} else {
		slog.Info("team mode disabled; running anonymous localhost profile")
	}

	// Phase 4 extensions. Every one is off unless its TOOLBOX_FEATURE_<NAME> flag is
	// set; with all flags false this returns an empty registry and the core searcher
	// unchanged.
	registry, activeSearcher, err := features.Build(cfg, features.Dependencies{
		CoreSearcher: searcher,
		Pack:         corePack,
		TeamStore:    teamStore,
		Validator:    validator,
	})
	if err != nil {
		slog.Error("failed to initialize extensions", "error", err)
		os.Exit(1)
	}
	searcher = activeSearcher
	serverOptions = append(serverOptions, httpapi.WithExtensions(registry))

	for _, name := range config.KnownFeatures {
		if cfg.FeatureEnabled(name) {
			slog.Info("extension enabled", "name", name)
		}
	}

	if cfg.MetricsEnabled {
		slog.Info("metrics endpoint enabled", "path", "/metrics")
	}

	// Prepare static file assets
	var assets = os.DirFS(cfg.WebRoot)

	// Create HTTP handler
	handler := httpapi.NewServer(cfg, searcher, assets, serverOptions...)

	server := &http.Server{
		Addr:              cfg.ListenAddr(),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// The collaboration relay holds long-lived WebSocket connections, which a
	// per-request write deadline would sever. Disable the whole-request timeouts when
	// it is active and rely on the handler's own ping/pong and read deadlines.
	if cfg.FeatureEnabled(config.FeatureCollaboration) {
		server.ReadTimeout = 0
		server.WriteTimeout = 0
		slog.Info("request timeouts relaxed for the collaboration relay")
	}

	// Start server in background
	serverErr := make(chan error, 1)
	go func() {
		slog.Info("server listening", "address", cfg.ListenAddr())
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// Wait for interrupt signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		slog.Error("server fatal error", "error", err)
		os.Exit(1)
	case sig := <-stop:
		slog.Info("shutting down server gracefully", "signal", sig.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped")
}
