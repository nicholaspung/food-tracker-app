import { defineConfig, devices } from '@playwright/test';

/**
 * Local Development E2E Testing Configuration
 *
 * Purpose: Fast feedback for PRs and local development
 * Target: http://localhost:1420
 *
 * Characteristics:
 * - Tests against local dev server
 * - Skips tests requiring deployed backend
 * - Focus on build validation, UI rendering, client-side logic
 * - Used in CI for pull requests and pre-deployment checks
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 10000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run local dev server before starting tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
