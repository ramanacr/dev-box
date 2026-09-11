package ai

import (
	"errors"
	"regexp"
	"strings"
)

type AIRequest struct {
	Prompt       string `json:"prompt"`
	UserConsent  bool   `json:"userConsent"`
	Category     string `json:"category"` // "code_explanation", "regex_assistance", etc.
}

type AIPolicy struct {
	Enabled             bool
	ApprovedDestination string
	MaxTokens           int
}

type AIDecision struct {
	Allowed       bool   `json:"allowed"`
	RedactedInput string `json:"redactedInput"`
	Destination   string `json:"destination"`
	Notice        string `json:"notice"`
}

var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(api[_-]?key|secret|token|password|bearer)\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{8,})["']?`),
	regexp.MustCompile(`ghp_[A-Za-z0-9]{36}`),
	regexp.MustCompile(`ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+`), // JWT
}

func RedactSecrets(text string) string {
	res := text
	for _, p := range secretPatterns {
		res = p.ReplaceAllString(res, "[REDACTED_SECRET]")
	}
	return res
}

func EvaluateAIRequest(req AIRequest, policy AIPolicy) (AIDecision, error) {
	if !policy.Enabled {
		return AIDecision{Allowed: false}, errors.New("ai assistance feature is disabled on this server")
	}

	if !req.UserConsent {
		return AIDecision{Allowed: false}, errors.New("user consent is required prior to transmitting prompt to model gateway")
	}

	if strings.TrimSpace(req.Prompt) == "" {
		return AIDecision{Allowed: false}, errors.New("prompt text cannot be empty")
	}

	redacted := RedactSecrets(req.Prompt)

	return AIDecision{
		Allowed:       true,
		RedactedInput: redacted,
		Destination:   policy.ApprovedDestination,
		Notice:        "Prompt inspected and verified. Output will be labeled as AI suggestion; automatic execution is prohibited.",
	}, nil
}
