# E2E Tests - Multi-Tier Testing Strategy

This directory contains end-to-end tests for the mobile tracker app, using a multi-tier testing strategy that runs different test suites based on the environment.

## Testing Strategy

### Multi-Tier Approach

We use three testing tiers:

1. **Tier 1: Local Tests** (`npm run test:e2e:local`)
   - **Target**: `http://localhost:1420`
   - **Purpose**: Fast feedback for PRs and local development
   - **Coverage**: Build validation, UI rendering, client-side logic
   - **Backend-dependent tests**: SKIPPED (requires deployed backend)
   - **Used in**: CI pull requests, local development

2. **Tier 2: Beta Integration Tests** (`npm run test:e2e:beta`)
   - **Target**: `https://beta.myexperiment.life`
   - **Purpose**: Full E2E validation of deployed beta environment
   - **Coverage**: ALL tests (no skips), full authentication and database operations
   - **Backend-dependent tests**: ENABLED (real backend available)
   - **Used in**: CI after beta deployment, gates production deployment

3. **Tier 3: Production Smoke Tests** (`npm run test:e2e:production`)
   - **Target**: `https://myexperiment.life`
   - **Purpose**: Quick validation of production deployment
   - **Coverage**: Critical user flows only
   - **Used in**: Optional post-production deployment validation

### Why This Approach?

**Problem**: Some tests require deployed backend (authentication, database operations).

**Solution**:
- Run fast local tests for quick feedback
- Run comprehensive beta tests before production
- Tests automatically skip/run based on environment

## Test Files

- **`auth.spec.ts`**: Authentication flow tests (login, signup)
- **`profile.spec.ts`**: Profile page tests
- **`invite-codes.spec.ts`**: Comprehensive invite code system tests
- **`helpers/test-environment.ts`**: Environment detection and conditional test execution

## Setup

### For Local Development

**Prerequisites:**
1. **Backend** running on `http://localhost:8090`
2. **Frontend dev server** on `http://localhost:1420`

**No database seeding required** - tests requiring backend are automatically skipped locally.

### For Beta/Production Testing

**Prerequisites:**
1. **Deployed backend** at `beta.myexperiment.life` or `myexperiment.life`
2. **PocketBase admin account** configured in beta environment
3. **GitHub Secrets** configured with admin credentials

### GitHub Actions Setup

Beta E2E tests dynamically generate fresh invite codes using PocketBase admin API. This solves the problem of invite codes being single-use!

**How it works:**
1. Before tests run, authenticate as PocketBase admin
2. Generate fresh invite codes via API
3. Use those codes in tests
4. Clean up test data after tests complete

**Setup Instructions:**

1. **Ensure you have an admin account in beta PocketBase**
   - Go to `https://beta.myexperiment.life/_/`
   - Login or create an admin account
   - Note the admin email and password

2. **Add GitHub Secrets**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add two secrets:
     - **Name**: `BETA_ADMIN_EMAIL`
       **Value**: Your PocketBase admin email
     - **Name**: `BETA_ADMIN_PASSWORD`
       **Value**: Your PocketBase admin password

3. **Deploy and test!**
   - The workflow will automatically:
     - Authenticate as admin
     - Generate fresh invite codes
     - Run all tests
     - Clean up test data

**Benefits of this approach:**
- ✅ No manual invite code creation needed
- ✅ Tests always have fresh, unused codes
- ✅ Automatic cleanup of test data
- ✅ No risk of running out of invite codes

### Creating Test Invite Codes (Local Development Only)

For **local development**, you can manually create a test invite code. For **beta/production**, invite codes are generated automatically via admin API!

#### Option 1: Via Admin UI (Manual)

```bash
# 1. Start the backend
cd backend
go run main.go serve

# 2. Open admin UI
open http://localhost:8090/_/

# 3. Navigate to invite_codes collection
# 4. Create new record:
#    - code: "TEST2024CODE"
#    - used: false
#    - createdBy: (leave empty)
```

#### Option 2: Via Migration (Automated)

For local development, you can create a test seed migration:

```bash
cd backend
go run main.go migrate create seed_test_invite_codes
```

Edit the generated file:

