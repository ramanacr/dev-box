# ADR 0005: AI Assistance Gateway Policy and Redaction Boundary

## Status

**Policy boundary implemented; provider gate NOT MET — the feature ships disabled.**

The Phase 4 plan requires an approved provider gateway, a data-processing agreement,
an allowed data classification, a retention policy, abuse controls, a model
evaluation set, and a cost limit to be recorded *before* the feature is enabled. Most
of those are organizational decisions that have not been made.

What *is* complete is the part the plan says to build first: "Implement policy before
provider code." The policy boundary exists, is tested, and refuses everything by
default. No model endpoint is called by any code in this repository.

## Decision gate

| Gate condition | Required | Recorded | Status |
| --- | --- | --- | --- |
| Approved provider/model gateway | Named | Operator-supplied via `TOOLBOX_AI_GATEWAY_URL`; none approved | **NOT MET** |
| Data-processing agreement | Signed | Not recorded | **NOT MET** |
| Allowed data classification | Approved | Defaults to `public` only; operator must opt in explicitly | Enforced, not yet approved |
| Retention policy | Documented | Not recorded | **NOT MET** |
| Abuse controls | Documented | Token budget and consent enforced in code | Partial |
| Model evaluation set | Defined | Not defined | **NOT MET** |
| Cost limit | Set | `TOOLBOX_AI_TOKEN_BUDGET`, default 4096 tokens per prompt | Enforced, not yet approved |

`TOOLBOX_FEATURE_AI` must remain unset until the organizational rows are answered.

## Context

Developers may want help explaining a regular expression or a schema. The risk is
that a prompt carries proprietary source, internal hostnames, or credentials to a
third party. The product's first principle is that pasted text stays in the browser
unless the user explicitly sends it somewhere.

## Decision

Ship the decision boundary, not a model client.

`POST /api/ai/evaluate` returns an `AIDecision` — allowed or not, the redacted text
that *would* be sent, the destination, the estimated token count, and a notice. It
does not call a provider. The UI shows that decision to the user for consent before
anything leaves. Wiring a provider is a separate change that requires this ADR's gate
rows to be filled in first.

## Controls enforced by the implementation

1. **Disabled by default.** A policy with `Enabled: false` denies every request.
2. **Explicit consent per request.** `userConsent: false` is denied; consent is not
   remembered or inferred.
3. **Restricted data never leaves.** The `restricted` classification is refused even
   if an operator lists it as allowed — a classification that can be configured away
   is not a control.
4. **Unclassified means internal, not public.** An omitted classification is treated
   as `internal`, which is denied under the default public-only policy. The safe
   reading of an unlabelled prompt pasted into a private workbench is that it is at
   least internal.
5. **Pre-flight redaction.** API keys, passwords, bearer and basic authorization
   headers, GitHub and OpenAI-style tokens, JWTs, database connection strings, and
   PEM private-key headers are replaced with `[REDACTED_SECRET]` before the decision
   is returned. Redaction preserves surrounding text so the prompt stays useful.
6. **Token budget enforced on the redacted text**, which is what would actually be
   transmitted. Over-budget prompts are refused before any network call is possible.
7. **No autonomous execution.** The decision carries a notice stating that output is
   a suggestion; nothing in the product executes a generated command or request.
8. **Audit without prompt text.** Audit entries hold timestamp, category,
   destination, and the allow/deny outcome. Prompts and completions are never stored.

## Consequences

- The privacy boundary is reviewable and testable before any provider integration
  exists, which is the ordering the plan asks for.
- An operator cannot accidentally enable AI: the flag alone is rejected without a
  gateway URL, and the default classification policy denies everything but `public`.
- Redaction is pattern-based and therefore not exhaustive. It reduces accidental
  disclosure; it is not a guarantee. This is why consent shows the user the exact
  redacted text rather than asserting the prompt is safe.

## Verification

- `go test ./internal/ai` covers disabled denial, missing consent, empty prompt,
  destination disclosure, seven classes of secret redaction asserted by absence of the
  secret, redaction preserving context, restricted-data denial, restricted denial even
  when configured as allowed, unapproved classification denial, the public-only
  default, token-budget enforcement, and that the budget measures the redacted text.
- `go test ./internal/features` proves `/api/ai/evaluate` exists only when the flag is
  set, reports a health status, and denies a request without consent.
- Live check against a running container with the flag enabled returned
  `{"allowed":false,"error":"data classification is not approved for transmission: \"restricted\""}`
  for restricted input, and a redacted prompt with the destination disclosed for
  approved input.
