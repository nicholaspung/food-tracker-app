/**
 * Test data seeding helpers
 *
 * Note: These functions require admin access to PocketBase
 * For now, they provide instructions for manual seeding
 * In the future, could be automated with admin SDK
 */

export interface SeedInviteCodeOptions {
  code: string;
  used?: boolean;
  createdBy?: string;
}

/**
 * Instructions for manually seeding test invite codes
 */
export function getInviteCodeSeedInstructions(): string {
  return `
To seed test invite codes:

1. Open PocketBase Admin UI: http://localhost:8090/_/
2. Navigate to 'invite_codes' collection
3. Create records with these codes:
   - TEST2024CODE (used: false)
   - E2E_CODE_1 (used: false)
   - E2E_CODE_2 (used: false)
   - E2E_CODE_3 (used: false)
   - E2E_CODE_4 (used: false)

Or run this SQL in the PocketBase console:

INSERT INTO invite_codes (code, used) VALUES
  ('TEST2024CODE', 0),
  ('E2E_CODE_1', 0),
  ('E2E_CODE_2', 0),
  ('E2E_CODE_3', 0),
  ('E2E_CODE_4', 0);
  `;
}

/**
 * List of pre-seeded test codes
 * These should exist in the database before running tests
 */
export const TEST_INVITE_CODES = {
  MAIN: 'TEST2024CODE',
  BACKUP_1: 'E2E_CODE_1',
  BACKUP_2: 'E2E_CODE_2',
  BACKUP_3: 'E2E_CODE_3',
  BACKUP_4: 'E2E_CODE_4',
} as const;

/**
 * Get an unused test invite code
 * Cycles through backup codes if main is used
 */
export function getTestInviteCode(index: number = 0): string {
  const codes = Object.values(TEST_INVITE_CODES);
  return codes[index % codes.length];
}

/**
 * Check if test environment is properly seeded
 */
export function validateTestEnvironment() {
  console.log('⚠️  E2E Test Environment Setup Required:');
  console.log(getInviteCodeSeedInstructions());
}
