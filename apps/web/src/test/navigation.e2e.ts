import { expect, test } from '@playwright/test';

/**
 * Regression coverage for the sidebar navigation.
 *
 * The shell moved from a horizontal header to a vertical rail, which is a change
 * to the one component present on every page. These assertions cover the parts
 * that are easy to break silently: the grouping that makes eighteen destinations
 * scannable, the collapse preference surviving a reload, and the skip link — which
 * only reveals itself under real keyboard focus and so cannot be checked from a
 * script that merely calls .focus().
 */

test.describe('Sidebar navigation', () => {
  test('groups the tools under headings', async ({ page }) => {
    await page.goto('/');

    const nav = page.locator('nav[aria-label="Tool navigation"]');
    await expect(nav).toBeVisible();

    // Grouping is the part that actually simplifies a list this long; a flat rail
    // would pass every other assertion here.
    for (const heading of ['Reference', 'Data', 'Text', 'Web & APIs', 'Create', 'Learn']) {
      await expect(nav.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('every entry carries a label and its own icon', async ({ page }) => {
    await page.goto('/');

    const links = page.locator('nav[aria-label="Tool navigation"] .nav-item a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(18);

    // One icon per link, and no two links drawing the same glyph — an icon that has
    // to be told apart from its neighbour by position alone is not doing its job.
    const glyphs = await page.evaluate(() =>
      [...document.querySelectorAll('nav[aria-label="Tool navigation"] .nav-item a')].map((a) => ({
        label: a.querySelector('.nav-label')?.textContent?.trim() ?? '',
        glyph: a.querySelector('svg.nav-icon')?.innerHTML ?? '',
      })),
    );

    expect(glyphs).toHaveLength(count);
    for (const { label, glyph } of glyphs) {
      expect(label).not.toBe('');
      expect(glyph).not.toBe('');
    }
    expect(new Set(glyphs.map((g) => g.glyph)).size).toBe(glyphs.length);
  });

  test('marks the current destination without filling the rail with the accent', async ({
    page,
  }) => {
    await page.goto('/docs');

    const active = page.locator('nav[aria-label="Tool navigation"] .nav-item a.active');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('aria-current', 'page');
    await expect(active).toContainText('Documentation');
  });

  test('remembers the collapsed state across a reload', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.locator('.app-sidebar');
    const toggle = page.getByRole('button', { name: /navigation/i });

    await expect(sidebar).not.toHaveClass(/collapsed/);
    const expandedWidth = (await sidebar.boundingBox())?.width ?? 0;
    expect(expandedWidth).toBeGreaterThan(150);

    await toggle.click();
    await expect(sidebar).toHaveClass(/collapsed/);

    // The rail animates its width, so the box has to be polled rather than sampled:
    // reading it the instant the class flips catches a frame mid-transition and the
    // comparison fails for a reason that has nothing to do with the behaviour.
    await expect
      .poll(async () => (await sidebar.boundingBox())?.width ?? expandedWidth, {
        timeout: 2000,
      })
      .toBeLessThan(expandedWidth);

    // Labels go, icons stay: the rail is still navigable when collapsed.
    await expect(page.locator('.nav-label').first()).toBeHidden();
    await expect(page.locator('svg.nav-icon').first()).toBeVisible();

    await page.reload();
    await expect(page.locator('.app-sidebar')).toHaveClass(/collapsed/);
    // No need to restore the preference: each test gets its own browser context, so
    // the stored value does not reach another test, and clicking again here only
    // adds a second thing to race.
  });

  test('reveals the skip link on the first Tab and jumps to the content', async ({ page }) => {
    await page.goto('/');

    const skip = page.locator('.skip-link');
    // Off-screen until focused, which is the whole point of the pattern.
    expect((await skip.boundingBox())?.y ?? 0).toBeLessThan(0);

    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect
      .poll(async () => (await skip.boundingBox())?.y ?? -1, { timeout: 2000 })
      .toBeGreaterThanOrEqual(0);

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('collapses to icons on a narrow viewport regardless of preference', async ({ page }) => {
    // Sized before navigating, so the media query applies at first paint and the
    // rail never animates down from its wide width.
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');

    // The media query wins over the stored preference: 236px of a phone screen is
    // most of the page.
    await expect(page.locator('.nav-label').first()).toBeHidden();
    await expect(page.locator('svg.nav-icon').first()).toBeVisible();
    await expect
      .poll(async () => (await page.locator('.app-sidebar').boundingBox())?.width ?? 999, {
        timeout: 2000,
      })
      .toBeLessThan(80);
  });

  test('navigates when an entry is chosen', async ({ page }) => {
    await page.goto('/');

    await page.locator('nav[aria-label="Tool navigation"]').getByRole('link', { name: 'Cron' }).click();
    await expect(page).toHaveURL(/\/cron$/);
    await expect(page.locator('.nav-item a.active')).toContainText('Cron');
  });
});
