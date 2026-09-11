import { test, expect } from '@playwright/test';

test.describe('Phase 3 Features - E2E Suite', () => {
  test('theme switcher cycles through light, dark, and system modes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Developer Toolbox' })).toBeVisible();

    const themeSelect = page.locator('.theme-select');
    await expect(themeSelect).toBeVisible();

    // Switch to Light
    await themeSelect.selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'light');

    // Switch to Dark
    await themeSelect.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-effective-theme', 'dark');

    // Switch to System
    await themeSelect.selectOption('system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  });

  test('git learning sandbox executes commands and advances commit graph', async ({ page }) => {
    await page.goto('/git');
    await expect(page.getByRole('heading', { name: 'Git Learning Sandbox' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '1. Introduction to Commits' })).toBeVisible();

    // Commit input
    const input = page.locator('input[placeholder*="git commit"]');
    await input.fill('git commit');
    await page.getByRole('button', { name: 'Run' }).click();

    await expect(page.getByText('$ git commit')).toBeVisible();
    await expect(page.getByText('Success')).toBeVisible();

    // Second commit to fulfill Level 1 goal
    await input.fill('git commit');
    await page.getByRole('button', { name: 'Run' }).click();

    await expect(page.getByText('Completed!')).toBeVisible({ timeout: 5000 });
  });

  test('algorithm visualizer executes sorting and graph steps', async ({ page }) => {
    await page.goto('/algorithms');
    await expect(page.getByRole('heading', { name: 'Algorithm Visualizer' })).toBeVisible();

    // Step forward button
    const stepBtn = page.getByRole('button', { name: 'Step ▶' });
    await expect(stepBtn).toBeVisible();

    await stepBtn.click();
    await expect(page.getByText('Step 2 of')).toBeVisible();
    await expect(page.getByText('Step Explanation:')).toBeVisible();
  });
});
