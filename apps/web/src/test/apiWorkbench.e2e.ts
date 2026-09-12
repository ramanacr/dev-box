import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

test.describe('API Workbench - E2E Suite', () => {
  test('imports OpenAPI fixture, inspects operations, and previews endpoints', async ({ page }) => {
    await page.goto('/api-workbench');
    await expect(page.getByRole('heading', { name: 'API Workbench' })).toBeVisible();
    await expect(page.getByText('Import OpenAPI Specification')).toBeVisible();

    // Read fixture content
    const fixturePath = resolve(__dirname, '../modules/api/fixtures/pets.openapi.yaml');
    const fixtureYaml = readFileSync(fixturePath, 'utf8');

    // Paste YAML into textarea
    const textarea = page.locator('textarea').first();
    await textarea.fill(fixtureYaml);

    // Should load the parsed API
    await expect(page.getByText('Pet Store API')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('v1.0.0')).toBeVisible();

    // Operation list should show endpoints
    await expect(page.getByText('/pets/{petId}')).toBeVisible();

    // Select showPetById operation
    await page.getByText('/pets/{petId}').click();
    await expect(page.getByText('Info for a specific pet')).toBeVisible();

    // Verify code snippets section
    await expect(page.getByText('Code Snippets (cURL & C#)')).toBeVisible();
  });
});
