import { defineConfig, devices } from '@playwright/test';

/**
 * Beta Environment E2E Testing Configuration
 *
 * Purpose: Full integration testing against deployed beta environment
 * Target: https://beta.myexperiment.life
 *
 * Characteristics:
 * - Tests against deployed beta server with real backend
 * - ALL tests run (no skips) - full E2E coverage
 * - Tests authentication, database operations, invite codes
 * - Gates production deployment (must pass before prod deploy)
 * - Used in CI after beta deployment succeeds
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /* More retries for network flakiness in deployed environment */
  retries: 3,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/beta-results.json' }]
  ],

  use: {
    baseURL: 'https://beta.myexperiment.life',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    /* Longer timeouts for network requests to deployed environment */
    actionTimeout: 15000,
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* No webServer needed - testing deployed environment */
});
