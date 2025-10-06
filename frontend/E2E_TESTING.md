# E2E Testing Guide

This project uses Playwright for end-to-end testing in the browser.

## Running Tests

### Run all tests (headless)
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests with browser visible
```bash
npm run test:e2e:headed
```

### View last test report
```bash
npm run test:e2e:report
```

## Test Structure

- Tests are located in `frontend/e2e/` directory
- Each feature should have its own test file (e.g., `login.spec.ts`, `dashboard.spec.ts`)
- Configuration is in `playwright.config.ts`

## Writing Tests

Example test structure:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feature-route');
  });

  test('should do something', async ({ page }) => {
    // Arrange
    const button = page.getByRole('button', { name: 'Submit' });

    // Act
    await button.click();

    // Assert
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

## Workflow for Adding Features

When adding a new feature, follow this workflow:

1. **Implement the feature** - Write the React component/functionality
2. **Write E2E tests** - Create tests that validate the feature works as expected
3. **Run tests** - Execute `npm run test:e2e` to verify everything passes
4. **Fix any failures** - Address any test failures before considering the feature complete

## Test Best Practices

1. Use semantic locators (role, label, text) over CSS selectors
2. Keep tests isolated - each test should be independent
3. Use `test.beforeEach` for common setup
4. Test user workflows, not implementation details
5. Add meaningful test descriptions
6. Use `expect` assertions to verify outcomes

## CI Integration

Tests automatically run with the dev server (configured in `playwright.config.ts`). For CI/CD:
- Tests retry 2 times on failure in CI mode
- Set `CI=true` environment variable for CI runs
- HTML reports are generated after test runs

## Debugging

- Use `--headed` flag to see the browser
- Use `--ui` flag for interactive debugging
- Add `await page.pause()` in tests for manual debugging
- Screenshots are captured on test failures
- Traces are recorded on first retry for debugging
