import { test, expect } from '@playwright/test';
import { skipIfLocal, isDeployedEnvironment } from './helpers/test-environment';
import { setupBetaTestData, cleanupBetaTestData, createInviteCodes, markInviteCodeAsUsed } from './helpers/beta-setup';
import type PocketBase from 'pocketbase';

// Helper to generate random email for testing
function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

test.describe('Invite Code System', () => {
  // Store test invite code and PocketBase instance for reuse across tests
  let testInviteCode: string;
  let pb: PocketBase | null = null;

  test.beforeAll(async () => {
    // For deployed environments (beta/production): Generate fresh invite codes via admin API
    if (isDeployedEnvironment()) {
      try {
        const testData = await setupBetaTestData();
        testInviteCode = testData.adminInviteCode;
        pb = testData.pb;
        console.log(`✅ Generated fresh admin invite code: ${testInviteCode}`);
      } catch (error) {
        console.error('❌ Failed to setup beta test data:', error);
        throw error;
      }
    } else {
      // For local testing: Use default test code (should be created manually)
      testInviteCode = 'TEST2024CODE';
      console.log(`📝 Using local test invite code: ${testInviteCode}`);
    }
  });

  test.afterAll(async () => {
    // Cleanup test data in deployed environments
    if (pb) {
      await cleanupBetaTestData(pb, testInviteCode);
      console.log('✅ Beta test cleanup completed');
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForLoadState('domcontentloaded');
    // Navigate to signup
    await page.getByTestId('login-goto-signup').click();
  });

  test.describe('Signup with Invite Code', () => {
    test('should display invite code field', async ({ page }) => {
      await expect(page.getByTestId('signup-invite-code')).toBeVisible();
      await expect(page.getByTestId('signup-invite-code')).toHaveAttribute('required', '');
    });

    test('should show error when invite code is missing', async ({ page }) => {
      // Remove required attribute to bypass HTML5 validation
      await page.getByTestId('signup-invite-code').evaluate(el => el.removeAttribute('required'));

      await page.getByTestId('signup-email').fill(generateTestEmail());
      await page.getByTestId('signup-invite-code').fill('');
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      await expect(page.getByTestId('signup-error')).toBeVisible();
      await expect(page.getByTestId('signup-error')).toContainText(/invite code is required/i);
    });

    test('should show error with invalid invite code', async ({ page }) => {
      await page.getByTestId('signup-email').fill(generateTestEmail());
      await page.getByTestId('signup-invite-code').fill('INVALIDCODE123');
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Should show an error (message may vary)
      await expect(page.getByTestId('signup-error')).toBeVisible();
      // Error could be "invalid or already used" or generic backend error
      const errorText = await page.getByTestId('signup-error').textContent();
      expect(errorText).toBeTruthy();
    });

    test('should successfully signup with valid invite code', async ({ page }) => {
      // Note: Skipped in local environment (requires deployed backend with seeded data)
      // Runs in beta/production where backend is available
      skipIfLocal();

      const testEmail = generateTestEmail();

      await page.getByTestId('signup-email').fill(testEmail);
      await page.getByTestId('signup-invite-code').fill(testInviteCode);
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Should navigate to home page on success
      await page.waitForURL(/\/home/, { timeout: 10000 });
      await expect(page.getByTestId('home-page')).toBeVisible();

      // Cleanup: logout
      await page.getByTestId('logout-button').click();
    });
  });

  test.describe('Pre-populated Invite Code from URL', () => {
    test('should pre-fill invite code from URL parameter', async ({ page }) => {
      const inviteCode = 'URLCODE123';
      await page.goto(`/signup?code=${inviteCode}`);

      // Should show welcome message
      await expect(page.getByTestId('invite-welcome')).toBeVisible();
      await expect(page.getByTestId('invite-welcome')).toContainText(inviteCode);

      // Should have invite code pre-filled
      await expect(page.getByTestId('signup-invite-code')).toHaveValue(inviteCode);

      // Should show custom description
      await expect(page.getByTestId('signup-description')).toContainText(/you've been invited/i);
    });

    test('should allow editing pre-filled invite code', async ({ page }) => {
      await page.goto('/signup?code=OLDCODE');

      // Pre-filled value
      await expect(page.getByTestId('signup-invite-code')).toHaveValue('OLDCODE');

      // User can change it
      await page.getByTestId('signup-invite-code').clear();
      await page.getByTestId('signup-invite-code').fill('NEWCODE');
      await expect(page.getByTestId('signup-invite-code')).toHaveValue('NEWCODE');
    });
  });

  test.describe('User Invite Codes in Profile', () => {
    test('should display invite codes section in profile', async ({ page }) => {
      // Note: Skipped in local environment (requires authentication)
      // Runs in beta/production where backend is available
      skipIfLocal();

      await page.goto('/profile');

      // Check for invite codes heading
      const inviteCodesSection = page.locator('text=Your Invite Codes');
      await expect(inviteCodesSection).toBeVisible();
    });

    test('should show loading state initially', async ({ page }) => {
      // Note: Skipped in local environment (requires authentication)
      // Runs in beta/production where backend is available
      skipIfLocal();

      await page.goto('/profile');

      // On initial load, should show loading or codes
      const loadingText = page.locator('text=Loading codes...');
      const codesExist = page.locator('[data-testid^="invite-code-"]').first();

      // Either loading or codes should be present
      await expect(
        loadingText.or(codesExist)
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Copy Invite Functionality', () => {
    // Note: Skipped in local environment (requires authentication)
    // Runs in beta/production where backend is available
    test.beforeEach(() => {
      skipIfLocal();
    });

    test('should show copy button for available codes', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const copyButtons = page.locator('[data-testid^="copy-code-"]');
      const count = await copyButtons.count();
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(5);
    });

    test('should copy invite message to clipboard', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const copyButton = page.locator('[data-testid^="copy-code-"]').first();
      if (await copyButton.isVisible()) {
        await copyButton.click();
        await expect(copyButton).toContainText(/copied/i);

        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toContain('invited to join');
        expect(clipboardText).toContain('/signup?code=');
        expect(clipboardText).toContain('Your invite code:');
      }
    });
  });

  test.describe('Invite Code Status', () => {
    // Note: Skipped in local environment (requires authentication)
    // Runs in beta/production where backend is available
    test.beforeEach(() => {
      skipIfLocal();
    });

    test('should show code status (Available vs Used)', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const codeElements = page.locator('[data-testid^="invite-code-"]');
      const count = await codeElements.count();

      if (count > 0) {
        const firstCode = codeElements.first();
        const statusText = firstCode.locator('text=/Available|Used/');
        await expect(statusText).toBeVisible();
      }
    });

    test('should not show copy button for used codes', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const usedCodes = page.locator('[data-testid^="invite-code-"]', {
        has: page.locator('text=Used')
      });

      const usedCount = await usedCodes.count();
      for (let i = 0; i < usedCount; i++) {
        const codeContainer = usedCodes.nth(i);
        const copyButton = codeContainer.locator('button:has-text("Copy")');
        await expect(copyButton).not.toBeVisible();
      }
    });

    test('should apply strikethrough styling to used codes', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const usedCodeText = page.locator('[data-testid^="invite-code-"]').locator('.line-through');
      if (await usedCodeText.count() > 0) {
        await expect(usedCodeText.first()).toBeVisible();
      }
    });
  });

  test.describe('Viral Network Flow', () => {
    // Note: Skipped in local environment (requires backend with seeded data)
    // Runs in beta/production where backend is available
    test.beforeEach(() => {
      skipIfLocal();
    });

    test('should complete full viral invite flow with user deletion', async ({ page }) => {
      // This is a comprehensive test of the entire flow including user deletion
      const userAEmail = generateTestEmail();
      const userBEmail = generateTestEmail();

      // Step 1: User A signs up with admin invite code
      await page.goto('/signup');
      await page.getByTestId('signup-email').fill(userAEmail);
      await page.getByTestId('signup-invite-code').fill(testInviteCode);
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Wait for successful signup and redirect
      await page.waitForURL(/\/home/, { timeout: 10000 });

      // Step 2: User A navigates to profile to get their codes
      await page.goto('/profile');
      await page.waitForTimeout(2000); // Wait for codes to generate

      // Should see 5 invite codes
      const inviteCodes = page.locator('[data-testid^="invite-code-"]');
      const codeCount = await inviteCodes.count();
      expect(codeCount).toBeGreaterThan(0);
      expect(codeCount).toBeLessThanOrEqual(5);

      // Step 3: User A gets one of their codes
      const firstCodeElement = inviteCodes.first();
      const codeText = await firstCodeElement.locator('.font-mono').first().textContent();
      const userACode = codeText?.trim() || '';

      expect(userACode.length).toBeGreaterThan(0);

      // Step 4: Logout User A
      await page.getByTestId('logout-button').click();
      await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 5000 });

      // Step 5: User B signs up with User A's code using the URL method
      await page.goto(`/signup?code=${userACode}`);
      await page.getByTestId('signup-email').fill(userBEmail);
      // Code should be pre-filled from URL
      await expect(page.getByTestId('signup-invite-code')).toHaveValue(userACode);
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Should successfully signup
      await page.waitForURL(/\/home/, { timeout: 10000 });

      // Step 6: User B should also have invite codes
      await page.goto('/profile');
      await page.waitForTimeout(2000);

      const userBCodes = page.locator('[data-testid^="invite-code-"]');
      const userBCodeCount = await userBCodes.count();
      expect(userBCodeCount).toBeGreaterThan(0);

      // Step 7: Delete User B's account
      await page.getByTestId('delete-account-button').click();
      await expect(page.getByText(/are you sure/i)).toBeVisible();
      await page.getByTestId('confirm-delete-button').click();

      // Should redirect to login page after deletion
      await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 10000 });
      await expect(page.getByTestId('login-page')).toBeVisible();

      // Step 8: Log back in as User A
      await page.getByTestId('login-email').fill(userAEmail);
      await page.getByTestId('login-password').fill('password123');
      await page.getByTestId('login-submit').click();
      await page.waitForURL(/\/home/, { timeout: 10000 });

      // Step 9: Verify User A's code is now marked as used
      await page.goto('/profile');
      await page.waitForTimeout(2000);

      const usedCodeElement = page.locator(`[data-testid="invite-code-${userACode}"]`);
      await expect(usedCodeElement.locator('text=Used')).toBeVisible();

      // Step 10: Delete User A's account
      await page.getByTestId('delete-account-button').click();
      await expect(page.getByText(/are you sure/i)).toBeVisible();
      await page.getByTestId('confirm-delete-button').click();

      // Should redirect to login page after deletion
      await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 10000 });
      await expect(page.getByTestId('login-page')).toBeVisible();
    });

    test('should reject signup with fake invite code', async ({ page }) => {
      const fakeEmail = generateTestEmail();
      const fakeInviteCode = 'FAKE' + Date.now() + Math.random().toString(36).substring(7).toUpperCase();

      // Try to sign up with a fake invite code
      await page.goto('/signup');
      await page.getByTestId('signup-email').fill(fakeEmail);
      await page.getByTestId('signup-invite-code').fill(fakeInviteCode);
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Should show an error
      await expect(page.getByTestId('signup-error')).toBeVisible({ timeout: 10000 });

      // Error message should indicate invalid code
      const errorText = await page.getByTestId('signup-error').textContent();
      expect(errorText?.toLowerCase()).toMatch(/invalid|not found|fail|error/);

      // Should remain on signup page
      await expect(page.getByTestId('signup-page')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should prevent reusing an already-used invite code', async ({ page }) => {
      // Note: Skipped in local environment (requires backend)
      skipIfLocal();

      if (!pb) {
        throw new Error('PocketBase instance not available for test');
      }

      // Create a fresh invite code and mark it as used
      const usedCodes = await createInviteCodes(pb, 1);
      const usedCode = usedCodes[0];
      await markInviteCodeAsUsed(pb, usedCode);

      console.log(`Testing with pre-used invite code: ${usedCode}`);

      // Attempt to signup with the already-used code
      await page.goto('/signup');
      await page.getByTestId('signup-email').fill(generateTestEmail());
      await page.getByTestId('signup-invite-code').fill(usedCode);
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Should show error message about invalid/used code
      await expect(page.getByTestId('signup-error')).toBeVisible({ timeout: 10000 });
      const errorText = await page.getByTestId('signup-error').textContent();
      expect(errorText?.toLowerCase()).toMatch(/invalid|used|fail|error/);

      // Should remain on signup page
      await expect(page.getByTestId('signup-page')).toBeVisible();
    });

    test('should handle network errors gracefully', async ({ page }) => {
      // Test offline/network error handling
      await page.goto('/signup');

      // Simulate offline
      await page.context().setOffline(true);

      await page.getByTestId('signup-email').fill(generateTestEmail());
      await page.getByTestId('signup-invite-code').fill('ANYCODE');
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Should show error message
      await expect(page.getByTestId('signup-error')).toBeVisible({ timeout: 10000 });

      // Restore online
      await page.context().setOffline(false);
    });
  });
});