```go
// migrations/XXXXX_seed_test_invite_codes.go
package migrations

import (
    "github.com/pocketbase/pocketbase/core"
    m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
    m.Register(func(app core.App) error {
        collection, _ := app.FindCollectionByNameOrId("invite_codes")

        testCodes := []string{"TEST2024CODE", "E2ECODE1", "E2ECODE2"}
        for _, code := range testCodes {
            record := core.NewRecord(collection)
            record.Set("code", code)
            record.Set("used", false)
            app.Save(record)
        }
        return nil
    }, func(app core.App) error { return nil })
}
```

Then run:

```bash
go run main.go migrate up
```

> **Note:** Local test codes can be reused multiple times since local tests skip backend-dependent tests. Beta/production tests automatically generate and clean up their own codes.

## Test Status by Environment

### ✅ Always Run (All Environments)
- Signup form validation
- Pre-populated invite code from URL
- Form field requirements
- Password mismatch errors
- Navigation flows
- Error handling
- UI rendering

### ⏭️ Skipped Locally, ✅ Run in Beta/Production

Tests with `skipIfLocal()` are automatically skipped in local environment but run in beta/production:

1. **Authentication Required**:
   - Profile page tests
   - Copy invite functionality
   - Viewing user's invite codes

2. **Database State Required**:
   - Successful signup test
   - Viral network flow
   - Code usage tracking

**How it works:**

Tests use the `skipIfLocal()` helper from `e2e/helpers/test-environment.ts`:

```typescript
import { skipIfLocal } from './helpers/test-environment';

test('backend-dependent test', async ({ page }) => {
  skipIfLocal(); // Automatically skipped in local, runs in beta/prod

  // Test code requiring backend...
});
```

**No manual setup needed** - tests automatically adapt to the environment!

## Running Tests

### Environment-Specific Test Commands

```bash
# LOCAL: Run tests against localhost (some tests skipped)
npm run test:e2e:local

# BETA: Run ALL tests against beta environment (no skips)
npm run test:e2e:beta

# PRODUCTION: Run smoke tests against production
npm run test:e2e:production

# DEFAULT: Run tests with default config (equivalent to local)
npm run test:e2e
```

### Run Specific Test File

```bash
# Run only invite code tests (local)
npx playwright test e2e/invite-codes.spec.ts --config=playwright.config.local.ts

# Run only invite code tests (beta - all tests run)
npx playwright test e2e/invite-codes.spec.ts --config=playwright.config.beta.ts

# Run specific test by name
npx playwright test -g "should successfully signup"
```

### Run in UI Mode (Interactive)

```bash
npm run test:e2e:ui
```

### Run in Headed Mode (Watch Browser)

```bash
npm run test:e2e:headed
```

### Run Specific Test

```bash
npx playwright test -g "should successfully signup with valid invite code"
```

## Test Coverage

### Invite Code Tests (`invite-codes.spec.ts`)

#### 1. **Signup with Invite Code** (Active)
- ✅ Display invite code field
- ✅ Show error when invite code is missing (bypasses HTML5 validation)
- ✅ Show error with invalid invite code
- ⏭️ Successfully signup with valid code (skipped - requires DB setup)

#### 2. **Pre-populated Invite Code from URL** (Active)
- ✅ Pre-fill invite code from `?code=` parameter
- ✅ Show welcome message for invited users
- ✅ Allow editing pre-filled code

#### 3. **User Invite Codes in Profile** (Skipped)
- ⏭️ Display invite codes section (requires auth)
- ⏭️ Show loading state (requires auth)

#### 4. **Copy Invite Functionality** (Skipped)
- ⏭️ Show copy button for available codes (requires auth)
- ⏭️ Copy personalized invitation message (requires auth)

#### 5. **Invite Code Status** (Skipped)
- ⏭️ Show "Available" vs "Used" status (requires auth)
- ⏭️ Hide copy button for used codes (requires auth)
- ⏭️ Apply strikethrough styling to used codes (requires auth)

#### 6. **Viral Network Flow** (Skipped)
- ⏭️ Complete end-to-end viral invite flow with user deletion (requires deployed backend)
  - Fresh invite code is generated via PocketBase admin API
  - User A signs up with generated invite code
  - User A navigates to profile and copies an invite code
  - User A logs out
  - User B signs up using User A's invite code via URL parameter
  - User B deletes their account
  - User A logs back in and verifies invite code is marked as "Used"
  - User A deletes their account
  - All test data is automatically cleaned up
