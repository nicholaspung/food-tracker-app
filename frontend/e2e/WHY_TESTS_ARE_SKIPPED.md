# Why Some E2E Tests Are Skipped

## TL;DR

**Tests are skipped because they require setup that's not automated yet:**
- 🔐 Authentication (need logged-in users)
- 🗄️ Database seeding (need valid invite codes)

**We provide helpers to enable them - see `e2e/helpers/README.md`**

---

## The Philosophy: Runnable Tests Out-of-the-Box

### Goal: Tests Should "Just Work"

We want developers to run `npm run test:e2e` and see **immediate results** without:
- ❌ Mysterious failures
- ❌ Manual database setup
- ❌ Environment configuration
- ❌ "Works on my machine" issues

### Trade-off: Skip Complex Tests by Default

Instead of having tests that fail with cryptic errors, we:
- ✅ Run **basic tests** automatically (form validation, navigation)
- ⏭️ Skip **complex tests** that need setup (authentication, database state)
- 📖 Provide clear instructions to enable skipped tests

---

## What Tests Are Skipped and Why

### 1. Authentication-Required Tests (Profile, Copy Invite)

**Why Skipped:**
```typescript
// This test requires a logged-in user
test.skip('should display user invite codes', async ({ page }) => {
  await page.goto('/profile'); // ❌ Redirects to login - no auth!
```

**Problem:**
- Profile page requires authentication
- No logged-in session = redirect to login
- Test sees login page instead of profile
- Test fails with "element not found"

**Solution:**
```typescript
import { createTestUser, setupAuthenticatedPage } from './helpers/auth';

test('should display user invite codes', async ({ page }) => {
  const user = await createTestUser('TEST2024CODE');
  await setupAuthenticatedPage(page, user); // ✅ Now authenticated!

  await page.goto('/profile'); // ✅ Works!
});
```

### 2. Database State Tests (Signup, Viral Flow)

**Why Skipped:**
```typescript
// This test needs a valid, unused invite code in DB
test.skip('should successfully signup', async ({ page }) => {
  await page.getByTestId('signup-invite-code').fill('TEST2024CODE');
  // ❌ Code doesn't exist or was already used!
```

**Problem:**
- Test requires specific data in database
- Invite codes get consumed on each test run
- Without seeding, codes run out
- Test fails with "invalid invite code"

**Solution:**
```typescript
import { TEST_INVITE_CODES } from './helpers/seed';

// 1. Seed codes in database (see helpers/README.md)
// 2. Use pre-defined test codes
test('should successfully signup', async ({ page }) => {
  await page.getByTestId('signup-invite-code').fill(TEST_INVITE_CODES.MAIN);
  // ✅ Code exists and is unused!
});
```

---

## What Tests DO Run

### ✅ Always-Runnable Tests (No Setup Required)

These tests work out-of-the-box:

1. **Form Validation**
   ```typescript
   test('should show error when invite code is missing', async ({ page }) => {
     // ✅ Tests client-side validation
     // ❌ No backend call = no DB needed
   });
   ```

2. **UI Rendering**
   ```typescript
   test('should display invite code field', async ({ page }) => {
     // ✅ Just checks if element exists
     // ❌ No auth or data needed
   });
   ```

3. **Navigation**
   ```typescript
   test('should pre-fill invite code from URL', async ({ page }) => {
     await page.goto('/signup?code=ANYCODE');
     // ✅ Tests URL parsing and UI update
     // ❌ Doesn't actually use the code
   });
   ```

4. **Error Handling**
   ```typescript
   test('should show error with invalid code', async ({ page }) => {
     // Uses fake code - just tests error display
     await page.fill('signup-invite-code', 'FAKECODE123');
     // ✅ Backend returns error
     // ✅ Frontend displays it
   });
   ```

---

## How to Enable Skipped Tests

### Step 1: Install Dependencies

```bash
cd frontend
npm install pocketbase  # For test helpers
```

### Step 2: Seed Test Data

Create test invite codes in database:

**Option A: Via Admin UI**
1. Go to http://localhost:8090/_/
2. Collection: `invite_codes`
3. Create 5 records:
   - `TEST2024CODE` (used: false)
   - `E2E_CODE_1` through `E2E_CODE_4` (used: false)

**Option B: Via SQL** (in PocketBase console)
```sql
INSERT INTO invite_codes (code, used) VALUES
  ('TEST2024CODE', 0),
  ('E2E_CODE_1', 0),
  ('E2E_CODE_2', 0),
  ('E2E_CODE_3', 0),
  ('E2E_CODE_4', 0);
```

### Step 3: Remove `.skip()` from Tests

In `e2e/invite-codes.spec.ts`:

```typescript
// Before
test.describe.skip('User Invite Codes in Profile', () => {

// After
test.describe('User Invite Codes in Profile', () => {
```

### Step 4: Use Test Helpers

See `e2e/helpers/README.md` for detailed examples.

---

## Alternative Approaches (Not Chosen)

### ❌ Option 1: Require Manual Setup

**Approach**: Don't skip tests, require setup before running.

**Cons:**
- New developers run tests → all fail
- Frustrating "why doesn't this work?" experience
- Have to read docs before running tests
- Easy to forget setup steps

### ❌ Option 2: Mock Everything

**Approach**: Mock PocketBase, authentication, etc.

**Cons:**
- Not true E2E tests
- Miss real integration issues
- Tests pass but app doesn't work
- Defeats purpose of E2E testing

### ✅ Option 3: Skip + Clear Documentation (Our Choice)

**Approach**: Skip complex tests, provide helpers to enable.

**Pros:**
- ✅ Tests "just work" out-of-the-box
- ✅ Basic coverage without setup
- ✅ Clear path to full coverage
- ✅ Real E2E tests (not mocked)

**Cons:**
- ⚠️ Not 100% coverage by default
- ⚠️ Requires manual enablement

---

## Future Improvements

To enable all tests by default, we could:

### 1. **Test Fixtures**

```typescript
// Automatically create/cleanup test users
export const test = base.extend({
  authenticatedUser: async ({}, use) => {
    const user = await createTestUser();
    await use(user);
    await deleteTestUser(user.id);
  },
});
```

### 2. **Database Snapshots**

- Save clean DB state before tests
- Restore after each test run
- Ensures consistent state

### 3. **Admin Auto-Seeding**

```typescript
test.beforeAll(async () => {
  // Automatically seed test data via admin API
  await seedTestInviteCodes();
});
```

### 4. **Docker Test Environment**

```bash
# Spin up isolated test DB
docker-compose -f docker-compose.test.yml up -d

# Run tests against test DB
npm run test:e2e

# Tear down
docker-compose -f docker-compose.test.yml down
```

---

## Summary

**Why skip tests?**
→ To make tests runnable out-of-the-box without frustrating failures

**What's skipped?**
→ Tests requiring auth or specific database state

**How to enable?**
→ See `e2e/helpers/README.md` for full instructions

**Philosophy:**
→ Better to skip and document than to fail mysteriously

---

**Questions?** See:
- `e2e/README.md` - General E2E testing guide
- `e2e/helpers/README.md` - Helper usage guide
- `docs/features/INVITE_CODES.md` - Invite system docs
