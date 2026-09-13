import { expect, test } from '@playwright/test';

/**
 * Regression coverage for the Metallic Radium dark theme.
 *
 * These assertions have to run in a real browser. jsdom resolves neither custom
 * property indirection nor color-mix(), and it does not composite a translucent
 * background against what sits behind it, so every value this file checks would
 * come back empty or unresolved in the Vitest suite. That is the same reason the
 * CSP defect survived 104 passing unit tests.
 *
 * The specific hazard being guarded is a luminance inversion. The previous dark
 * accent, #38bdf8, was mid-dark and carried white text. Radium green is very
 * light, so anything that puts --text-primary on an accent fill becomes close to
 * unreadable while still looking deliberate in source. Contrast is therefore
 * asserted numerically rather than by eye.
 */

/** Relative luminance per WCAG 2.1, from an "rgb(r, g, b)" string. */
function luminance(color: string): number {
  const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0'])
    .slice(0, 3)
    .map((v) => {
      const c = Number(v) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test.describe('Metallic Radium dark theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>('.theme-select');
      if (select) {
        select.value = 'dark';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'dark');
  });

  test('resolves the cement foundation and the radium accent', async ({ page }) => {
    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const read = (name: string) => s.getPropertyValue(name).trim();
      return {
        bg: read('--bg-primary'),
        surface: read('--bg-secondary'),
        accent: read('--accent-primary'),
        onAccent: read('--text-on-accent'),
      };
    });

    expect(tokens.bg).toBe('#171a1c');
    expect(tokens.surface).toBe('#24292c');
    expect(tokens.accent).toBe('#b7ff3c');
    expect(tokens.onAccent).toBe('#172000');
  });

  test('the status aliases resolve instead of falling back', async ({ page }) => {
    // --color-success, --color-error and --color-warning were referenced by several
    // components but defined nowhere, so each var() silently used its hardcoded
    // fallback from the previous palette and ignored the theme in both modes.
    const aliases = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        success: s.getPropertyValue('--color-success').trim(),
        error: s.getPropertyValue('--color-error').trim(),
        warning: s.getPropertyValue('--color-warning').trim(),
        info: s.getPropertyValue('--color-info').trim(),
      };
    });

    expect(aliases.success).toBe('#68e875');
    expect(aliases.error).toBe('#ff6577');
    expect(aliases.warning).toBe('#ffc857');
    expect(aliases.info).toBe('#62c3ff');
  });

  test('every accent fill carries dark text at AA contrast', async ({ page }) => {
    // The inversion hazard: light text on the light accent would be unreadable.
    const samples = await page.evaluate(() => {
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-primary')
        .trim();

      // Normalise the token to the rgb() form getComputedStyle reports for used values.
      const probe = document.createElement('span');
      probe.style.color = accent;
      document.body.appendChild(probe);
      const accentRgb = getComputedStyle(probe).color;
      probe.remove();

      return [...document.querySelectorAll<HTMLElement>('a, button, .btn, .nav-item a')]
        .map((el) => {
          const cs = getComputedStyle(el);
          return { bg: cs.backgroundColor, color: cs.color, text: (el.textContent ?? '').trim() };
        })
        .filter((s) => s.bg === accentRgb)
        .map((s) => ({ ...s, accentRgb }));
    });

    // The dashboard has primary actions and an active nav item, so this must not
    // vacuously pass by finding nothing filled with the accent.
    expect(samples.length).toBeGreaterThan(0);

    for (const sample of samples) {
      expect(
        contrast(sample.color, sample.bg),
        `"${sample.text}" is ${sample.color} on the accent fill ${sample.bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('body text clears AA against the surfaces it sits on', async ({ page }) => {
    const ratios = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const used = (token: string) => {
        probe.style.color = s.getPropertyValue(token).trim();
        return getComputedStyle(probe).color;
      };
      const out = {
        text: used('--text-primary'),
        secondary: used('--text-secondary'),
        bg: used('--bg-primary'),
        surface: used('--bg-secondary'),
      };
      probe.remove();
      return out;
    });

    expect(contrast(ratios.text, ratios.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ratios.text, ratios.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ratios.secondary, ratios.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ratios.secondary, ratios.surface)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps the accent rationed rather than spread across the page', async ({ page }) => {
    // The theme's own guidance is 10% or less. Badges are metadata, not actions,
    // and previously carried the accent on every card; the accent has to stay a
    // signal for "interactive" to mean anything.
    const accentFilledArea = await page.evaluate(() => {
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-primary')
        .trim();
      const probe = document.createElement('span');
      probe.style.color = accent;
      document.body.appendChild(probe);
      const accentRgb = getComputedStyle(probe).color;
      probe.remove();

      let accented = 0;
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (getComputedStyle(el).backgroundColor !== accentRgb) continue;
        const r = el.getBoundingClientRect();
        accented += r.width * r.height;
      }
      return accented / (window.innerWidth * window.innerHeight);
    });

    expect(accentFilledArea).toBeGreaterThan(0);
    expect(accentFilledArea).toBeLessThan(0.1);
  });

  test('the light theme keeps a dark accent with light text on it', async ({ page }) => {
    await page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>('.theme-select');
      if (select) {
        select.value = 'light';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'light');

    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        accent: s.getPropertyValue('--accent-primary').trim(),
        onAccent: s.getPropertyValue('--text-on-accent').trim(),
        bg: s.getPropertyValue('--bg-primary').trim(),
      };
    });

    // The inverse of dark mode: a dark accent needs light text, so --text-on-accent
    // has to flip with the theme rather than being pinned to the dark-mode ink.
    expect(tokens.accent).toBe('#0284c7');
    expect(tokens.onAccent).toBe('#ffffff');
    expect(tokens.bg).toBe('#f8fafc');
  });
});
