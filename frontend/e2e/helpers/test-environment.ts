/**
 * Test Environment Utilities
 *
 * Provides helpers to conditionally skip/run tests based on the environment.
 *
 * Environments:
 * - local: Tests run against localhost:1420 (some tests skipped)
 * - beta: Tests run against beta.myexperiment.life (all tests enabled)
 * - production: Tests run against myexperiment.life (smoke tests only)
 */

import { test as base } from '@playwright/test';

/**
 * Determine if tests are running against a deployed environment
 * (beta or production) where backend is available
 */
export function isDeployedEnvironment(): boolean {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:1420';
  return baseURL.includes('myexperiment.life');
}

/**
 * Check if running against beta environment
 */
export function isBetaEnvironment(): boolean {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:1420';
  return baseURL.includes('beta.myexperiment.life');
}

/**
 * Check if running against production environment
 */
export function isProductionEnvironment(): boolean {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:1420';
  return baseURL.includes('myexperiment.life') && !baseURL.includes('beta.');
}

/**
 * Check if running against local development environment
 */
export function isLocalEnvironment(): boolean {
  return !isDeployedEnvironment();
}

/**
 * Conditionally skip test based on environment
 *
 * Usage:
 * ```typescript
 * test.describe('Backend-dependent tests', () => {
 *   skipIfLocal();
 *
 *   test('should do something requiring backend', async ({ page }) => {
 *     // This test will be skipped in local environment
 *   });
 * });
 * ```
 */
export function skipIfLocal() {
  if (isLocalEnvironment()) {
    base.skip();
  }
}

/**
 * Conditionally skip test in deployed environments
 *
 * Usage:
 * ```typescript
 * test.describe('Local-only tests', () => {
 *   skipIfDeployed();
 *
 *   test('should test something local-specific', async ({ page }) => {
 *     // This test will be skipped in beta/production
 *   });
 * });
 * ```
 */
export function skipIfDeployed() {
  if (isDeployedEnvironment()) {
    base.skip();
  }
}

/**
 * Get environment name for logging/reporting
 */
export function getEnvironmentName(): string {
  if (isBetaEnvironment()) return 'beta';
  if (isProductionEnvironment()) return 'production';
  return 'local';
}

/**
 * Console log current environment (useful for debugging)
 */
export function logEnvironment() {
  const env = getEnvironmentName();
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:1420';
  console.log(`🌍 Test Environment: ${env} (${baseURL})`);
}
