<!--
Supplied by the Product Owner and reproduced verbatim. This file is the source of
truth for the palette: change a colour here first, then in
apps/web/src/app/styles/global.css, which mirrors these values as design tokens.

The implementation departs from this document in one respect, deliberately. The CSS
token block below names Inter first; the application does not adopt it, because
loading a web font requires a network request that contradicts the offline-first
guarantee and is refused by the Content Security Policy. See
docs/adr/0008-metallic-radium-dark-theme.md for that decision and the others taken
while applying this specification.
-->

# Metallic Radium Web App Theme

## Theme concept

The **Metallic Radium** theme combines a premium, dark industrial foundation with a restrained luminous accent:

- **Metallic cement** provides the application background, surfaces, borders, and structural elements.
- **Light metallic radium green** highlights primary actions, active navigation, selections, keyboard focus, progress, and important states.

The intended visual identity is **precise, engineered, modern, and energetic**—metallic without artificial chrome effects, and luminous without resembling fluorescent safety equipment.

## Core color palette

| Purpose | Color name | Hex |
|---|---|---:|
| Application background | Carbon Cement | `#171A1C` |
| Main surface | Metallic Cement | `#24292C` |
| Elevated surface | Brushed Cement | `#303639` |
| Hovered surface | Polished Cement | `#383F42` |
| Standard border | Steel Edge | `#485054` |
| Subtle border | Dark Steel | `#353B3E` |
| Primary accent | Light Radium Green | `#B7FF3C` |
| Accent hover | Bright Radium | `#C9FF70` |
| Accent pressed | Deep Radium | `#8FD622` |
| Primary text | Soft White | `#F1F4EF` |
| Secondary text | Cement Silver | `#AAB2B0` |
| Disabled text | Muted Steel | `#707876` |
| Text on green | Radium Ink | `#172000` |

## Semantic colors

| State | Color | Hex |
|---|---|---:|
| Success | Fresh Green | `#68E875` |
| Information | Electric Blue | `#62C3FF` |
| Warning | Amber | `#FFC857` |
| Error | Coral Red | `#FF6577` |

These semantic colors remain distinct from the radium brand accent, helping users identify status without relying on one color for every meaning.

## Recommended color distribution

- **70% — cement foundation:** application backgrounds and large structural areas.
- **20% — metallic surfaces:** cards, dialogs, sidebars, tables, borders, and raised controls.
- **10% or less — radium accent:** primary actions, active states, focus indicators, and small highlights.

Avoid using radium green across large panels. Its visual impact and premium character depend on selective use.

## Component guidance

### Navigation

- Use Carbon Cement for the navigation container.
- Use Cement Silver for inactive labels.
- Use Soft White for hovered labels.
- Indicate the active destination with a narrow Radium Green marker, icon, or restrained tinted background.

### Buttons

- Primary buttons use Radium Green with dark text.
- Secondary buttons use a cement surface with a Steel Edge border.
- Destructive buttons use Error Red rather than radium green.
- Avoid applying a glow to every button; reserve it for the principal call to action.

### Cards and dialogs

- Use Metallic Cement for normal cards.
- Use Brushed Cement for dialogs and raised surfaces.
- Combine a subtle border with a soft dark shadow to create depth.
- Avoid literal metallic textures, strong gradients, or reflective chrome effects behind text.

### Forms

- Use the dark application background or main surface inside inputs.
- Use Steel Edge for default input borders.
- Use Radium Green for focused borders and accessible focus rings.
- Keep placeholder text lighter than disabled text but dimmer than ordinary content.

### Tables and data-heavy screens

- Use alternating cement shades only when they materially improve row tracking.
- Use a translucent radium tint for selected rows.
- Keep table headers neutral so green retains its meaning as an interaction signal.

## CSS design tokens

```css
:root {
  color-scheme: dark;

  /* Backgrounds and surfaces */
  --color-bg: #171a1c;
  --color-surface: #24292c;
  --color-surface-raised: #303639;
  --color-surface-hover: #383f42;

  /* Borders */
  --color-border: #485054;
  --color-border-subtle: #353b3e;

  /* Brand accent */
  --color-primary: #b7ff3c;
  --color-primary-hover: #c9ff70;
  --color-primary-active: #8fd622;
  --color-primary-muted: rgba(183, 255, 60, 0.14);
  --color-primary-glow: rgba(183, 255, 60, 0.28);

  /* Text */
  --color-text: #f1f4ef;
  --color-text-secondary: #aab2b0;
  --color-text-disabled: #707876;
  --color-text-on-primary: #172000;

  /* Status */
  --color-success: #68e875;
  --color-info: #62c3ff;
  --color-warning: #ffc857;
  --color-error: #ff6577;

  /* Interaction and depth */
  --focus-ring: 0 0 0 3px rgba(183, 255, 60, 0.32);
  --shadow-raised:
    0 12px 30px rgba(0, 0, 0, 0.28),
    inset 0 1px rgba(255, 255, 255, 0.04);

  /* Shape */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
}
```

## Example foundation styles

```css
body {
  margin: 0;
  color: var(--color-text);
  background: var(--color-bg);
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-raised);
}

.button-primary {
  color: var(--color-text-on-primary);
  background: linear-gradient(
    135deg,
    var(--color-primary-hover),
    var(--color-primary)
  );
  border: 1px solid #d8ff96;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 18px var(--color-primary-glow);
  font-weight: 650;
}

.button-primary:hover {
  background: var(--color-primary-hover);
}

.button-primary:active {
  background: var(--color-primary-active);
  box-shadow: none;
}

:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

## Accessibility notes

- Use dark text (`#172000`) on Radium Green buttons rather than white text.
- Never communicate success, errors, selection, or focus through color alone; include an icon, label, border, or another visible indicator.
- Retain a clear keyboard focus ring on all interactive elements.
- Verify final component combinations against WCAG contrast requirements, particularly secondary text, disabled controls, tinted backgrounds, and small text.
- Treat metallic effects as decorative surface details; they must never reduce text legibility.

## Design summary

Use metallic cement as the stable visual structure and radium green as the application's energy. The result should feel like a refined engineering interface—not a gaming UI or a neon dashboard.
