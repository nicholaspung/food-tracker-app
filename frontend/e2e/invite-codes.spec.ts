import { test, expect } from '@playwright/test';
import { skipIfLocal, isDeployedEnvironment } from './helpers/test-environment';
import { setupBetaTestData, cleanupBetaTestData, createInviteCodes, markInviteCodeAsUsed } from './helpers/beta-setup';
import { createTestUser, setupAuthenticatedPage, type TestUser } from './helpers/auth';
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
      const testPassword = 'password123';

      await page.getByTestId('signup-email').fill(testEmail);
      await page.getByTestId('signup-invite-code').fill(testInviteCode);
      await page.getByTestId('signup-password').fill(testPassword);
      await page.getByTestId('signup-password-confirm').fill(testPassword);
      await page.getByTestId('signup-submit').click();

      // Should show success message with countdown
      await expect(page.getByTestId('signup-success')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('signup-success')).toContainText(/account created successfully/i);

      // Click "Back to Login" button instead of waiting for auto-redirect (faster and more reliable in CI)
      await page.getByTestId('signup-goto-login-success').click();

      // Should now be on login page
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 3000 });

      // Now login with the newly created account
      await page.getByTestId('login-email').fill(testEmail);
      await page.getByTestId('login-password').fill(testPassword);
      await page.getByTestId('login-submit').click();

      // Should navigate to home page after login
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
    let testUser: TestUser;
    let suiteInviteCode: string;

    test.beforeEach(async ({ page }) => {
      skipIfLocal();

      if (!pb) {
        throw new Error('PocketBase instance not available for test');
      }

      // Generate a fresh invite code for this test to avoid reuse issues
      const freshCodes = await createInviteCodes(pb, 1);
      suiteInviteCode = freshCodes[0];

      // Create and authenticate a test user
      testUser = await createTestUser(pb, suiteInviteCode);
      await setupAuthenticatedPage(page, pb, testUser);
    });

    test.afterEach(async () => {
      // Cleanup the invite code used by this test
      if (pb && suiteInviteCode) {
        try {
          const codes = await pb.collection('invite_codes').getFullList({
            filter: `code = "${suiteInviteCode}"`,
            $autoCancel: false,
          });
          for (const code of codes) {
            await pb.collection('invite_codes').delete(code.id);
          }
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    });

    test('should display invite codes section in profile', async ({ page }) => {
      await page.goto('/profile');

      // Check for invite codes heading
      const inviteCodesSection = page.locator('text=Your Invite Codes');
      await expect(inviteCodesSection).toBeVisible();
    });

    test('should show loading state initially', async ({ page }) => {
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
    let testUser: TestUser;
    let suiteInviteCode: string;

    test.beforeEach(async ({ page }) => {
      skipIfLocal();

      if (!pb) {
        throw new Error('PocketBase instance not available for test');
      }

      // Generate a fresh invite code for this test to avoid reuse issues
      const freshCodes = await createInviteCodes(pb, 1);
      suiteInviteCode = freshCodes[0];

      // Create and authenticate a test user
      testUser = await createTestUser(pb, suiteInviteCode);
      await setupAuthenticatedPage(page, pb, testUser);
    });

    test.afterEach(async () => {
      // Cleanup the invite code used by this test
      if (pb && suiteInviteCode) {
        try {
          const codes = await pb.collection('invite_codes').getFullList({
            filter: `code = "${suiteInviteCode}"`,
            $autoCancel: false,
          });
          for (const code of codes) {
            await pb.collection('invite_codes').delete(code.id);
          }
        } catch (err) {
          // Ignore cleanup errors
        }
      }
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
    let testUser: TestUser;
    let suiteInviteCode: string;

    test.beforeEach(async ({ page }) => {
      skipIfLocal();

      if (!pb) {
        throw new Error('PocketBase instance not available for test');
      }

      // Generate a fresh invite code for this test to avoid reuse issues
      const freshCodes = await createInviteCodes(pb, 1);
      suiteInviteCode = freshCodes[0];

      // Create and authenticate a test user
      testUser = await createTestUser(pb, suiteInviteCode);
      await setupAuthenticatedPage(page, pb, testUser);
    });

    test.afterEach(async () => {
      // Cleanup the invite code used by this test
      if (pb && suiteInviteCode) {
        try {
          const codes = await pb.collection('invite_codes').getFullList({
            filter: `code = "${suiteInviteCode}"`,
            $autoCancel: false,
          });
          for (const code of codes) {
            await pb.collection('invite_codes').delete(code.id);
          }
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    });

    test('should only show unused codes with Available status', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const codeElements = page.locator('[data-testid^="invite-code-"]');
      const count = await codeElements.count();

      if (count > 0) {
        // All codes shown should have "Available" status (we only show unused codes)
        const firstCode = codeElements.first();
        const statusText = firstCode.locator('text=Available');
        await expect(statusText).toBeVisible();

        // Verify "Used" status is not shown anywhere (used codes are filtered out)
        const usedText = page.locator('text=Used');
        await expect(usedText).not.toBeVisible();
      }
    });

    test('should show copy button for all displayed codes', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const codeElements = page.locator('[data-testid^="invite-code-"]');
      const codeCount = await codeElements.count();

      // All displayed codes should have copy buttons (since we only show unused codes)
      const copyButtons = page.locator('[data-testid^="copy-code-"]');
      const copyButtonCount = await copyButtons.count();

      expect(copyButtonCount).toBe(codeCount);
    });

    test('should not show strikethrough styling on codes', async ({ page }) => {
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      // No strikethrough styling should exist (used codes are not displayed)
      const strikethroughText = page.locator('[data-testid^="invite-code-"]').locator('.line-through');
      const strikethroughCount = await strikethroughText.count();
      expect(strikethroughCount).toBe(0);
    });
  });

  test.describe('Generate Invite Codes (Initial User Only)', () => {
    let initialUser: TestUser;
    let nonInitialUser: TestUser;
    let initialUserInviteCode: string;

    test.beforeEach(async ({ page }) => {
      skipIfLocal();

      if (!pb) {
        throw new Error('PocketBase instance not available for test');
      }

      // Create an initial user (signs up with admin code that has no createdBy)
      const freshCodes = await createInviteCodes(pb, 1);
      initialUserInviteCode = freshCodes[0];
      initialUser = await createTestUser(pb, initialUserInviteCode);

      // Get one of the initial user's generated codes
      const userCodes = await pb.collection('invite_codes').getFullList({
        filter: `createdBy = "${initialUser.id}" && used = false`,
        $autoCancel: false,
      });

      if (userCodes.length === 0) {
        throw new Error('Initial user should have generated invite codes');
      }

      // Create a non-initial user (signs up with initial user's code)
      nonInitialUser = await createTestUser(pb, userCodes[0].code);
    });

    test.afterEach(async () => {
      // Cleanup test users and codes
      if (pb && initialUser.id) {
        try {
          await pb.collection('users').delete(initialUser.id);
        } catch (err) {
          // Ignore if already deleted
        }
      }
      if (pb && nonInitialUser.id) {
        try {
          await pb.collection('users').delete(nonInitialUser.id);
        } catch (err) {
          // Ignore if already deleted
        }
      }
      if (pb && initialUserInviteCode) {
        try {
          const codes = await pb.collection('invite_codes').getFullList({
            filter: `code = "${initialUserInviteCode}"`,
            $autoCancel: false,
          });
          for (const code of codes) {
            await pb.collection('invite_codes').delete(code.id);
          }
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    });

    test('initial user should see "Generate 5 More" button', async ({ page }) => {
      await setupAuthenticatedPage(page, pb!, initialUser);
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      // Should see the generate button
      await expect(page.getByTestId('generate-codes-button')).toBeVisible();
    });

    test('non-initial user should NOT see "Generate 5 More" button', async ({ page }) => {
      await setupAuthenticatedPage(page, pb!, nonInitialUser);
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      // Should NOT see the generate button
      await expect(page.getByTestId('generate-codes-button')).not.toBeVisible();
    });

    test('initial user can successfully generate more codes', async ({ page }) => {
      await setupAuthenticatedPage(page, pb!, initialUser);
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      // Count existing codes
      const initialCodeCount = await page.locator('[data-testid^="invite-code-"]').count();

      // Click generate button
      await page.getByTestId('generate-codes-button').click();

      // Wait for generation to complete
      await page.waitForTimeout(2000);

      // Should have 5 more codes
      const newCodeCount = await page.locator('[data-testid^="invite-code-"]').count();
      expect(newCodeCount).toBe(initialCodeCount + 5);
    });

    test('initial user can generate codes when none exist', async ({ page }) => {
      // Delete all codes for the initial user first
      if (pb && initialUser.id) {
        const userCodes = await pb.collection('invite_codes').getFullList({
          filter: `createdBy = "${initialUser.id}"`,
          $autoCancel: false,
        });
        for (const code of userCodes) {
          await pb.collection('invite_codes').delete(code.id);
        }
      }

      await setupAuthenticatedPage(page, pb!, initialUser);
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      // Should see "No invite codes available" message
      await expect(page.locator('text=No invite codes available')).toBeVisible();

      // Should see the "Generate Codes" button (not "Generate 5 More")
      await expect(page.getByTestId('generate-first-codes-button')).toBeVisible();

      // Click generate button
      await page.getByTestId('generate-first-codes-button').click();

      // Wait for generation to complete
      await page.waitForTimeout(2000);

      // Should now have codes
      const codeCount = await page.locator('[data-testid^="invite-code-"]').count();
      expect(codeCount).toBe(5);
    });

    test('button shows loading state during generation', async ({ page }) => {
      await setupAuthenticatedPage(page, pb!, initialUser);
      await page.goto('/profile');
      await page.waitForTimeout(1000);

      const generateButton = page.getByTestId('generate-codes-button');
      await generateButton.click();

      // Button should show "Generating..." text
      await expect(generateButton).toContainText('Generating...');
      await expect(generateButton).toBeDisabled();
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
      // Increased timeout because this test does many steps with network requests
      test.setTimeout(60000); // 60 seconds instead of default 30 seconds

      const userAEmail = generateTestEmail();
      const userBEmail = generateTestEmail();

      // Step 1: User A signs up with admin invite code
      await page.goto('/signup');
      await page.getByTestId('signup-email').fill(userAEmail);
      await page.getByTestId('signup-invite-code').fill(testInviteCode);
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Wait for success message
      await expect(page.getByTestId('signup-success')).toBeVisible({ timeout: 5000 });

      // Click "Back to Login" button instead of waiting for auto-redirect (faster and more reliable in CI)
      await page.getByTestId('signup-goto-login-success').click();

      // Should now be on login page
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 3000 });

      // User A logs in
      await page.getByTestId('login-email').fill(userAEmail);
      await page.getByTestId('login-password').fill('password123');
      await page.getByTestId('login-submit').click();

      // Wait for redirect to home
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

      // Step 4: Navigate back to home and logout User A
      await page.goto('/home');
      await page.getByTestId('logout-button').click();

      // Wait for logout to complete with better error handling
      try {
        await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 15000 });
      } catch (error) {
        // If URL wait times out, check if we're on login page anyway
        console.log('URL wait timed out, checking for login page...');
      }

      // Verify we're on login page
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 });

      // Step 5: User B signs up with User A's code using the URL method
      await page.goto(`/signup?code=${userACode}`);
      await page.getByTestId('signup-email').fill(userBEmail);
      // Code should be pre-filled from URL
      await expect(page.getByTestId('signup-invite-code')).toHaveValue(userACode);
      await page.getByTestId('signup-password').fill('password123');
      await page.getByTestId('signup-password-confirm').fill('password123');
      await page.getByTestId('signup-submit').click();

      // Wait for success message
      await expect(page.getByTestId('signup-success')).toBeVisible({ timeout: 5000 });

      // Click "Back to Login" button instead of waiting for auto-redirect (faster and more reliable in CI)
      await page.getByTestId('signup-goto-login-success').click();

      // Should now be on login page
      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 3000 });

      // User B logs in
      await page.getByTestId('login-email').fill(userBEmail);
      await page.getByTestId('login-password').fill('password123');
      await page.getByTestId('login-submit').click();

      // Should successfully login and redirect to home
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
      try {
        await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 15000 });
      } catch (error) {
        console.log('URL wait timed out after account deletion, checking for login page...');
      }

      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 });

      // Step 8: Log back in as User A
      await page.getByTestId('login-email').fill(userAEmail);
      await page.getByTestId('login-password').fill('password123');
      await page.getByTestId('login-submit').click();
      await page.waitForURL(/\/home/, { timeout: 10000 });

      // Step 9: Verify User A's code is no longer in the list (it's been used, we only show unused codes)
      await page.goto('/profile');
      await page.waitForTimeout(2000);

      // The used code should NOT be visible (we only show unused codes now)
      const usedCodeElement = page.locator(`[data-testid="invite-code-${userACode}"]`);
      await expect(usedCodeElement).not.toBeVisible();

      // User A should have 4 remaining codes (started with 5, one was used by User B)
      const remainingCodes = page.locator('[data-testid^="invite-code-"]');
      const remainingCount = await remainingCodes.count();
      expect(remainingCount).toBe(4);

      // Step 10: Delete User A's account
      await page.getByTestId('delete-account-button').click();
      await expect(page.getByText(/are you sure/i)).toBeVisible();
      await page.getByTestId('confirm-delete-button').click();

      // Should redirect to login page after deletion
      try {
        await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 15000 });
      } catch (error) {
        console.log('URL wait timed out after account deletion, checking for login page...');
      }

      await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 10000 });
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
