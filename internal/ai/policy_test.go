package ai

import (
	"errors"
	"strings"
	"testing"
)

// approvedPolicy is an operator configuration that has passed the ADR 0005 gate:
// a named destination, a token budget, and an explicit list of data classes that may
// leave the installation.
func approvedPolicy() AIPolicy {
	return AIPolicy{
		Enabled:                true,
		ApprovedDestination:    "https://llm.internal.corp/v1",
		MaxTokens:              1024,
		AllowedClassifications: []string{ClassificationPublic, ClassificationInternal},
	}
}

func TestDisabledFeatureDenies(t *testing.T) {
	policy := approvedPolicy()
	policy.Enabled = false

	decision, err := EvaluateAIRequest(AIRequest{Prompt: "Hello", UserConsent: true}, policy)
	if err == nil {
		t.Fatal("expected an error when the feature is disabled")
	}
	if decision.Allowed {
		t.Error("a disabled feature must never return an allowed decision")
	}
}

func TestMissingConsentDenies(t *testing.T) {
	decision, err := EvaluateAIRequest(AIRequest{
		Prompt:         "Explain this code",
		UserConsent:    false,
		Classification: ClassificationInternal,
	}, approvedPolicy())

	if err == nil {
		t.Fatal("expected an error when consent is absent")
	}
	if decision.Allowed {
		t.Error("a request without consent must never be allowed")
	}
}

