# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a mobile food tracker application built with:
- **Frontend**: Tauri v2 desktop app with React 19, TypeScript, and Vite
- **PWA Support**: Progressive Web App capabilities via vite-plugin-pwa (works on Android & iOS browsers)
- **Backend**: Go-based PocketBase server (v0.30.1) running on port 8090
- **Routing**: TanStack Router with file-based routing
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **State Management**: TanStack Query and TanStack Form
- **Testing**: Cypress for end-to-end browser testing

**Distribution Options:**
- **Native App**: Tauri wrapper for desktop/mobile (uses localhost:8090)
- **Web App (PWA)**: Installable web app for browsers (requires deployed backend)
- See `PWA_DEPLOYMENT.md` for complete PWA deployment guide

**IMPORTANT: Mobile-First Design**
- This is a **mobile-native application** - all features MUST be designed for mobile devices
- Design exclusively for mobile viewport - do NOT consider desktop or other responsive breakpoints
- Use mobile-appropriate UI patterns (bottom navigation, mobile gestures, mobile-friendly touch targets)
- Ignore desktop responsiveness - focus only on mobile UX

**Offline Data Sync**
- The app supports full offline functionality via IndexedDB-based sync queue
- All mutations (create/update/delete) are queued when offline and auto-sync when online
- Use `useOfflineCreate`, `useOfflineUpdate`, `useOfflineDelete` hooks for offline-aware mutations
- See `OFFLINE_SYNC.md` for complete documentation and usage examples
- Sync status indicator automatically shows pending/failed operations

## Development Commands

### Frontend Development
```bash
cd frontend
npm run dev              # Start Vite dev server (port 1420)
npm run build            # TypeScript check + production build
npm run preview          # Preview production build
npm run tauri            # Tauri CLI commands
```

### Backend Development
```bash
cd backend
go run main.go serve     # Start PocketBase server (port 8090)
```

**System Dependencies:**
- **libheif** - Required for HEIC/HEIF image conversion
  - Ubuntu/Debian: `sudo apt-get install libheif-dev`
  - macOS: `brew install libheif`
  - Required by the `/api/convert-heic` endpoint for iPhone photo uploads

### E2E Testing
```bash
cd frontend
npm run test:e2e         # Run all tests (starts dev server automatically)
npm run cypress:open     # Open Cypress test runner (interactive)
npm run cypress:run      # Run tests headless (requires dev server running)
```

Test files are in `frontend/cypress/e2e/`. The `test:e2e` command auto-starts the dev server and runs tests.

**Pre-push Hook**: Tests automatically run before `git push`. Set up with `./setup-hooks.sh` from project root.

## Architecture

### Frontend Architecture
- **Routing**: File-based routing in `frontend/src/routes/`
  - `__root.tsx` - Root layout component
  - `index.tsx` - Login page (/)
  - `signup.tsx` - Sign up page
  - `home.tsx` - Home page (post-login)
  - `profile.tsx` - User profile page
  - `restaurants.tsx` - Restaurants list page
  - `restaurants/$restaurantId.tsx` - Restaurant detail page
  - Routes are auto-generated into `routeTree.gen.ts` by TanStack Router plugin
- **PocketBase Client**: Singleton instance in `src/lib/pocketbase.ts` connecting to backend at http://127.0.0.1:8090
- **Components**: Page components in `src/components/` (LoginPage, SignUpPage, HomePage, ProfilePage, RestaurantsPage, RestaurantDetailPage)
- **Alias**: `@/` maps to `frontend/src/`

### Backend Architecture
- **PocketBase**: Embedded database and API server (Go-based BaaS)
  - Main entry point: `backend/main.go`
  - Static file serving from `./pb_public` directory
  - Default admin UI at http://localhost:8090/_/
  - Auto-generated REST and realtime APIs
- **Collections**:
  - `users` - User authentication
  - `invite_codes` - Invite code system
  - `restaurants` - Restaurant tracking
  - `food_items` - Food items at restaurants
  - `ratings` - User ratings for food items
  - `menu_images` - Uploaded menu photos for OCR
  - `menu_items` - Menu items extracted from photos
- **Custom Endpoints**:
  - `POST /api/convert-heic` - Converts HEIC/HEIF images to JPEG (requires auth)
  - `GET /api/invite-codes/inviter/{code}` - Get inviter info from invite code
  - `GET /api/users/by-friend-code/{code}` - Find user by friend code
  - `GET /api/invite-codes` - Get unused invite codes for authenticated user
  - `POST /api/invite-codes/generate` - Generate new invite codes (initial user only)

### Tauri Integration
- Tauri configuration in `frontend/src-tauri/`
- Rust crate name: `mobile_tracker_app_lib`
- Uses tauri-plugin-opener for external links
- Dev server must run on port 1420 (strict port requirement)

## Development Workflow

When adding features:
1. Implement the React component/functionality
2. Add E2E tests in `frontend/cypress/e2e/`
3. Run `npm run test:e2e` to verify tests pass
4. Address any test failures before completion

**Pre-push Testing**:
- Tests automatically run before `git push` via pre-push hook
- Hook checks if backend is running before running tests
- Push is blocked if tests fail
- Skip hook with `git push --no-verify` (not recommended)

## Subagent Usage (for Claude Code)

**Proactively use subagents** from `.claude/subagents/` for the following tasks:

- **code-analyzer**: ALWAYS use BEFORE implementing new features to find reusable code
- **feature-implementer**: Use when user requests a new feature or page
- **test-runner**: Use after code changes to run and analyze E2E tests
- **code-reviewer**: Use after implementing significant features (optional, can ask user first)
- **bug-fixer**: Use when user reports a bug or issue
- **refactoring-agent**: Use when user requests refactoring or code improvement
- **documentation-writer**: Use when user requests documentation updates

**Workflow example:**
1. User: "Add a notifications page"
2. Claude: Invoke `code-analyzer` to find reusable patterns
3. Claude: Invoke `feature-implementer` to build the feature
4. Claude: Invoke `test-runner` to verify tests pass
5. Claude: (Optionally) Invoke `code-reviewer` to review the implementation

## Key Dependencies

### Frontend
- **React**: v19.1.0
- **TanStack Router**: v1.132.41 (file-based routing)
- **TanStack Query**: v5.90.2 (server state)
- **TanStack Form**: v1.23.5 (form management)
- **PocketBase JS SDK**: v0.26.2
- **Cypress**: v13.17.0 (E2E testing)
- **Tailwind CSS**: v4.1.14
- **TypeScript**: v5.8.3

### Backend
- **PocketBase**: v0.30.1 (Go-based BaaS)
- **goheif**: github.com/jdeng/goheif (HEIC image conversion)
- **System Dependency**: libheif library (for HEIC/HEIF support)

## Testing Notes
- Tests use `data-testid` attributes for selecting elements
- Each test should be independent and isolated
- localStorage is cleared before each test
- Screenshots captured on test failures
- Tests run locally only (no CI) via pre-push git hook
- Mobile viewport: 428x926
- Custom commands: `cy.login(email, password)`, `cy.logout()`
