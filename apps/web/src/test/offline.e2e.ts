import { test, expect } from '@playwright/test';

test.describe('Developer Toolbox - Offline Capabilities', () => {
  test('workbench remains functional when client transitions to offline mode', async ({ page, context }) => {
    // Navigate to workbench while online
    await page.goto('/data');
    await expect(page.getByRole('heading', { name: 'Structured Data Workbench' })).toBeVisible();

    // Transition to offline mode (simulating offline development on an airplane or disconnected environment)
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Navigation indicator should display Offline
    await expect(page.locator('.status-indicator')).toContainText('Offline');

    // Local data transforms and conversions execute completely offline without network
    const inputArea = page.getByRole('textbox', { name: 'Data input' });
    await inputArea.fill('{"offlineTest":true}');
    await page.getByRole('button', { name: 'Format' }).click();

    const outputArea = page.getByRole('textbox', { name: 'Data output' });
    await expect(outputArea).toHaveValue(/{\n  "offlineTest": true\n}/);

    // Verify offline conversion to YAML without any outbound requests
    await page.getByRole('button', { name: 'Convert →' }).click();
    await expect(outputArea).toHaveValue(/offlineTest: true/);
  });
});
