import { test, expect } from '@playwright/test';
import { skipIfLocal, isDeployedEnvironment } from './helpers/test-environment';
import { setupBetaTestData, cleanupBetaTestData } from './helpers/beta-setup';
import { createTestUser, setupAuthenticatedPage, type TestUser } from './helpers/auth';
import type PocketBase from 'pocketbase';

test.describe('Mobile Navigation', () => {
  let testUser: TestUser;
  let pb: PocketBase | null = null;
  let testInviteCode: string;

  test.beforeAll(async () => {
    skipIfLocal();

    if (isDeployedEnvironment()) {
      try {
        const testData = await setupBetaTestData();
        testInviteCode = testData.adminInviteCode;
        pb = testData.pb;
      } catch (error) {
        console.error('❌ Failed to setup beta test data:', error);
        throw error;
      }
    }
  });

  test.afterAll(async () => {
    if (pb) {
      await cleanupBetaTestData(pb, testInviteCode);
    }
  });

  test.beforeEach(async ({ page }) => {
    skipIfLocal();

    if (!pb) {
      throw new Error('PocketBase instance not available for test');
    }

    // Create and authenticate a test user
    testUser = await createTestUser(pb, testInviteCode);
    await setupAuthenticatedPage(page, pb, testUser);
  });

  test.afterEach(async () => {
    // Cleanup test user
    if (pb && testUser.id) {
      try {
        await pb.collection('users').delete(testUser.id);
      } catch (err) {
        // Ignore if already deleted
      }
    }
  });

  test.describe('Bottom Tab Navigation', () => {
    test('should display bottom tab navigation on home page', async ({ page }) => {
      await page.goto('/home');

      // Check that bottom tab navigation is visible
      await expect(page.getByTestId('bottom-tab-navigation')).toBeVisible();

      // Check that both tabs are present
      await expect(page.getByTestId('tab-home')).toBeVisible();
      await expect(page.getByTestId('tab-profile')).toBeVisible();
    });

    test('should display bottom tab navigation on profile page', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.getByTestId('bottom-tab-navigation')).toBeVisible();
      await expect(page.getByTestId('tab-home')).toBeVisible();
      await expect(page.getByTestId('tab-profile')).toBeVisible();
    });

    test('should navigate between home and profile using tabs', async ({ page }) => {
      await page.goto('/home');

      // Click profile tab
      await page.getByTestId('tab-profile').click();
      await page.waitForURL(/\/profile/, { timeout: 5000 });
      await expect(page.getByTestId('profile-page')).toBeVisible();

      // Click home tab
      await page.getByTestId('tab-home').click();
      await page.waitForURL(/\/home/, { timeout: 5000 });
      await expect(page.getByTestId('home-page')).toBeVisible();
    });

    test('should highlight active tab', async ({ page }) => {
      await page.goto('/home');

      // Home tab should be active
      const homeTab = page.getByTestId('tab-home');
      const homeIcon = homeTab.locator('svg').first();
      await expect(homeIcon).toHaveClass(/text-blue-600/);

      // Navigate to profile
      await page.getByTestId('tab-profile').click();
      await page.waitForURL(/\/profile/, { timeout: 5000 });

      // Profile tab should now be active
      const profileTab = page.getByTestId('tab-profile');
      const profileIcon = profileTab.locator('svg').first();
      await expect(profileIcon).toHaveClass(/text-blue-600/);
    });

    test('should not display tabs on login page', async ({ page }) => {
      await page.goto('/');

      // Tabs should not be visible on login page
      await expect(page.getByTestId('bottom-tab-navigation')).not.toBeVisible();
    });

    test('should not display tabs on signup page', async ({ page }) => {
      await page.goto('/signup');

      // Tabs should not be visible on signup page
      await expect(page.getByTestId('bottom-tab-navigation')).not.toBeVisible();
    });
  });

  test.describe('Profile Page Navigation', () => {
    test('should have What\'s New button in profile', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.getByTestId('whats-new-button')).toBeVisible();
    });

    test('should navigate to What\'s New page from profile', async ({ page }) => {
      await page.goto('/profile');

      await page.getByTestId('whats-new-button').click();
      await page.waitForURL(/\/whats-new/, { timeout: 5000 });
    });

    test('should have logout button in profile', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.getByTestId('logout-button')).toBeVisible();
    });

    test('should logout from profile page', async ({ page }) => {
      await page.goto('/profile');

      await page.getByTestId('logout-button').click();

      // Should redirect to login page
      await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 5000 });
      await expect(page.getByTestId('login-page')).toBeVisible();
    });
  });

  test.describe('What\'s New Page', () => {
    test('should display back button on What\'s New page', async ({ page }) => {
      await page.goto('/whats-new');

      await expect(page.getByTestId('back-button')).toBeVisible();
    });

    test('should navigate back to profile from What\'s New page', async ({ page }) => {
      await page.goto('/whats-new');

      await page.getByTestId('back-button').click();
      await page.waitForURL(/\/profile/, { timeout: 5000 });
      await expect(page.getByTestId('profile-page')).toBeVisible();
    });

    test('should display bottom tabs on What\'s New page', async ({ page }) => {
      await page.goto('/whats-new');

      await expect(page.getByTestId('bottom-tab-navigation')).toBeVisible();
    });
  });

  test.describe('Mobile Layout', () => {
    test('should have mobile container on authenticated pages', async ({ page }) => {
      await page.goto('/home');

      // Check that the page has mobile layout structure
      const container = page.locator('.max-w-\\[428px\\]').first();
      await expect(container).toBeVisible();
    });

    test('should scroll to top when navigating between tabs', async ({ page }) => {
      await page.goto('/home');

      // Navigate to profile
      await page.getByTestId('tab-profile').click();
      await page.waitForURL(/\/profile/, { timeout: 5000 });

      // Check scroll position (should be at top)
      const scrollTop = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main?.scrollTop || 0;
      });

      expect(scrollTop).toBe(0);
    });
  });

  test.describe('Home Page Simplified UI', () => {
    test('should only show View Profile button on home page', async ({ page }) => {
      await page.goto('/home');

      // Should have profile button
      await expect(page.getByTestId('profile-button')).toBeVisible();

      // Should NOT have logout button (moved to profile)
      await expect(page.getByTestId('logout-button')).not.toBeVisible();

      // Should NOT have what's new button (moved to profile)
      const whatsNewButton = page.getByTestId('whats-new-button');
      await expect(whatsNewButton).not.toBeVisible();
    });

    test('should navigate to profile from home page button', async ({ page }) => {
      await page.goto('/home');

      await page.getByTestId('profile-button').click();
      await page.waitForURL(/\/profile/, { timeout: 5000 });
      await expect(page.getByTestId('profile-page')).toBeVisible();
    });
  });
});
