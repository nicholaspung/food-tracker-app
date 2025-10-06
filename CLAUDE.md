# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a mobile tracker application built with:
- **Frontend**: Tauri v2 desktop app with React 19, TypeScript, and Vite
- **Backend**: Go-based PocketBase server (v0.30.1) running on port 8090
- **Routing**: TanStack Router with file-based routing
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **State Management**: TanStack Query and TanStack Form
- **Testing**: Playwright for end-to-end browser testing

**IMPORTANT: Mobile-First Design**
- This is a **mobile-native application** - all features MUST be designed for mobile devices
- Design exclusively for mobile viewport - do NOT consider desktop or other responsive breakpoints
- Use mobile-appropriate UI patterns (bottom navigation, mobile gestures, mobile-friendly touch targets)
- Ignore desktop responsiveness - focus only on mobile UX

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

### E2E Testing
```bash
cd frontend
npm run test:e2e         # Run all tests headless
npm run test:e2e:ui      # Interactive UI mode
npm run test:e2e:headed  # Run with visible browser
npm run test:e2e:report  # View last test report
```

Test files are in `frontend/e2e/`. Playwright auto-starts the dev server at http://localhost:1420.

## Architecture

### Frontend Architecture
- **Routing**: File-based routing in `frontend/src/routes/`
  - `__root.tsx` - Root layout component
  - `index.tsx` - Login page (/)
  - `signup.tsx` - Sign up page
  - `home.tsx` - Home page (post-login)
  - `profile.tsx` - User profile page
  - Routes are auto-generated into `routeTree.gen.ts` by TanStack Router plugin
- **PocketBase Client**: Singleton instance in `src/lib/pocketbase.ts` connecting to backend at http://127.0.0.1:8090
- **Components**: Page components in `src/components/` (LoginPage, SignUpPage, HomePage, ProfilePage)
- **Alias**: `@/` maps to `frontend/src/`

### Backend Architecture
- **PocketBase**: Embedded database and API server (Go-based BaaS)
  - Main entry point: `backend/main.go`
  - Static file serving from `./pb_public` directory
  - Default admin UI at http://localhost:8090/_/
  - Auto-generated REST and realtime APIs

### Tauri Integration
- Tauri configuration in `frontend/src-tauri/`
- Rust crate name: `mobile_tracker_app_lib`
- Uses tauri-plugin-opener for external links
- Dev server must run on port 1420 (strict port requirement)

## Development Workflow

When adding features:
1. Implement the React component/functionality
2. Add E2E tests in `frontend/e2e/` following the test structure in E2E_TESTING.md
3. Run `npm run test:e2e` to verify tests pass
4. Address any test failures before completion

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
- **React**: v19.1.0
- **TanStack Router**: v1.132.41 (file-based routing)
- **TanStack Query**: v5.90.2 (server state)
- **TanStack Form**: v1.23.5 (form management)
- **PocketBase JS SDK**: v0.26.2
- **Playwright**: v1.55.1 (E2E testing)
- **Tailwind CSS**: v4.1.14
- **TypeScript**: v5.8.3

## Testing Notes
- Tests use semantic locators (role, label, text) over CSS selectors
- Each test should be independent and isolated
- Tests retry 2 times on CI (when CI=true env var is set)
- HTML reports generated after test runs
- Screenshots captured on test failures
- Traces recorded on first retry for debugging
