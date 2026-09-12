import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';

/**
 * The end-to-end suite runs against the real Go server so that it exercises the
 * actual response headers, the SPA fallback, and the FTS5 search API. Without a
 * webServer entry the suite silently depended on someone having started a container
 * by hand, which is why it never ran in CI.
 *
 * Set PLAYWRIGHT_NO_SERVER=1 to test an already-running instance (for example the
 * built Docker image) instead of letting Playwright start one.
 */
const shouldStartServer = !process.env.PLAYWRIGHT_NO_SERVER;

export default defineConfig({
  testDir: './src/test',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(shouldStartServer
    ? {
        webServer: {
          // Runs the compiled server against the local build output and content
          // pack, so no Docker daemon is required to run the suite.
          command: 'node ./scripts/start-e2e-server.mjs',
          url: `${baseURL}/readyz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }
    : {}),
});