- ⏭️ Reject signup with fake invite code (requires backend)

#### 7. **Error Handling**
- ⏭️ Prevent reusing already-used codes (creates a used code via API, then tests rejection)
- ✅ Handle network errors gracefully (offline mode)

### Auth Tests (`auth.spec.ts`)

Updated to include invite code field in all signup tests:
- ✅ Display invite code input
- ✅ Require invite code field
- ✅ Validate with other form fields

## Debugging Tests

### View Test Report

```bash
npm run test:e2e:report
```

### View Traces

Traces are recorded on first retry. Open them with:

```bash
npx playwright show-trace test-results/path-to-trace.zip
```

### Screenshots

Screenshots are captured on failure in `test-results/`

## Test Data Cleanup

Tests use randomly generated emails (`test-{timestamp}-{random}@example.com`) to avoid conflicts. However, you may want to periodically clean up test users:

```bash
# Via PocketBase Admin UI
# Go to http://localhost:8090/_/ -> users collection
# Filter by email containing "test-"
# Bulk delete test users
```

## CI/CD Integration

### GitHub Actions Workflow

The deployment workflow runs tests at multiple stages:

1. **On Push to Main** or **Manual Beta Deploy**:
   ```
   test-local → deploy-beta → test-beta-after-deploy
   ```
   - `test-local`: Build validation with local tests
   - `deploy-beta`: Deploy to beta environment
   - `test-beta-after-deploy`: Full E2E tests against deployed beta

2. **Manual Production Deploy**:
   ```
   test-local → test-beta-before-prod → deploy-production
   ```
   - `test-local`: Build validation
   - `test-beta-before-prod`: Re-validate beta environment before promoting
   - `deploy-production`: Deploy to production (only if beta tests pass)

### CI Environment Variables

Tests detect CI environment and adjust behavior:

```bash
# CI mode (2 retries, sequential execution)
CI=true npm run test:e2e:local

# Beta environment testing (invite codes generated automatically)
BETA_ADMIN_EMAIL=admin@example.com \
BETA_ADMIN_PASSWORD=your_password \
npm run test:e2e:beta  # Uses beta.myexperiment.life

# Production environment testing
npm run test:e2e:production  # Uses myexperiment.life
```

**GitHub Actions automatically sets:**
- `CI=true` (enables retries and sequential execution)
- `BETA_ADMIN_EMAIL=${{ secrets.BETA_ADMIN_EMAIL }}` (PocketBase admin credentials)
- `BETA_ADMIN_PASSWORD=${{ secrets.BETA_ADMIN_PASSWORD }}` (PocketBase admin credentials)

## Best Practices

1. **Use semantic locators**: `getByTestId()`, `getByRole()`, `getByText()`
2. **Independent tests**: Each test should be isolated
3. **Wait for elements**: Use `await expect().toBeVisible()` instead of timeouts
4. **Unique test data**: Generate random emails/codes per test
5. **Cleanup**: Logout after tests that create sessions

## Troubleshooting

### Test Fails: "invalid or already used invite code"

**Cause**: Test invite code has been used.

**Solution**:
1. Reset test code in admin UI (set `used = false`)
2. Or create new test codes via migration

### Test Fails: "Element not found"

**Cause**: Page hasn't loaded or element doesn't exist.

**Solution**:
1. Check if backend is running
2. Increase timeout: `{ timeout: 10000 }`
3. Add wait: `await page.waitForLoadState('networkidle')`

### Test Fails: "Clipboard permissions denied"

**Cause**: Browser doesn't have clipboard permissions.

**Solution**: Tests include `context.grantPermissions(['clipboard-read', 'clipboard-write'])`

## Contributing

When adding new features:

1. Add corresponding E2E tests
2. Use existing test patterns
3. Follow naming conventions
4. Document test scenarios in this README
5. Ensure tests pass before committing

## Related Documentation

- [INVITE_CODES.md](../../docs/features/INVITE_CODES.md) - Invite code system documentation
- [E2E_TESTING.md](../../docs/E2E_TESTING.md) - General E2E testing guide
- [Playwright Docs](https://playwright.dev) - Official Playwright documentation
