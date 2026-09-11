# ADR 0005: AI Assistance Gateway Policy and Redaction Boundary

## Status
Accepted (Gated)

## Context
Developers may desire assistance with regular expression explanation, schema generation, or code snippets. Direct outbound API calls from client browsers risk leaking credentials, secrets, proprietary source code, or internal database URLs.

## Decision
1. **Interactive Explicit Consent**: No prompt is ever dispatched to an AI model without explicit user confirmation displaying the target destination and classification category.
2. **Deterministic Pre-flight Redaction**: All API keys, passwords, database URLs, and bearer tokens are automatically stripped/replaced with `[REDACTED_SECRET]` prior to prompt transit.
3. **No Autonomous Execution**: AI outputs are strictly treated as suggestions and rendered as informational text. The platform strictly forbids automatic execution of AI-generated shell commands, file modifications, or API requests.
4. **Zero Prompt Retention**: Audit logging records timestamp, actor, category, and token budget count. Prompts and model completions are never written to audit tables.

## Consequences
- Protects user confidentiality and organization security boundaries.
- Preserves offline capabilities when no external AI gateway is enabled.
