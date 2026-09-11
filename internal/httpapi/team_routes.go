package httpapi

import (
	"encoding/json"
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
	return &TeamHandler{
		config:    cfg,
		validator: auth.NewTokenValidator(cfg.OIDCIssuer, cfg.OIDCAudience),
		store:     store,
		service:   team.NewWorkspaceService(store),
	}
}

func (h *TeamHandler) extractPrincipal(r *http.Request) (auth.Principal, error) {
	authHdr := r.Header.Get("Authorization")
	if strings.HasPrefix(authHdr, "Bearer ") {
		token := strings.TrimPrefix(authHdr, "Bearer ")
		return h.validator.ValidateIDToken(r.Context(), token)
	}
	return auth.Principal{}, nil
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
			_ = json.NewEncoder(w).Encode(map[string]any{
				"enabled":       true,
				"authenticated": false,
			})
			return
		}

		_ = h.store.UpsertUser(r.Context(), p)

		_ = json.NewEncoder(w).Encode(map[string]any{
			"enabled":       true,
			"authenticated": true,
			"user":          p,
		})
	})

	mux.HandleFunc("GET /api/team/workspaces", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, err := h.extractPrincipal(r)
		if err != nil || p.Subject == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		workspaces, err := h.store.ListWorkspaces(r.Context(), p.Subject)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		if workspaces == nil {
			workspaces = []team.Workspace{}
		}
		_ = json.NewEncoder(w).Encode(workspaces)
	})

	mux.HandleFunc("POST /api/team/workspaces", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, err := h.extractPrincipal(r)
		if err != nil || p.Subject == "" {
			w.WriteHeader(http.StatusUnauthorized)
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
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(ws)
	})

	mux.HandleFunc("GET /api/team/admin/packs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		p, err := h.extractPrincipal(r)
		if err != nil || p.Subject == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		if err := h.service.Authorize(r.Context(), p, "", team.ActionManagePacks); err != nil {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		packs, err := h.store.ListActivePacks(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if packs == nil {
			packs = []team.ActivePack{}
		}
		_ = json.NewEncoder(w).Encode(packs)
	})
}
