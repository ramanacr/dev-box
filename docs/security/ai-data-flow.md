# AI Model Gateway Data Flow and Privacy Controls

## Data Flow Diagram

```
[Developer Browser]
       │
       ▼ (1. Prompt composed)
[Consent Modal: AiConsentDialog]
       │  (Displays Destination & Redacted Preview)
       ▼ (2. Explicit User Consent Granted)
[Toolbox Server: /api/ai/evaluate]
       │
       ├──► [Pre-flight Secret Redaction Engine]
       │       - Matches tokens, bearer keys, passwords
       │       - Replaces with [REDACTED_SECRET]
       │
       ▼ (3. Authorized Prompt)
[Organization-Approved AI Gateway]
       │
       ▼ (4. Suggested Completion)
[Developer Workbench] (Rendered as informational suggestion only)
```

## Security Guarantees
- **No Background Submissions**: Keystrokes are never streamed to any model provider.
- **Redaction by Default**: Pattern scanners match GitHub tokens, AWS keys, JWTs, and database passwords before transmission.
- **Prompt Ephemerality**: Server memory discards prompts immediately after response delivery; audit events omit prompt text.
