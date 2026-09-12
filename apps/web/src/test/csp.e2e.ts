import { expect, test } from '@playwright/test';

/**
 * Regression coverage for docs/adr/0006-content-security-policy-style-src.md.
 *
 * These assertions cannot live in the Vitest suite: jsdom does not enforce CSP, which
 * is precisely why the original "style-src 'self'" policy shipped while silently
 * stripping every inline style attribute in the UI. They must run in a real browser
 * against the real response headers.
 */
test.describe('Content Security Policy enforcement', () => {
  test('serves the expected policy with a strict script-src', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const csp = response?.headers()['content-security-policy'] ?? '';

    // The directives that keep remote and injected code out.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");

    // script-src must never be relaxed, whatever else changes.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*\*/);

    // The deliberate, documented relaxation.
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  test('applies inline style attributes so module layout is not stripped', async ({ page }) => {
    await page.goto('/');

    const applied = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.setAttribute('style', 'text-align:center;padding:40px');
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe);
      const result = {
        textAlign: computed.textAlign,
        padding: computed.padding,
      };
      probe.remove();
      return result;
    });

    expect(applied.textAlign).toBe('center');
    expect(applied.padding).toBe('40px');
  });

  test('still blocks inline script execution', async ({ page }) => {
    await page.goto('/');

    const executed = await page.evaluate(() => {
      const marker = '__csp_inline_script_probe__';
      const script = document.createElement('script');
      script.textContent = `window.${marker} = true;`;
      document.body.appendChild(script);
      const ran = (window as unknown as Record<string, unknown>)[marker] === true;
      script.remove();
      return ran;
    });

    expect(executed).toBe(false);
  });

  test('renders real module layout with flex and grid containers intact', async ({ page }) => {
    await page.goto('/diagrams');

    // DiagramPage sets its column layout through an inline style attribute. If CSP
    // strips it the container falls back to `display: block`.
    const gridDisplay = await page
      .locator('div[style*="grid"]')
      .first()
      .evaluate((el) => getComputedStyle(el).display);

    expect(gridDisplay).toBe('grid');
  });
});
