package ai

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type Gateway struct {
	policy AIPolicy
	mu     sync.Mutex
	audits []AIAuditEntry
}

type AIAuditEntry struct {
	Timestamp   time.Time `json:"timestamp"`
	Category    string    `json:"category"`
	Destination string    `json:"destination"`
	Allowed     bool      `json:"allowed"`
}

func NewGateway(policy AIPolicy) *Gateway {
	return &Gateway{
		policy: policy,
		audits: make([]AIAuditEntry, 0),
	}
}

func (g *Gateway) HandleRequest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req AIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "malformed request payload"})
		return
	}

	decision, err := EvaluateAIRequest(req, g.policy)

	g.mu.Lock()
	g.audits = append(g.audits, AIAuditEntry{
		Timestamp:   time.Now(),
		Category:    req.Category,
		Destination: decision.Destination,
		Allowed:     decision.Allowed,
	})
	g.mu.Unlock()

	if err != nil {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"allowed": false,
			"error":   err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(decision)
}
