package ai

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Data classifications an AI request may declare. Only classifications the operator
// has approved may leave the installation.
const (
	ClassificationPublic     = "public"
	ClassificationInternal   = "internal"
	ClassificationRestricted = "restricted"
)

type AIRequest struct {
	Prompt      string `json:"prompt"`
	UserConsent bool   `json:"userConsent"`
	Category    string `json:"category"` // "code_explanation", "regex_assistance", etc.

	// Classification is the caller's declaration of what the prompt contains. An
	// empty value is treated as "internal": the safer of the two plausible defaults,
	// since anything pasted into a private workbench is at least internal.
	Classification string `json:"classification"`
}

type AIPolicy struct {
	Enabled             bool
	ApprovedDestination string
	MaxTokens           int

	// AllowedClassifications lists the data classes permitted to leave the
	// installation. Empty means only "public" is allowed.
	AllowedClassifications []string
}

type AIDecision struct {
	Allowed       bool   `json:"allowed"`
	RedactedInput string `json:"redactedInput"`
	Destination   string `json:"destination"`
	Notice        string `json:"notice"`

	// EstimatedTokens is the budget figure the decision was checked against.
	EstimatedTokens int `json:"estimatedTokens"`
}

// ErrRestrictedData is returned when a prompt's declared classification is not
// approved for transmission.
var ErrRestrictedData = errors.New("data classification is not approved for transmission")

// ErrTokenBudget is returned when a prompt exceeds the configured token budget.
var ErrTokenBudget = errors.New("prompt exceeds the configured token budget")

var secretPatterns = []*regexp.Regexp{
	// "Authorization: Bearer <token>" puts the separator before the scheme, so the
	// key/value pattern below does not cover it. Match the header and the bare
	// scheme-prefixed token form explicitly.
	regexp.MustCompile(`(?i)authorization\s*:\s*\S+(\s+\S+)?`),
	regexp.MustCompile(`(?i)\b(?:bearer|basic)\s+[A-Za-z0-9_\-\.=+/]{8,}`),
	regexp.MustCompile(`(?i)(api[_-]?key|secret|token|password|bearer)\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{8,})["']?`),
	regexp.MustCompile(`ghp_[A-Za-z0-9]{36}`),
	regexp.MustCompile(`ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+`), // JWT
	regexp.MustCompile(`sk-[A-Za-z0-9]{16,}`),
	regexp.MustCompile(`(?i)(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp)://[^\s"']+`),
	regexp.MustCompile(`-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----`),
}

func RedactSecrets(text string) string {
	res := text
	for _, p := range secretPatterns {
		res = p.ReplaceAllString(res, "[REDACTED_SECRET]")
	}
	return res
}

// EstimateTokens approximates the token count of a prompt.
//
// This is a deliberate approximation: the real tokenizer belongs to the model, and
// the gateway must be able to refuse an oversized prompt before any network call is
// made. Four characters per token is the widely used heuristic for English and code;
// it is applied to the redacted text because that is what would actually be sent.
func EstimateTokens(text string) int {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return 0
	}
	return (len(trimmed) + 3) / 4
}

// classificationAllowed reports whether a declared class may be transmitted.
func classificationAllowed(class string, policy AIPolicy) bool {
	normalized := strings.ToLower(strings.TrimSpace(class))
	if normalized == "" {
		normalized = ClassificationInternal
	}

	// Restricted data never leaves, regardless of configuration. Allowing an operator
	// to opt into exporting restricted content would make the classification
	// meaningless.
	if normalized == ClassificationRestricted {
		return false
	}

	allowed := policy.AllowedClassifications
	if len(allowed) == 0 {
		allowed = []string{ClassificationPublic}
	}
	for _, a := range allowed {
		if strings.ToLower(strings.TrimSpace(a)) == normalized {
			return true
		}
	}
	return false
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

	if !classificationAllowed(req.Classification, policy) {
		// The rejection names the class but never echoes the prompt.
		return AIDecision{Allowed: false}, fmt.Errorf("%w: %q", ErrRestrictedData, req.Classification)
	}

	redacted := RedactSecrets(req.Prompt)
	estimated := EstimateTokens(redacted)

	if policy.MaxTokens > 0 && estimated > policy.MaxTokens {
		return AIDecision{Allowed: false, EstimatedTokens: estimated},
			fmt.Errorf("%w: %d tokens estimated, limit is %d", ErrTokenBudget, estimated, policy.MaxTokens)
	}

	return AIDecision{
		Allowed:         true,
		RedactedInput:   redacted,
		Destination:     policy.ApprovedDestination,
		EstimatedTokens: estimated,
		Notice:          "Prompt inspected and verified. Output will be labeled as AI suggestion; automatic execution is prohibited.",
	}, nil
}
