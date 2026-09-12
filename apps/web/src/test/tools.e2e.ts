import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage for the modules the white paper lists under "Recommended
 * first-release modules" that no phase plan had scheduled.
 *
 * These run against the real server so they also exercise the SPA fallback for each
 * new client route — a route missing from the server's ClientRoutes list would 404
 * here rather than silently working only via in-app navigation.
 */

test.describe('Command Reference', () => {
  test('explains a command token by token', async ({ page }) => {
    const response = await page.goto('/command');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Command Reference' })).toBeVisible();

    const input = page.getByLabel('Shell command to explain');
    await input.fill('git commit -am "fix: handle empty input"');

    await expect(page.getByText('Records the staged changes as a new commit.')).toBeVisible();
    await expect(page.getByText('Uses this text as the commit message.')).toBeVisible();
    await expect(page.getByText('Stages every tracked file that has been modified or deleted.')).toBeVisible();
  });

  test('warns about a destructive command', async ({ page }) => {
    await page.goto('/command');

    await page.getByLabel('Shell command to explain').fill('rm -rf /var/data');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('rm -rf deletes without confirmation');
  });

  test('warns about a download piped into a privileged shell', async ({ page }) => {
    await page.goto('/command');

    await page
      .getByLabel('Shell command to explain')
      .fill('curl -sS https://get.example.com/install.sh | sudo bash');

    await expect(page.getByRole('alert')).toContainText(
      'Downloaded script piped straight into an interpreter',
    );
  });

  test('reports an unknown command instead of inventing an explanation', async ({ page }) => {
    await page.goto('/command');

    await page.getByLabel('Shell command to explain').fill('frobnicate --turbo');

    await expect(page.getByText(/not in the curated reference/i).first()).toBeVisible();
  });
});

test.describe('JSON Query', () => {
  test('runs a JSONPath filter over the sample document', async ({ page }) => {
    const response = await page.goto('/query');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'JSON Query' })).toBeVisible();

    // The default expression filters books over 10.
    await expect(page.getByText('Sword of Honour')).toBeVisible();

    await page.getByLabel('JSONPath expression').fill('$..price');
    await expect(page.getByText('19.95')).toBeVisible();
  });

  test('reports an invalid expression rather than failing silently', async ({ page }) => {
    await page.goto('/query');

    await page.getByLabel('JSONPath expression').fill('$.store.book[');

    await expect(page.getByRole('alert')).toContainText('Unbalanced');
  });
});

test.describe('Type Generator', () => {
  test('generates TypeScript and switches language', async ({ page }) => {
    const response = await page.goto('/types');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Type Generator' })).toBeVisible();
    await expect(page.getByText('export interface Product {')).toBeVisible();

    await page.getByLabel('Target language').selectOption('go');
    await expect(page.getByText('type Product struct {')).toBeVisible();

    await page.getByLabel('Target language').selectOption('rust');
    await expect(page.getByText('pub struct Product {')).toBeVisible();
  });
});

test.describe('JWT Inspector', () => {
  test('decodes a token and states that the signature was not verified', async ({ page }) => {
    const response = await page.goto('/jwt');
    expect(response?.status()).toBe(200);

    // Built in-page so no token is committed to the repository.
    const token = await page.evaluate(() => {
      const b64 = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return `${b64({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })}.${b64({
        sub: 'usr_123',
        iss: 'https://id.example.com',
        exp,
      })}.c2lnbmF0dXJl`;
    });

    await page.getByLabel('JWT to decode').fill(token);

    await expect(page.getByText('usr_123')).toBeVisible();
    await expect(page.getByText('https://id.example.com')).toBeVisible();
    // The product must never imply the token is valid from decoding alone.
    await expect(page.getByText('Signature not verified.')).toBeVisible();
  });

  test('flags an expired token using its own claims', async ({ page }) => {
    await page.goto('/jwt');

    const expired = await page.evaluate(() => {
      const b64 = (value: unknown) =>
        btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const exp = Math.floor(Date.now() / 1000) - 7200;
      return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ sub: 'usr_1', exp })}.c2ln`;
    });

    await page.getByLabel('JWT to decode').fill(expired);

    await expect(page.getByRole('alert')).toContainText('would reject it');
  });

  test('explains a malformed token', async ({ page }) => {
    await page.goto('/jwt');

    await page.getByLabel('JWT to decode').fill('not-a-jwt');

    await expect(page.getByRole('alert')).toContainText('three dot-separated segments');
  });
});

test.describe('Client route coverage', () => {
  // Every navigation entry must be deep-linkable: the server has to serve the SPA
  // shell for it, not a 404.
  const routes = [
    '/',
    '/docs',
    '/data',
    '/command',
    '/regex',
    '/text',
    '/query',
    '/types',
    '/jwt',
    '/code-image',
    '/api-workbench',
    '/diagrams',
    '/git',
    '/algorithms',
  ];

  for (const route of routes) {
    test(`serves ${route} on a direct request`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('nav[aria-label="Tool navigation"]')).toBeVisible();
    });
  }

  test('returns 404 for an unknown route', async ({ request }) => {
    const response = await request.get('/not-a-real-tool');
    expect(response.status()).toBe(404);
  });

  test('returns a JSON 404 for an unknown API path', async ({ request }) => {
    const response = await request.get('/api/not-a-real-endpoint');
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('application/json');
  });
});
