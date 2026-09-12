import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage for documentation search against the shipped content pack.
 *
 * Assertions are deliberately about behaviour rather than specific document titles,
 * so adding or rewording content does not break them — with one exception: the
 * source filter must reflect the pack, which is the regression this file exists to
 * prevent.
 */

test.describe('Documentation search', () => {
  test('serves the page and lists the pack sources in the filter', async ({ page }) => {
    const response = await page.goto('/docs');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Documentation Search' })).toBeVisible();

    // The filter used to be a hardcoded list of four names, so sources added to the
    // pack became unreachable. It is now derived from /api/docs/sources.
    const filter = page.getByLabel('Filter documentation source');
    const options = filter.locator('option');

    await expect
      .poll(async () => options.count(), { timeout: 5000 })
      .toBeGreaterThan(5);

    // Each option names a source and its document count.
    const labels = await options.allTextContents();
    expect(labels[0]).toMatch(/All sources/i);
    for (const label of labels.slice(1)) {
      expect(label).toMatch(/\(\d+\)$/);
    }
  });

  test('the source list matches what the API reports', async ({ page, request }) => {
    const apiSources = await (await request.get('/api/docs/sources')).json();
    expect(Array.isArray(apiSources)).toBe(true);
    expect(apiSources.length).toBeGreaterThan(5);

    await page.goto('/docs');
    const options = page.getByLabel('Filter documentation source').locator('option');

    await expect
      .poll(async () => options.count(), { timeout: 5000 })
      .toBe(apiSources.length + 1); // + "All sources"
  });

  test('finds a document and renders a clean snippet', async ({ page }) => {
    await page.goto('/docs');

    const input = page.getByLabel('Documentation search');
    await input.fill('catastrophic backtracking');
    await input.press('Enter');

    const results = page.locator('#docs-search-results');
    await expect(results).toBeVisible({ timeout: 10000 });

    // A snippet is an excerpt of the document HTML, so it must be rendered as text
    // rather than showing structural tags.
    const text = (await results.textContent()) ?? '';
    expect(text).not.toContain('<h2>');
    expect(text).not.toContain('</p>');
    expect(text).not.toContain('&lt;');

    // The highlight the server produced is the one piece of markup kept.
    await expect(results.locator('mark').first()).toBeVisible();
  });

  test('opens a result and keeps the id in the URL', async ({ page }) => {
    await page.goto('/docs');

    const input = page.getByLabel('Documentation search');
    await input.fill('window function');
    await input.press('Enter');

    await expect(page.locator('#docs-search-results')).toBeVisible({ timeout: 10000 });
    await page.locator('#docs-search-results li').first().click();

    await expect(page).toHaveURL(/\/docs\?id=/);

    // The rendered body keeps the allowlisted structural tags.
    await expect(page.locator('main h2').first()).toBeVisible();

    // A reload must restore the same document from the URL alone.
    await page.reload();
    await expect(page).toHaveURL(/\/docs\?id=/);
    await expect(page.locator('main h2').first()).toBeVisible();
  });

  test('narrows results with the source filter', async ({ page }) => {
    await page.goto('/docs');

    const filter = page.getByLabel('Filter documentation source');
    await expect.poll(async () => filter.locator('option').count()).toBeGreaterThan(5);

    const input = page.getByLabel('Documentation search');
    await input.fill('index');
    await input.press('Enter');
    await expect(page.locator('#docs-search-results')).toBeVisible({ timeout: 10000 });

    const unfiltered = await page.locator('#docs-search-results li').count();
    expect(unfiltered).toBeGreaterThan(0);

    await filter.selectOption('sql');
    await expect(page.locator('#docs-search-results')).toBeVisible({ timeout: 10000 });

    // Every remaining result is labelled with the chosen source.
    const badges = await page.locator('#docs-search-results li').allTextContents();
    for (const badge of badges) {
      expect(badge).toContain('sql');
    }
  });

  test('reports an empty result set without an error', async ({ page }) => {
    await page.goto('/docs');

    const input = page.getByLabel('Documentation search');
    await input.fill('zzzznosuchtermanywhere');
    await input.press('Enter');

    await expect(page.getByText(/No documentation found/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('Documentation API', () => {
  test('returns ranked results with highlights', async ({ request }) => {
    const response = await request.get('/api/docs/search?q=idempotent&limit=5');
    expect(response.status()).toBe(200);

    const results = await response.json();
    expect(results.length).toBeGreaterThan(0);

    // bm25 returns smaller values for better matches, so scores ascend.
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i - 1].score);
    }

    const first = results[0];
    expect(first.id).toMatch(/^[a-z-]+\//);
    expect(first.title).not.toBe('');
    expect(first.snippet).toContain('<mark>');
  });

  test('rejects an out-of-range limit', async ({ request }) => {
    expect((await request.get('/api/docs/search?q=index&limit=51')).status()).toBe(400);
    expect((await request.get('/api/docs/search?q=index&limit=0')).status()).toBe(400);
  });

  test('does not leak an engine error for hostile query syntax', async ({ request }) => {
    for (const query of ['%22unterminated', 'NEAR(a%20b)', '*', '(((']) {
      const response = await request.get(`/api/docs/search?q=${query}`);
      expect([200, 400]).toContain(response.status());

      const body = (await response.text()).toLowerCase();
      expect(body).not.toContain('fts5');
      expect(body).not.toContain('sqlite');
    }
  });

  test('returns 404 for an unknown document', async ({ request }) => {
    expect((await request.get('/api/docs/no-such/document')).status()).toBe(404);
  });

  test('every document the search returns is retrievable', async ({ request }) => {
    const results = await (await request.get('/api/docs/search?q=request&limit=5')).json();
    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      const doc = await (await request.get(`/api/docs/${result.id}`)).json();
      expect(doc.id).toBe(result.id);
      expect(doc.bodyHtml.length).toBeGreaterThan(400);
      // Provenance travels with the document, which the licensing policy requires.
      expect(doc.attribution).not.toBe('');
    }
  });
});
