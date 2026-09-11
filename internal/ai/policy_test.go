package ai

import (
	"testing"
)

func TestEvaluateAIRequest(t *testing.T) {
	policy := AIPolicy{
		Enabled:             true,
		ApprovedDestination: "https://llm.internal.corp/v1",
		MaxTokens:           1024,
	}

	// 1. Consent required
	_, err := EvaluateAIRequest(AIRequest{Prompt: "Explain this code", UserConsent: false}, policy)
	if err == nil {
		t.Fatalf("expected error when UserConsent is false")
	}

	// 2. Disabled policy denies
	disabledPolicy := policy
	disabledPolicy.Enabled = false
	_, err = EvaluateAIRequest(AIRequest{Prompt: "Hello", UserConsent: true}, disabledPolicy)
	if err == nil {
		t.Fatalf("expected error when policy is disabled")
	}

	// 3. Secret redaction
	reqWithSecrets := AIRequest{
		Prompt:      "Connect with api_key: 'sk_live_1234567890abcdef' to database",
		UserConsent: true,
	}
	dec, err := EvaluateAIRequest(reqWithSecrets, policy)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !dec.Allowed {
		t.Fatalf("expected decision to be allowed")
	}
	if dec.Destination != "https://llm.internal.corp/v1" {
		t.Fatalf("unexpected destination %s", dec.Destination)
	}
	if !containsRedacted(dec.RedactedInput) {
		t.Fatalf("expected api_key to be redacted, got: %s", dec.RedactedInput)
	}
}

func containsRedacted(s string) bool {
	return len(s) > 0 && (s != "sk_live_1234567890abcdef")
}
