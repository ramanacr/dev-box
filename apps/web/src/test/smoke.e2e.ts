import { test, expect } from '@playwright/test';

test.describe('Developer Toolbox - Smoke Suite', () => {
  test('root page loads with correct title, navigation, and security headers', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const headers = response?.headers() || {};
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');

    await expect(page).toHaveTitle(/Developer Toolbox/);
    await expect(page.locator('nav[aria-label="Tool navigation"]')).toBeVisible();
  });

  test('navigates to docs and searches for topics', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByRole('heading', { name: 'Documentation Search' })).toBeVisible();

    const searchInput = page.getByRole('searchbox', { name: 'Documentation search' });
    await searchInput.fill('dependency injection');
    await searchInput.press('Enter');

    // Should display results
    await expect(page.locator('#docs-search-results')).toBeVisible({ timeout: 10000 });
  });

  test('formats JSON and inspects tree in structured data workbench', async ({ page }) => {
    await page.goto('/data');
    await expect(page.getByRole('heading', { name: 'Structured Data Workbench' })).toBeVisible();

    const inputArea = page.getByRole('textbox', { name: 'Data input' });
    await inputArea.fill('{"toolbox":"active","version":1}');

    await page.getByRole('button', { name: 'Format' }).click();
    const outputArea = page.getByRole('textbox', { name: 'Data output' });
    await expect(outputArea).toHaveValue(/{\n  "toolbox": "active",\n  "version": 1\n}/);

    await page.getByRole('button', { name: 'Tree View' }).first().click();
    await expect(page.locator('div.code-editor')).toContainText('toolbox');
  });

  test('evaluates regular expressions with match extraction', async ({ page }) => {
    await page.goto('/regex');
    await expect(page.getByRole('heading', { name: 'ECMAScript Regex Workbench' })).toBeVisible();

    const patternInput = page.getByRole('textbox', { name: 'Regular expression pattern' });
    await patternInput.fill('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}');

    const testInput = page.getByRole('textbox', { name: 'Regex test input text' });
    await testInput.fill('Please contact test@example.com for help.');

    await expect(page.getByRole('heading', { name: 'Match Results & Replacement' })).toBeVisible();
    await expect(page.locator('ul').filter({ hasText: 'test@example.com' })).toBeVisible();
  });

  test('triggers redaction warning dialog before downloading text containing secrets', async ({ page }) => {
    await page.goto('/text');
    await expect(page.getByRole('heading', { name: 'Developer Utilities: Text, Hashes & UUID' })).toBeVisible();

    const textInput = page.getByRole('textbox', { name: 'Text input' });
    await textInput.fill('Authorization: Bearer secret-production-token-value-here');

    // Click Base64 Encode then Download
    await page.getByRole('button', { name: 'HTML Escape' }).click();
    await page.getByRole('button', { name: 'Download (Safe)' }).click();

    // Redaction modal prompt should appear
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toContainText('Sensitive Information Detected');
  });
});
