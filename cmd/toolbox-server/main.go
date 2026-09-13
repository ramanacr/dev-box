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

// startAuditRetention prunes audit records older than the configured window,
// once at startup and daily thereafter. It returns a function that stops the
// loop.
//
// It runs at startup as well as on the timer so that lowering the retention
// window takes effect on the next restart rather than up to a day later, which
// is what an operator reducing it in response to a privacy request expects.
func startAuditRetention(store *team.Store, days int) func() {
	const interval = 24 * time.Hour

	prune := func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()

		cutoff := time.Now().UTC().AddDate(0, 0, -days)
		deleted, err := store.PruneAuditRecords(ctx, cutoff)
		if err != nil {
			slog.Error("audit retention sweep failed", "error", err)
			return
		}
		if deleted > 0 {
			// Logged because deleting audit records is itself an auditable act.
			slog.Info("audit retention sweep complete",
				"deleted", deleted,
				"cutoff", cutoff.Format(time.RFC3339),
			)
		}
	}

	prune()

	done := make(chan struct{})
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				prune()
			case <-done:
				return
			}
		}
	}()

	return func() { close(done) }
}

func main() {
	// The healthcheck subcommand short-circuits before any logging or state is
	// set up: it is a probe, not a server start, and it must not create a
	// workspace database or emit a startup line on every interval.
	if len(os.Args) > 1 && os.Args[1] == healthcheckSubcommand {
		os.Exit(runHealthcheck(os.Getenv))
	}

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

	// Audit retention. Only started when the operator set a cutoff: the service
	// never deletes evidence on its own initiative.
	if teamStore != nil && cfg.AuditRetentionDays > 0 {
		stopPrune := startAuditRetention(teamStore, cfg.AuditRetentionDays)
		defer stopPrune()
		slog.Info("audit retention enabled", "days", cfg.AuditRetentionDays)
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