func TestEmptyPromptDenies(t *testing.T) {
	if _, err := EvaluateAIRequest(AIRequest{
		Prompt:         "   \n\t ",
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, approvedPolicy()); err == nil {
		t.Fatal("expected an error for a whitespace-only prompt")
	}
}

func TestApprovedDestinationIsReturned(t *testing.T) {
	decision, err := EvaluateAIRequest(AIRequest{
		Prompt:         "Explain this regular expression",
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, approvedPolicy())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !decision.Allowed {
		t.Fatal("expected the request to be allowed")
	}
	if decision.Destination != "https://llm.internal.corp/v1" {
		t.Errorf("unexpected destination %q", decision.Destination)
	}
	if decision.Notice == "" {
		t.Error("a decision must carry a user-facing notice")
	}
}

// TestSecretRedaction asserts the secret is actually gone, rather than merely that
// the output differs from the raw secret.
func TestSecretRedaction(t *testing.T) {
	cases := []struct {
		name   string
		prompt string
		secret string
	}{
		{"api key assignment", `Connect with api_key: 'sk_live_1234567890abcdef' to database`, "sk_live_1234567890abcdef"},
		{"bearer token", `curl -H "Authorization: Bearer abcdef1234567890xyz"`, "abcdef1234567890xyz"},
		{"github pat", "clone with ghp_" + strings.Repeat("a", 36), "ghp_" + strings.Repeat("a", 36)},
		{"openai key", "key is sk-" + strings.Repeat("b", 32), "sk-" + strings.Repeat("b", 32)},
		{"password", `password=SuperSecret123`, "SuperSecret123"},
		{"connection string", `postgres://user:pass@db.internal:5432/app`, "postgres://user:pass@db.internal:5432/app"},
		{"private key", "-----BEGIN RSA PRIVATE KEY-----", "-----BEGIN RSA PRIVATE KEY-----"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			decision, err := EvaluateAIRequest(AIRequest{
				Prompt:         tc.prompt,
				UserConsent:    true,
				Classification: ClassificationInternal,
			}, approvedPolicy())
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if strings.Contains(decision.RedactedInput, tc.secret) {
				t.Errorf("secret survived redaction in %q", decision.RedactedInput)
			}
			if !strings.Contains(decision.RedactedInput, "[REDACTED_SECRET]") {
				t.Errorf("expected a redaction marker, got %q", decision.RedactedInput)
			}
		})
	}
}

func TestRedactionPreservesSurroundingText(t *testing.T) {
	decision, err := EvaluateAIRequest(AIRequest{
		Prompt:         "Why does this fail when api_key: 'sk_live_1234567890abcdef' is set?",
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, approvedPolicy())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(decision.RedactedInput, "Why does this fail when") {
		t.Errorf("redaction must keep the useful context, got %q", decision.RedactedInput)
	}
	if !strings.Contains(decision.RedactedInput, "is set?") {
		t.Errorf("redaction must keep trailing context, got %q", decision.RedactedInput)
	}
}

func TestRestrictedDataIsDenied(t *testing.T) {
	decision, err := EvaluateAIRequest(AIRequest{
		Prompt:         "Summarise this customer record",
		UserConsent:    true,
		Classification: ClassificationRestricted,
	}, approvedPolicy())

	if !errors.Is(err, ErrRestrictedData) {
		t.Fatalf("expected ErrRestrictedData, got %v", err)
	}
	if decision.Allowed {
		t.Error("restricted data must never be allowed out")
	}
}

// TestRestrictedIsDeniedEvenIfOperatorAllowsIt proves the classification cannot be
// configured away.
func TestRestrictedIsDeniedEvenIfOperatorAllowsIt(t *testing.T) {
	policy := approvedPolicy()
	policy.AllowedClassifications = []string{ClassificationRestricted}

	if _, err := EvaluateAIRequest(AIRequest{
		Prompt:         "Restricted content",
		UserConsent:    true,
		Classification: ClassificationRestricted,
	}, policy); !errors.Is(err, ErrRestrictedData) {
		t.Fatal("restricted data must be denied even when listed as allowed")
	}
}

func TestUnapprovedClassificationIsDenied(t *testing.T) {
	policy := approvedPolicy()
	policy.AllowedClassifications = []string{ClassificationPublic}

	if _, err := EvaluateAIRequest(AIRequest{
		Prompt:         "Internal design notes",
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, policy); !errors.Is(err, ErrRestrictedData) {
		t.Fatal("internal data must be denied when only public is approved")
	}
}

// TestUnclassifiedRequestDefaultsToInternal documents the safe default: an omitted
// classification is not treated as public.
func TestUnclassifiedRequestDefaultsToInternal(t *testing.T) {
	publicOnly := approvedPolicy()
	publicOnly.AllowedClassifications = []string{ClassificationPublic}

	if _, err := EvaluateAIRequest(AIRequest{
		Prompt:      "no classification declared",
		UserConsent: true,
	}, publicOnly); err == nil {
		t.Fatal("an unclassified prompt must not be treated as public")
	}

	// With internal approved, the same request is accepted.
	if _, err := EvaluateAIRequest(AIRequest{
		Prompt:      "no classification declared",
		UserConsent: true,
	}, approvedPolicy()); err != nil {
		t.Fatalf("expected the request to be allowed once internal is approved: %v", err)
	}
}

func TestDefaultPolicyAllowsOnlyPublic(t *testing.T) {
	// A policy with no explicit classification list must behave as public-only.
	policy := AIPolicy{Enabled: true, ApprovedDestination: "https://llm.internal.corp/v1"}

	if _, err := EvaluateAIRequest(AIRequest{
		Prompt:         "internal notes",
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, policy); err == nil {
		t.Fatal("expected internal data to be denied under a default policy")
	}

	if _, err := EvaluateAIRequest(AIRequest{
		Prompt:         "public docs question",
		UserConsent:    true,
		Classification: ClassificationPublic,
	}, policy); err != nil {
		t.Fatalf("expected public data to be allowed: %v", err)
	}
}

// TestTokenBudgetEnforced covers the plan requirement that MaxTokens is actually
// applied; it was previously a configured field the evaluator never read.
func TestTokenBudgetEnforced(t *testing.T) {
	policy := approvedPolicy()
	policy.MaxTokens = 10 // ~40 characters

	decision, err := EvaluateAIRequest(AIRequest{
		Prompt:         strings.Repeat("token budget overflow ", 40),
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, policy)

	if !errors.Is(err, ErrTokenBudget) {
		t.Fatalf("expected ErrTokenBudget, got %v", err)
	}
	if decision.Allowed {
		t.Error("an over-budget prompt must not be allowed")
	}
	if decision.EstimatedTokens <= policy.MaxTokens {
		t.Errorf("expected the estimate to exceed the budget, got %d", decision.EstimatedTokens)
	}
}

func TestTokenBudgetAllowsPromptsWithinLimit(t *testing.T) {
	decision, err := EvaluateAIRequest(AIRequest{
		Prompt:         "Explain the difference between rebase and merge.",
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, approvedPolicy())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if decision.EstimatedTokens == 0 {
		t.Error("expected a non-zero token estimate")
	}
}

// TestTokenBudgetMeasuresRedactedText confirms the budget is applied to what would
// actually be transmitted.
func TestTokenBudgetMeasuresRedactedText(t *testing.T) {
	long := "ghp_" + strings.Repeat("a", 36)
	decision, err := EvaluateAIRequest(AIRequest{
		Prompt:         "check " + long,
		UserConsent:    true,
		Classification: ClassificationInternal,
	}, approvedPolicy())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if decision.EstimatedTokens != EstimateTokens(decision.RedactedInput) {
		t.Errorf("token estimate %d does not match the redacted text", decision.EstimatedTokens)
	}
}

func TestEstimateTokens(t *testing.T) {
	if got := EstimateTokens(""); got != 0 {
		t.Errorf("expected 0 tokens for an empty prompt, got %d", got)
	}
	if got := EstimateTokens("    "); got != 0 {
		t.Errorf("expected 0 tokens for whitespace, got %d", got)
	}
	if got := EstimateTokens("abcd"); got != 1 {
		t.Errorf("expected 1 token for 4 characters, got %d", got)
	}
	if got := EstimateTokens("abcde"); got != 2 {
		t.Errorf("expected 2 tokens for 5 characters, got %d", got)
	}
}
