// Package features wires the Phase 4 extensions onto the extension registry.
//
// Each extension is off unless its TOOLBOX_FEATURE_<NAME> flag is set, and the core
// image must remain fully functional with every flag false. Keeping the concrete
// implementations here rather than in internal/extensions keeps the admission
// framework free of dependencies on the subsystems it admits.
package features

import (
	"context"
	"errors"
	"net/http"

	"developer-toolbox/internal/ai"
	"developer-toolbox/internal/auth"
	"developer-toolbox/internal/collab"
	"developer-toolbox/internal/config"
	"developer-toolbox/internal/docs"
	"developer-toolbox/internal/extensions"
	"developer-toolbox/internal/search"
	"developer-toolbox/internal/team"
)

// TypesenseExtension exposes the optional Typesense search mirror.
//
// The extension owns no search route of its own: the backend is installed as the
// searcher the existing /api/docs/search handler already uses, so enabling it changes
// where results come from without changing the API surface. FTS5 stays active as the
// fallback and the content authority.
type TypesenseExtension struct {
	Backend *search.TypesenseBackend

	// Pack is the local content pack the mirror endpoint copies into Typesense.
	Pack *docs.Pack
}

func (e *TypesenseExtension) Name() string { return config.FeatureTypesense }

func (e *TypesenseExtension) Enabled(cfg config.Config) bool {
	return cfg.FeatureEnabled(config.FeatureTypesense)
}

func (e *TypesenseExtension) Register(mux *http.ServeMux) error {
	if e.Backend == nil {
		return errors.New("typesense extension enabled without a configured backend")
	}

	// A mirror has to be triggerable without restarting the container. This is an
	// administrative action, so it is bound to the local pack rather than accepting a
	// caller-supplied corpus.
	mux.HandleFunc("POST /api/extensions/typesense/mirror", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if e.Pack == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"no content pack is available to mirror"}`))
			return
		}
		if err := e.Backend.MirrorPack(r.Context(), *e.Pack); err != nil {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"error":"mirror failed"}`))
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"mirrored"}`))
	})

	return nil
}

func (e *TypesenseExtension) HealthCheck() error {
	if e.Backend == nil {
		return errors.New("typesense backend is not configured")
	}
	return e.Backend.Ready()
}

// CollaborationExtension exposes the authenticated workspace WebSocket relay.
type CollaborationExtension struct {
	Handler *collab.Handler
}

func (e *CollaborationExtension) Name() string { return config.FeatureCollaboration }

func (e *CollaborationExtension) Enabled(cfg config.Config) bool {
	// Collaboration relays between authenticated members, so it cannot run without
	// team mode. config.Load rejects that combination, and this is the second gate.
	return cfg.FeatureEnabled(config.FeatureCollaboration) && cfg.TeamMode
}

func (e *CollaborationExtension) Register(mux *http.ServeMux) error {
	if e.Handler == nil {
		return errors.New("collaboration extension enabled without a configured handler")
	}
	e.Handler.RegisterRoutes(mux)
	return nil
}

func (e *CollaborationExtension) HealthCheck() error {
	if e.Handler == nil || e.Handler.Hub == nil {
		return errors.New("collaboration hub is not configured")
	}
	return nil
}

// AIExtension exposes the opt-in AI policy boundary.
//
// Only the policy decision is served. There is deliberately no model endpoint: the
// Phase 4 plan requires the policy to pass before any provider code exists, and the
// decision response carries the destination and redaction preview the UI must show
// before a user consents.
type AIExtension struct {
	Gateway *ai.Gateway
	Policy  ai.AIPolicy
}

func (e *AIExtension) Name() string { return config.FeatureAI }

func (e *AIExtension) Enabled(cfg config.Config) bool {
	return cfg.FeatureEnabled(config.FeatureAI)
}

func (e *AIExtension) Register(mux *http.ServeMux) error {
	if e.Gateway == nil {
		return errors.New("ai extension enabled without a configured gateway")
	}
	mux.HandleFunc("POST /api/ai/evaluate", e.Gateway.HandleRequest)
	return nil
}

func (e *AIExtension) HealthCheck() error {
	if !e.Policy.Enabled {
		return errors.New("ai policy is not enabled")
	}
	if e.Policy.ApprovedDestination == "" {
		return errors.New("ai policy has no approved destination")
	}
	return nil
}

// Dependencies carries what the extensions need from the rest of the service.
type Dependencies struct {
	// CoreSearcher is the FTS5 searcher, used as the Typesense fallback and content
	// authority.
	CoreSearcher docs.Searcher

	// Pack is the validated content pack available for mirroring, if any.
	Pack *docs.Pack

	// TeamStore backs collaboration membership checks.
	TeamStore *team.Store

	// Validator authenticates WebSocket connections.
	Validator *auth.TokenValidator
}

// Build constructs the registry for the given configuration.
//
// Only enabled extensions are constructed, so a disabled feature costs nothing at
// runtime and a missing setting for a disabled feature is never an error. The
// returned searcher is the one the server should use: it is the core FTS5 searcher
// unless the Typesense mirror is active.
func Build(cfg config.Config, deps Dependencies) (*extensions.Registry, docs.Searcher, error) {
	registry := extensions.NewRegistry()
	searcher := deps.CoreSearcher

	if cfg.FeatureEnabled(config.FeatureTypesense) {
		backend, err := search.NewTypesenseBackend(
			cfg.TypesenseURL,
			search.Secret(cfg.TypesenseAPIKey),
			deps.CoreSearcher,
		)
		if err != nil {
			return nil, nil, err
		}
		if err := registry.Register(&TypesenseExtension{Backend: backend, Pack: deps.Pack}); err != nil {
			return nil, nil, err
		}
		// Reads now go through the mirror, which falls back to FTS5 on any failure.
		searcher = backend
	}

	if cfg.FeatureEnabled(config.FeatureCollaboration) && cfg.TeamMode {
		if deps.TeamStore == nil {
			return nil, nil, errors.New("collaboration requires the team workspace store")
		}

		service := team.NewWorkspaceService(deps.TeamStore)
		hub := collab.NewHubWithAuthorizer(collab.AuthorizerFunc(
			func(ctx context.Context, p auth.Principal, workspaceID string) error {
				// Read access to the workspace is the membership test for the room.
				return service.Authorize(ctx, p, workspaceID, team.ActionRead)
			},
		))

		handler := collab.NewHandler(hub, deps.Validator, newSnapshotStore(deps.TeamStore))
		if err := registry.Register(&CollaborationExtension{Handler: handler}); err != nil {
			return nil, nil, err
		}
	}

	if cfg.FeatureEnabled(config.FeatureAI) {
		policy := ai.AIPolicy{
			Enabled:             true,
			ApprovedDestination: cfg.AIGatewayURL,
			MaxTokens:           cfg.AITokenBudget,
			// Classifications must be opted into explicitly; the default is
			// public-only and restricted data is never permitted.
			AllowedClassifications: cfg.AIAllowedClassifications,
		}
		if err := registry.Register(&AIExtension{Gateway: ai.NewGateway(policy), Policy: policy}); err != nil {
			return nil, nil, err
		}
	}

	return registry, searcher, nil
}
