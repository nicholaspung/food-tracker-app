# Cypress E2E Testing

This project uses Cypress for end-to-end testing with a pre-push git hook to ensure all tests pass before pushing code.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Git Hook

From the project root directory:

```bash
./setup-hooks.sh
```

This will install a pre-push hook that automatically runs E2E tests before each `git push`.

### 3. Start the Backend

Before running tests, ensure the PocketBase backend is running:

```bash
cd ../backend
go run main.go serve
```

The backend should be running on `http://127.0.0.1:8090`

### 4. Create a Test User

You'll need a test user in your PocketBase instance for the tests to work:

- Email: `test@example.com`
- Password: `testpassword123`

You can create this user through the PocketBase admin UI at `http://localhost:8090/_/`

## Running Tests

### Run all tests (headless)

```bash
npm run test:e2e
```

This command:
1. Starts the dev server on port 1420
2. Waits for the server to be ready
3. Runs all Cypress tests
4. Shuts down the dev server

### Open Cypress Test Runner (interactive)

```bash
npm run cypress:open
```

This opens the Cypress UI where you can:
- Run individual test files
- See tests run in real-time
- Debug failing tests
- Time travel through test steps

**Note:** You'll need to start the dev server manually first:

```bash
npm run dev
```

### Run tests in headless mode

```bash
npm run cypress:run
```

**Note:** You'll need to start the dev server manually first.

## Test Structure

```
cypress/
├── e2e/                    # Test files
│   ├── auth.cy.ts         # Authentication tests
│   ├── navigation.cy.ts   # Navigation tests
│   └── food-tracker.cy.ts # Food tracker feature tests
├── fixtures/               # Test data
├── support/               # Support files
│   ├── commands.ts        # Custom commands
│   └── e2e.ts            # Global setup
└── README.md             # This file
```

## Writing Tests

Cypress tests follow this pattern:

```typescript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
    cy.login('test@example.com', 'testpassword123');
  });

  it('should do something', () => {
    // Test steps
    cy.visit('/some-page');
    cy.get('[data-testid="some-element"]').click();
    cy.contains('Expected text').should('be.visible');
  });
});
```

### Custom Commands

- `cy.login(email, password)` - Log in a user
- `cy.logout()` - Log out the current user

### Best Practices

1. **Use data-testid attributes** for selecting elements
2. **Keep tests independent** - each test should work in isolation
3. **Clean up state** - localStorage is cleared before each test
4. **Use descriptive names** - test names should clearly describe what they test
5. **Don't test implementation details** - test user behavior, not code

## Pre-Push Hook

The pre-push hook automatically:

1. ✅ Checks if the backend is running
2. ✅ Runs all E2E tests
3. ✅ Allows push if all tests pass
4. ❌ Blocks push if any tests fail

### Skipping the Hook

If you need to push without running tests (not recommended):

```bash
git push --no-verify
```

## Troubleshooting

### Backend not running error

If you see:
```
❌ Error: PocketBase backend is not running!
```

Start the backend:
```bash
cd backend
go run main.go serve
```

### Test user not found

Create the test user in PocketBase admin UI:
- Go to `http://localhost:8090/_/`
- Navigate to Users collection
- Create user with email `test@example.com` and password `testpassword123`

### Port 1420 already in use

Kill the process using port 1420:
```bash
lsof -ti:1420 | xargs kill -9
```

### Tests timing out

Increase the timeout in `cypress.config.ts`:
```typescript
defaultCommandTimeout: 10000, // Increase this value
```

## Continuous Integration

The pre-push hook ensures tests run locally before code is pushed. This project **does not** run tests in CI - all testing happens on the developer's local machine.

## Mobile Viewport

Tests run in a mobile viewport (428x926) to match the mobile-first design of the application.
