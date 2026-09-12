package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"developer-toolbox/internal/auth"
	"developer-toolbox/internal/team"
)

type TeamHandler struct {
	config    team.Config
	validator *auth.TokenValidator
	store     *team.Store
	service   *team.WorkspaceService
}

func NewTeamHandler(cfg team.Config, store *team.Store) *TeamHandler {
	return NewTeamHandlerWithValidator(cfg, store, auth.NewTokenValidator(cfg.OIDCIssuer, cfg.OIDCAudience))
}

// NewTeamHandlerWithValidator builds the handler against an explicit token validator.
// Tests use this to supply a key source instead of reaching an OIDC discovery
// endpoint; deployments that pin signing keys out of band can use it too.
func NewTeamHandlerWithValidator(cfg team.Config, store *team.Store, validator *auth.TokenValidator) *TeamHandler {
	return &TeamHandler{
		config:    cfg,
		validator: validator,
		store:     store,
		service:   team.NewWorkspaceService(store),
	}
}

func (h *TeamHandler) extractPrincipal(r *http.Request) (auth.Principal, error) {
	if h.validator == nil {
		return auth.Principal{}, errors.New("token validation is not configured")
	}
	authHdr := r.Header.Get("Authorization")
	if strings.HasPrefix(authHdr, "Bearer ") {
		token := strings.TrimPrefix(authHdr, "Bearer ")
		return h.validator.ValidateIDToken(r.Context(), token)
	}
	return auth.Principal{}, errors.New("missing bearer token")
}

func (h *TeamHandler) RegisterRoutes(mux *http.ServeMux) {
	if !h.config.Enabled || h.store == nil {
		mux.HandleFunc("GET /api/team/me", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"enabled": false,
			})
		})
		return
	}

	mux.HandleFunc("GET /api/team/me", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, err := h.extractPrincipal(r)
		if err != nil || p.Subject == "" {
			w.WriteHeader(http.StatusUnauthorized)
			// The browser cannot start an authorization-code flow without knowing
			// where to send the user. The issuer and client id are public values in
			// a PKCE public client, so returning them to an unauthenticated caller
			// discloses nothing; no secret is ever included.
			_ = json.NewEncoder(w).Encode(map[string]any{
				"enabled":       true,
				"authenticated": false,
				"issuer":        h.config.OIDCIssuer,
				"clientId":      h.config.OIDCClientID,
			})
			return
		}

		if err := h.store.UpsertUser(r.Context(), p); err != nil {
			slog.Error("failed to persist authenticated principal", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
			return
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"enabled":       true,
			"authenticated": true,
			"user":          p,
		})
	})

	mux.HandleFunc("GET /api/team/workspaces", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		workspaces, err := h.store.ListWorkspaces(r.Context(), p.Subject)
		if err != nil {
			// Store errors carry SQL text; log them and return a generic message.
			slog.Error("failed to list workspaces", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
			return
		}
		if workspaces == nil {
			workspaces = []team.Workspace{}
		}
		_ = json.NewEncoder(w).Encode(workspaces)
	})

	mux.HandleFunc("POST /api/team/workspaces", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "name is required"})
			return
		}

		ws, err := h.service.Create(r.Context(), p, req.Name)
		if err != nil {
			slog.Error("failed to create workspace", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(ws)
	})

	mux.HandleFunc("GET /api/team/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		ws, err := h.service.Get(r.Context(), p, r.PathValue("id"))
		if err != nil {
			// An inaccessible workspace must look identical to a missing one so that
			// workspace existence does not leak to non-members.
			h.writeNotFoundOrError(w, err)
			return
		}
		_ = json.NewEncoder(w).Encode(ws)
	})

	mux.HandleFunc("PATCH /api/team/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "name is required"})
			return
		}

		ws, err := h.service.Rename(r.Context(), p, r.PathValue("id"), req.Name)
		if err != nil {
			h.writeNotFoundOrError(w, err)
			return
		}
		_ = json.NewEncoder(w).Encode(ws)
	})

	mux.HandleFunc("GET /api/team/workspaces/{id}/members", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		workspaceID := r.PathValue("id")
		if err := h.service.Authorize(r.Context(), p, workspaceID, team.ActionRead); err != nil {
			h.writeNotFoundOrError(w, err)
			return
		}

		members, err := h.store.ListMembers(r.Context(), workspaceID)
		if err != nil {
			h.writeNotFoundOrError(w, err)
			return
		}
		_ = json.NewEncoder(w).Encode(members)
	})

	mux.HandleFunc("POST /api/team/workspaces/{id}/members", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		var req struct {
			UserSubject string `json:"userSubject"`
			Role        string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserSubject == "" || req.Role == "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "userSubject and role are required"})
			return
		}

		err := h.service.AddMember(r.Context(), p, r.PathValue("id"), req.UserSubject, auth.Role(req.Role))
		if err != nil {
			h.writeNotFoundOrError(w, err)
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"workspaceId": r.PathValue("id"),
			"userSubject": req.UserSubject,
			"role":        req.Role,
		})
	})

	mux.HandleFunc("GET /api/team/admin/packs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		if err := h.service.Authorize(r.Context(), p, "", team.ActionManagePacks); err != nil {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "forbidden"})
			return
		}

		packs, err := h.store.ListActivePacks(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "failed to list packs"})
			return
		}
		if packs == nil {
			packs = []team.ActivePack{}
		}
		_ = json.NewEncoder(w).Encode(packs)
	})

	mux.HandleFunc("POST /api/team/admin/packs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, ok := h.requirePrincipal(w, r)
		if !ok {
			return
		}

		var pack team.ActivePack
		if err := json.NewDecoder(r.Body).Decode(&pack); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid pack payload"})
			return
		}

		if err := h.service.ActivatePack(r.Context(), p, pack); err != nil {
			switch {
			case strings.HasPrefix(err.Error(), "forbidden"):
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "forbidden"})
			case errors.Is(err, team.ErrValidation):
				// Only caller-input errors are safe to relay verbatim.
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			default:
				slog.Error("failed to activate pack", "error", err)
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
			}
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(pack)
	})
}

// requirePrincipal resolves the bearer token and writes 401 when the request carries
// no usable identity. It returns false when the caller should stop.
//
// The verified principal is also persisted on every authenticated request. Workspace
// rows carry a foreign key to users.subject, so a caller whose first action was
// anything other than GET /api/team/me would otherwise hit a constraint failure.
func (h *TeamHandler) requirePrincipal(w http.ResponseWriter, r *http.Request) (auth.Principal, bool) {
	p, err := h.extractPrincipal(r)
	if err != nil || p.Subject == "" {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "authentication required"})
		return auth.Principal{}, false
	}

	if h.store != nil {
		if err := h.store.UpsertUser(r.Context(), p); err != nil {
			slog.Error("failed to persist authenticated principal", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
			return auth.Principal{}, false
		}
	}

	return p, true
}

// writeNotFoundOrError maps service errors onto safe status codes. Authorization
// failures and missing workspaces both return 404 so that a non-member cannot use
// the status code to discover that a workspace exists. Error text from the store is
// never echoed back to the client.
func (h *TeamHandler) writeNotFoundOrError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, team.ErrWorkspaceNotFound),
		strings.HasPrefix(err.Error(), "forbidden"),
		strings.Contains(err.Error(), "not a member"):
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "workspace not found"})
	default:
		slog.Error("team route failure", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
	}
}
