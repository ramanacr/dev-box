# ADR 0008: Metallic Radium replaces the dark theme

## Status

Accepted. Supersedes the dark palette introduced with the theme switcher in
`developer-toolbox-phase-3-implementation-plan.md`. The light theme is unchanged in
character.

## Context

The Product Owner supplied a theme specification — Metallic Radium — and asked for it
to replace the dark theme. It is recorded verbatim at
[`docs/design/metallic-radium-theme.md`](../design/metallic-radium-theme.md), which is
the source of truth for the palette; this ADR records the decisions taken while
applying it, and the ones where the implementation deliberately departs from it.

The stylesheet was already shaped for this: `:root` held the dark palette and
`[data-theme="light"]` overrode it, so replacing the dark theme meant replacing one
token block rather than editing 969 lines of rules.

## Decision

### The accent inverts in luminance, so text on it must invert too

The previous accent, `#38bdf8`, was mid-dark and carried white text. Radium green,
`#b7ff3c`, is very light and requires dark text (`#172000`, the specification's Radium
Ink).

This is the change's principal hazard. `color: var(--text-primary)` on an accent fill
reads as ordinary, careful code and produces roughly 1.1:1 — effectively invisible —
whereas the previous palette made the same line correct. A `--text-on-accent` token
therefore exists so the correct choice is the obvious one, and it is redefined per
theme rather than pinned to the dark-mode ink: the light theme's accent is dark and
needs white text, the exact inverse.

Three call sites already hardcoded `#000`, which was right by accident. They now use
the token.

### The accent is rationed, and badges are not part of its budget

The specification asks for roughly 70% cement foundation, 20% metallic surfaces and
**10% or less** accent, and warns that spreading it is what makes such a palette read
as a neon dashboard rather than an engineering interface.

Every dashboard card carried an accent-tinted badge, applied inline. That put the
accent on metadata, which is the one thing that erodes its meaning: if green marks
both "this is interactive" and "this is a label", it signals neither. Badges are now
neutral, and the accent is reserved for primary actions, the active navigation item,
focus rings, and the single brand mark in the header.

`theme.e2e.ts` asserts accent-filled area stays under 10% of the viewport, so this is
a checked property rather than an intention.

### Shape follows the specification; typography does not

Radii move to the specified 6/10/16.

**The specified `Inter` font is deliberately not adopted.** Loading a web font means a
network request, which contradicts the offline-first guarantee the product is built
around and is refused at runtime by the `connect-src 'self'` and `style-src 'self'`
directives recorded in [ADR 0006](0006-content-security-policy-style-src.md). Bundling
the font files instead would add substantially more to the image than the type choice
earns. The existing system-font stack is retained.

Anyone revisiting this should treat "the theme specifies Inter, so add Inter" as a
change that breaks two other decisions, not as an oversight to correct.

### Status colours stay distinct from the brand accent

The specification supplies Fresh Green, Electric Blue, Amber and Coral Red separately
from the radium accent, so status is never expressed with the interaction colour. The
search highlight (`mark`) was likewise kept in the amber family rather than promoted
to radium, for the same reason.

### HTTP method badges carry colour in the tint, not the label

Colouring each method label with its own status colour reached only **3.2:1 for
DELETE**. Tinting a background with the same hue raises its luminance as fast as the
text's, so no tint strength fixed it — this is a property of the approach, not a value
to tune. The tint and border carry the colour and the label stays `--text-primary`,
which is the pattern `.badge-ok` already used, and clears 6.5:1 at worst. The method
name is written out, so nothing depends on colour alone.

## Consequences

Contrast was computed rather than judged by eye, as the specification requires. Every
text-on-surface, text-on-accent and status-on-surface pair meets WCAG AA; the tightest
is error text on a card at 5.17:1, and primary text on the application background is
15.76:1.

Three pre-existing defects were found and fixed while applying the theme, all of which
had been invisible because they degraded silently:

- `--color-success`, `--color-error` and `--color-warning` were **defined nowhere**,
  yet referenced by 8 call sites across 3 components (`ApiPage`, `ResponseView`,
  `DiagramPage`), so each `var()` fell through to a hardcoded fallback from the
  original palette. Those elements had never followed the theme in either mode. They
  are now defined by indirection against the semantic tokens, so they resolve and
  follow both themes.
- `.badge` appears in 6 files but was styled only inside `.app-logo`. The header's own
  badge was therefore fine and the dashboard's carried inline styling, while the API
  version, response status, cron timezone and workspace badges rendered as unstyled
  text.
- `.nav-item a.active` declared `color` twice; the first declaration was dead.

Regression coverage lives in `apps/web/src/test/theme.e2e.ts` and cannot be unit
tested. jsdom resolves neither custom-property indirection nor `color-mix()`, and does
not composite translucent backgrounds — the same blind spot that allowed the CSP
defect in ADR 0006 to ship past 104 passing tests. The tests were confirmed
non-vacuous by inverting `--text-on-accent` and observing the suite fail at 1.09:1.

That confirmation exposed a fourth defect, in the test harness rather than the product:
Playwright's `webServer` used `reuseExistingServer: !CI`, and its default port is the
one `compose.yaml` publishes, so a local run adopted whatever container happened to be
listening instead of the build just produced. A deliberately broken stylesheet passed
the entire suite that way. It no longer reuses a found server; `PLAYWRIGHT_NO_SERVER=1`
remains the way to aim the suite at a running instance on purpose. CI was never
affected, having always started its own server.

CSS grew from 3.19 KB to 3.52 KB gzipped against a 50 KB budget. Initial JS is
unchanged.
