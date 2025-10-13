import { defineConfig, devices } from '@playwright/test';

/**
 * Production Smoke Testing Configuration
 *
 * Purpose: Quick validation of production deployment
 * Target: https://myexperiment.life
 *
 * Characteristics:
 * - Tests critical user flows only (smoke tests)
 * - Runs after production deployment (optional)
 * - Fast validation that production is healthy
 * - Can be used for monitoring/health checks
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 3,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/production-results.json' }]
  ],

  use: {
    baseURL: 'https://myexperiment.life',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
