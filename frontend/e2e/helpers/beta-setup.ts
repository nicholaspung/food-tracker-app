/**
 * Beta Environment Test Setup
 *
 * Provides utilities for setting up test data in beta environment using PocketBase admin API.
 * This allows us to generate fresh invite codes for each test run instead of relying on pre-seeded data.
 *
 * Authentication: Uses PocketBase _superusers collection for admin authentication
 * Reference: https://pocketbase.io/docs/authentication/
 *
 * Admin privileges:
 * - Can access and modify any collection (API rules are ignored)
 * - Can create/update/delete records directly
 * - Perfect for test data setup and cleanup
 */

import PocketBase from 'pocketbase';

interface BetaTestData {
  adminInviteCode: string;
  pb: PocketBase;
}

/**
 * Generate a random invite code for testing
 */
function generateInviteCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TEST${timestamp}${random}`;
}

/**
 * Setup test data for beta environment
 *
 * This function:
 * 1. Authenticates as PocketBase superuser using _superusers collection
 * 2. Creates fresh invite codes for testing (bypassing API rules)
 * 3. Returns the codes and authenticated PocketBase instance
 *
 * Admin authentication gives us full access to:
 * - Create invite codes without restrictions
 * - Clean up test data after tests complete
 * - Bypass collection API rules for test setup
 *
 * @returns Test data including fresh invite codes and PocketBase instance
 * @throws Error if admin credentials are not configured or authentication fails
 */
export async function setupBetaTestData(): Promise<BetaTestData> {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:1420';

  // Only run setup for deployed environments
  if (!baseURL.includes('myexperiment.life')) {
    throw new Error('setupBetaTestData should only be called for deployed environments');
  }

  // Get admin credentials from environment
  const adminEmail = process.env.BETA_ADMIN_EMAIL;
  const adminPassword = process.env.BETA_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'Beta admin credentials not configured. Please set BETA_ADMIN_EMAIL and BETA_ADMIN_PASSWORD environment variables.'
    );
  }

  // Initialize PocketBase client
  const pb = new PocketBase(baseURL.replace(/\/$/, ''));

  try {
    // Authenticate as admin using _superusers collection
    // See: https://pocketbase.io/docs/authentication/
    await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
    console.log('✅ Authenticated as PocketBase admin');

    // Create a fresh admin invite code for tests
    const adminInviteCode = generateInviteCode();

    await pb.collection('invite_codes').create({
      code: adminInviteCode,
      used: false,
      // Don't set createdBy - this is an admin-created code
    });

    console.log(`✅ Created admin invite code: ${adminInviteCode}`);

    return {
      adminInviteCode,
      pb,
    };
  } catch (error: any) {
    console.error('❌ Failed to setup beta test data:', error);
    throw new Error(`Beta test setup failed: ${error.message}`);
  }
}

/**
 * Cleanup test data after test run
 *
 * @param pb - Authenticated PocketBase instance
 * @param inviteCode - Invite code to clean up (optional)
 */
export async function cleanupBetaTestData(pb: PocketBase, inviteCode?: string): Promise<void> {
  try {
    // Ensure we have admin authentication for cleanup
    await ensureAdminAuth(pb);

    // Clean up test users (users created during tests)
    const testUsers = await pb.collection('users').getFullList({
      filter: 'email ~ "test-"',
      $autoCancel: false,
    });

    for (const user of testUsers) {
      try {
        await pb.collection('users').delete(user.id);
        console.log(`🧹 Cleaned up test user: ${user.email}`);
      } catch (err) {
        // User might have been deleted during test - that's OK
        console.log(`⚠️ Could not delete user ${user.email}: ${err}`);
      }
    }

    // Clean up ALL test-generated invite codes (codes starting with "TEST")
    // This is more aggressive than just cleaning up the specific code passed in
    try {
      const testCodes = await pb.collection('invite_codes').getFullList({
        filter: 'code ~ "TEST"',
        $autoCancel: false,
      });

      for (const code of testCodes) {
        try {
          await pb.collection('invite_codes').delete(code.id);
          console.log(`🧹 Cleaned up test invite code: ${code.code}`);
        } catch (err) {
          console.log(`⚠️ Could not delete invite code ${code.code}: ${err}`);
        }
      }
    } catch (err) {
      console.log(`⚠️ Could not fetch test invite codes: ${err}`);
    }

    // Also clean up specific invite code if provided (for backwards compatibility)
    if (inviteCode) {
      try {
        const codes = await pb.collection('invite_codes').getFullList({
          filter: `code = "${inviteCode}"`,
          $autoCancel: false,
        });

        for (const code of codes) {
          await pb.collection('invite_codes').delete(code.id);
        }
      } catch (err) {
        // Already handled in the bulk cleanup above
      }
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    // Don't throw - cleanup failures shouldn't fail the test
  }
}

/**
 * Ensure the PocketBase instance is authenticated as admin
 * Re-authenticates if the current auth is invalid
 *
 * @param pb - PocketBase instance
 */
export async function ensureAdminAuth(pb: PocketBase): Promise<void> {
  // Check if already authenticated and valid
  if (pb.authStore.isValid && pb.authStore.model?.collectionName === '_superusers') {
    return;
  }

  // Re-authenticate as admin
  const adminEmail = process.env.BETA_ADMIN_EMAIL;
  const adminPassword = process.env.BETA_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error('Admin credentials not configured');
  }

  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
}

/**
 * Create additional invite codes for specific test scenarios
 *
 * @param pb - Authenticated PocketBase instance
 * @param count - Number of codes to create
 * @returns Array of created invite codes
 */
export async function createInviteCodes(pb: PocketBase, count: number = 1): Promise<string[]> {
  // Ensure we have admin authentication before creating codes
  await ensureAdminAuth(pb);

  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = generateInviteCode();
    await pb.collection('invite_codes').create({
      code,
      used: false,
    });
    codes.push(code);
    console.log(`✅ Created invite code ${i + 1}/${count}: ${code}`);
  }

  return codes;
}

/**
 * Mark an invite code as used (for testing reuse prevention)
 *
 * @param pb - Authenticated PocketBase instance
 * @param code - Invite code to mark as used
 */
export async function markInviteCodeAsUsed(pb: PocketBase, code: string): Promise<void> {
  // Ensure we have admin authentication
  await ensureAdminAuth(pb);

  const records = await pb.collection('invite_codes').getFullList({
    filter: `code = "${code}"`,
  });

  if (records.length === 0) {
    throw new Error(`Invite code not found: ${code}`);
  }

  await pb.collection('invite_codes').update(records[0].id, {
    used: true,
  });

  console.log(`✅ Marked invite code as used: ${code}`);
}
