# E2E Test Helpers

This directory contains helper functions for E2E tests that require authentication, database seeding, or environment-specific execution.

## Why Do We Need Helpers?

### Problem: Tests Are Skipped Locally

Many tests are skipped in local environments because they require:
1. **Deployed backend** - Tests run against beta/production environments
2. **Authenticated sessions** - Users must be logged in
3. **Seeded database** - Valid invite codes must exist

### Solution: Multi-Tier Testing + Test Helpers

**Multi-Tier Strategy:**
- **Local tests**: Fast feedback, skip backend-dependent tests
- **Beta tests**: Full E2E coverage against deployed beta environment
- **Production tests**: Smoke tests after production deployment

**Test Helpers:**
- Environment detection and conditional test execution
- Easy user authentication (for deployed environments)
- Test data seeding instructions
- Cleanup utilities

## Files

### `test-environment.ts` - Environment Detection & Conditional Execution

**NEW**: Automatically skip/run tests based on environment (local, beta, production).

**Key Functions:**
- `skipIfLocal()` - Skip test in local environment (runs in beta/production)
- `skipIfDeployed()` - Skip test in deployed environments (runs locally only)
- `isLocalEnvironment()` - Check if running locally
- `isBetaEnvironment()` - Check if running against beta
- `isProductionEnvironment()` - Check if running against production

**Example Usage:**

```typescript
import { test, expect } from '@playwright/test';
import { skipIfLocal } from './helpers/test-environment';

test.describe('Authentication Tests', () => {
  test('should display login form', async ({ page }) => {
    // This test runs in ALL environments (local, beta, production)
    await page.goto('/');
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('should successfully login', async ({ page }) => {
    // This test is SKIPPED locally (requires deployed backend)
    skipIfLocal();

    await page.goto('/');
    await page.getByTestId('login-email').fill('test@example.com');
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/home/);
  });
});
```

**Skip Entire Test Suites:**

```typescript
test.describe('Backend Integration Tests', () => {
  // Skip ALL tests in this describe block if running locally
  test.beforeEach(() => {
    skipIfLocal();
  });

  test('test 1', async ({ page }) => {
    // Only runs in beta/production
  });

  test('test 2', async ({ page }) => {
    // Only runs in beta/production
  });
});
```

**How It Works:**
- Detects environment by checking the base URL from Playwright config
- `localhost:1420` → local environment → skip tests with `skipIfLocal()`
- `beta.myexperiment.life` → beta environment → run ALL tests
- `myexperiment.life` → production environment → run ALL tests

See `test-environment.ts` for more details.

### `auth.ts` - Authentication Helpers

Handles user login, session management, and cleanup.

**Functions:**
- `createTestUser(inviteCode)` - Create a user with an invite code
- `loginUser(page, email, password)` - Login via UI
- `loginUserAPI(email, password)` - Login via API (faster)
- `setupAuthenticatedPage(page, user)` - Inject auth token directly
- `logoutUser(page)` - Logout user
- `deleteTestUser(userId)` - Cleanup test user

**Example Usage:**

```typescript
import { test, expect } from '@playwright/test';
import { createTestUser, setupAuthenticatedPage, deleteTestUser } from './helpers/auth';
import { TEST_INVITE_CODES } from './helpers/seed';

test('should display user invite codes', async ({ page }) => {
  // Create test user
  const user = await createTestUser(TEST_INVITE_CODES.MAIN);

  try {
    // Setup authenticated session
    await setupAuthenticatedPage(page, user);

    // Navigate to profile
    await page.goto('/profile');

    // Test invite codes display
    await expect(page.locator('text=Your Invite Codes')).toBeVisible();
    const codes = page.locator('[data-testid^="invite-code-"]');
    expect(await codes.count()).toBe(5);

  } finally {
    // Cleanup
    if (user.id) {
      await deleteTestUser(user.id);
    }
  }
});
```

### `seed.ts` - Test Data Seeding

Provides test invite codes and seeding instructions.

**Constants:**
- `TEST_INVITE_CODES` - Pre-defined test codes
- `TEST_INVITE_CODES.MAIN` - Main test code: "TEST2024CODE"
- `TEST_INVITE_CODES.BACKUP_1` - Backup code 1: "E2E_CODE_1"
- etc.

**Functions:**
- `getTestInviteCode(index)` - Get test code by index
- `getInviteCodeSeedInstructions()` - Print seeding instructions
- `validateTestEnvironment()` - Check if environment is ready

**Example Usage:**

