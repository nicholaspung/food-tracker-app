import { Page } from '@playwright/test';
import { pb } from './pocketbase';

export interface TestUser {
  email: string;
  password: string;
  id?: string;
}

/**
 * Creates a test user with an invite code and returns the user details
 */
export async function createTestUser(inviteCode: string): Promise<TestUser> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const email = `test-${timestamp}-${random}@example.com`;
  const password = 'TestPassword123!';

  try {
    // Create user via API (will auto-generate invite codes)
    const record = await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      inviteCode,
    });

    return {
      email,
      password,
      id: record.id,
    };
  } catch (error) {
    console.error('Failed to create test user:', error);
    throw error;
  }
}

/**
 * Login a test user via the UI
 */
export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();

  // Wait for redirect to home
  await page.waitForURL(/\/home/, { timeout: 10000 });
}

/**
 * Login via API (faster than UI login)
 */
export async function loginUserAPI(email: string, password: string) {
  try {
    await pb.collection('users').authWithPassword(email, password);
    return pb.authStore.token;
  } catch (error) {
    console.error('Failed to login user:', error);
    throw error;
  }
}

/**
 * Setup authenticated page with stored auth token
 */
export async function setupAuthenticatedPage(page: Page, user: TestUser) {
  // Login via API to get token
  const token = await loginUserAPI(user.email, user.password);

  // Inject auth token into page localStorage
  await page.goto('/');
  await page.evaluate((authData) => {
    localStorage.setItem('pocketbase_auth', JSON.stringify({
      token: authData.token,
      model: authData.model,
    }));
  }, {
    token,
    model: pb.authStore.model
  });

  // Reload to apply auth state
  await page.reload();
  await page.waitForLoadState('networkidle');
}

/**
 * Logout user
 */
export async function logoutUser(page: Page) {
  await page.getByTestId('logout-button').click();
  await page.waitForURL(/^\/(?:\?.*)?$/, { timeout: 5000 });
}

/**
 * Cleanup test user
 */
export async function deleteTestUser(userId: string) {
  try {
    await pb.collection('users').delete(userId);
  } catch (error) {
    console.error('Failed to delete test user:', error);
  }
}
