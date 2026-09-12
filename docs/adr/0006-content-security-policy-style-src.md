# ADR 0006: Permit inline style attributes in the Content Security Policy

## Status

Accepted — amends the CSP fixed in `developer-toolbox-phase-1-implementation-plan.md`, Task 2, Step 3.

## Context

Phase 1 mandated this exact response header:

```text
Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

The server emitted it correctly. However, CSP applies `style-src` to inline `style`
**attributes** whenever `style-src-attr` is not separately declared. The Preact UI
sets layout through 459 inline `style={{…}}` expressions across 26 files, so the
browser was silently dropping all of them.

This was verified in the running container rather than inferred. Injecting an element
carrying `style="text-align:center;padding:40px"` and reading it back produced
`text-align: start; padding: 0px` — the declarations never applied.

The unit suite could not detect this. All 104 tests run in jsdom, which does not
enforce CSP, so every affected component asserted correct behaviour while the shipped
product rendered with collapsed layout.

The affected declarations are load-bearing, not cosmetic: `display: flex` and
`flexDirection: column` on module shells, `height: 100%` on split panes,
`gridTemplateColumns` on the diagram page, the `1000px × 600px` whiteboard canvas
size, and `paddingLeft: ${depth * 16}px` for structured-data tree indentation.

## Options

1. **Refactor every inline style into CSS classes, keep `style-src 'self'`.**
   Spec-pure and consistent with the white paper's "CSS variables + small accessible
   component primitives" decision. But a meaningful subset of the values is computed
   at render time — tree depth indentation, conditional grid templates, canvas
   dimensions — and cannot be expressed as a static class. Those cases would still
   need a style attribute, or a nonce-carrying `<style>` element regenerated on every
   render, which costs more and enlarges the attack surface rather than reducing it.
   The strict header would therefore remain partly a fiction.

2. **Add `'unsafe-inline'` to `style-src` only.** One directive changes. Inline style
   attributes work. `script-src` is untouched.

3. **Use `'unsafe-hashes'` with per-declaration hashes.** Requires enumerating every
   distinct style string at build time and cannot cover computed values at all.

## Decision

Option 2. `style-src` becomes `'self' 'unsafe-inline'`. Every other directive is
unchanged:

```text
Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

The policy now lives in one place, `httpapi.ContentSecurityPolicy`, rather than being
duplicated as a literal at the call site.

## Evidence

- The white paper's actual requirement is "Apply a restrictive Content Security
  Policy. Do not allow arbitrary remote scripts, fonts, or images." That requirement
  is still met in full: `default-src 'self'`, `script-src 'self'`, `connect-src
  'self'`, `img-src 'self' data: blob:`, `object-src 'none'`, `base-uri 'none'`, and
  `frame-ancestors 'none'` are all retained. No remote origin is permitted for any
  resource type. The header text was a Phase 1 delivery-level choice, not a Product
  Owner constraint.
- `script-src 'self'` — the directive that actually prevents script injection — is
  unchanged and carries neither `'unsafe-inline'` nor `'unsafe-eval'`.
- Permitting inline styles does not enable script execution. The residual risk is
  CSS-based UI redressing and selector-based exfiltration of attribute values, both of
  which require an existing HTML-injection primitive. The product's injection surface
  is documentation HTML, which is passed through the restrictive sanitizer allowlist in
  `apps/web/src/modules/docs/sanitize.ts` that strips `style`, `script`, `iframe`,
  `form`, and all event attributes before render.

## Consequences

- The shipped UI lays out as designed. This is the fix for the highest-severity item
  in `docs/release/alignment-audit.md`.
- `internal/httpapi.ContentSecurityPolicy` is the single source of truth for the
  policy.
- `TestSecurityHeaders` now asserts the full policy string *and* asserts separately
  that `script-src` never gains `'unsafe-inline'`, `'unsafe-eval'`, or a wildcard, so
  a future edit cannot quietly relax the control that matters.
- A Playwright test (`apps/web/src/test/csp.e2e.ts`) verifies in a real
  CSP-enforcing browser that inline style attributes apply and that inline *scripts*
  are still blocked. This closes the jsdom blind spot that let the defect ship.

## Verification

- `go test ./internal/httpapi -run TestSecurityHeaders`
- `pnpm --filter @toolbox/web e2e -- csp.e2e.ts` against the built image.
- Re-running the original in-browser probe must now report that the injected style
  attribute computes to `text-align: center; padding: 40px`.