```typescript
import { TEST_INVITE_CODES, getTestInviteCode } from './helpers/seed';

test('should signup with test code', async ({ page }) => {
  // Use pre-seeded code
  await page.getByTestId('signup-invite-code').fill(TEST_INVITE_CODES.MAIN);

  // Or cycle through backup codes
  const code = getTestInviteCode(0); // Gets TEST2024CODE
  const code2 = getTestInviteCode(1); // Gets E2E_CODE_1
});
```

### `pocketbase.ts` - PocketBase Client

Pre-configured PocketBase client for E2E tests.

**Usage:**

```typescript
import { pb } from './helpers/pocketbase';

// Use for direct API calls
const records = await pb.collection('invite_codes').getFullList();
```

## Setup Instructions

### 1. Install PocketBase SDK

The helpers require the PocketBase SDK:

```bash
cd frontend
npm install pocketbase
```

### 2. Seed Test Invite Codes

Run this in PocketBase admin console or manually create via UI:

```sql
INSERT INTO invite_codes (code, used, createdBy) VALUES
  ('TEST2024CODE', 0, NULL),
  ('E2E_CODE_1', 0, NULL),
  ('E2E_CODE_2', 0, NULL),
  ('E2E_CODE_3', 0, NULL),
  ('E2E_CODE_4', 0, NULL);
```

Or via Admin UI:
1. Go to http://localhost:8090/_/
2. Collection: `invite_codes`
3. Create 5 records with the codes above
4. Set `used` = false for all

### 3. Enable Skipped Tests

Remove `.skip()` from test descriptions:

```typescript
// Before
test.describe.skip('User Invite Codes in Profile', () => {

// After
test.describe('User Invite Codes in Profile', () => {
```

### 4. Use Helpers in Tests

Import and use the helpers:

```typescript
import { createTestUser, setupAuthenticatedPage } from './helpers/auth';
import { TEST_INVITE_CODES } from './helpers/seed';

test('my authenticated test', async ({ page }) => {
  const user = await createTestUser(TEST_INVITE_CODES.MAIN);
  await setupAuthenticatedPage(page, user);

  // Your test code here...

  // Cleanup
  await deleteTestUser(user.id!);
});
```

## Best Practices

### 1. Always Cleanup

Use try/finally to ensure cleanup runs:

```typescript
test('my test', async ({ page }) => {
  const user = await createTestUser(TEST_INVITE_CODES.MAIN);

  try {
    // Test code...
  } finally {
    await deleteTestUser(user.id!);
  }
});
```

### 2. Use Fixtures

Create a fixture for authenticated users:

```typescript
// test-fixtures.ts
import { test as base } from '@playwright/test';
import { createTestUser, deleteTestUser } from './helpers/auth';
import { TEST_INVITE_CODES } from './helpers/seed';

export const test = base.extend({
  authenticatedUser: async ({}, use) => {
    const user = await createTestUser(TEST_INVITE_CODES.MAIN);
    await use(user);
    if (user.id) await deleteTestUser(user.id);
  },
});
```

### 3. Cycle Through Codes

If codes get used up, cycle through backups:

```typescript
const code = getTestInviteCode(testInfo.testId.charCodeAt(0) % 5);
```

### 4. Check Environment

Add a setup check in `beforeAll`:

```typescript
test.beforeAll(() => {
  console.log('⚠️  Ensure test invite codes are seeded!');
  console.log('See e2e/helpers/README.md for instructions');
});
```

## Troubleshooting

### Error: "Invalid or already used invite code"

**Cause**: Test codes have been consumed.

**Solution**:
1. Reset codes in admin UI (set `used = false`)
2. Or create new codes
3. Update `TEST_INVITE_CODES` in `seed.ts`

### Error: "401 Unauthorized"

**Cause**: Auth token expired or invalid.

**Solution**:
- Use `setupAuthenticatedPage()` instead of manual token injection
- Check PocketBase is running on port 8090

### Error: "Cannot find module 'pocketbase'"

**Cause**: PocketBase SDK not installed.

**Solution**:
```bash
cd frontend
npm install pocketbase
```

## Future Improvements

These helpers could be enhanced with:

1. **Admin SDK**: Automatically seed/reset test data
2. **Test Fixtures**: Playwright fixtures for auth users
3. **Database Snapshots**: Save/restore DB state between tests
4. **Mock Data Generator**: Create random but valid test data
5. **Parallel Test Isolation**: Separate test databases

## Contributing

When adding authenticated tests:
1. Import helpers from `./helpers/`
2. Use `try/finally` for cleanup
3. Document any new requirements
4. Update this README if adding new helpers
