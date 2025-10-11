# Mobile Tracker App

A personal productivity suite built as a Tauri desktop application for tracking various aspects of daily life. This project serves as a collection of integrated tracking tools with a focus on AI-assisted development using Claude Code.

## Project Vision

This application provides a unified interface for tracking:

- **Time Tracker** - Monitor how you spend your time across different activities
- **Habit Tracker** - Track daily habits (built on metric tracking foundation)
- **Journal Tracker** - Record daily thoughts and reflections
- **People Tracker** - Manage relationships and interactions

All data is stored locally using PocketBase, ensuring privacy and offline-first functionality.

## Tech Stack

- **Frontend**: Tauri v2 + React 19 + TypeScript + Vite
- **Backend**: PocketBase (Go-based backend-as-a-service)
- **Routing**: TanStack Router (file-based)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **State Management**: TanStack Query + TanStack Form
- **Testing**: Playwright (E2E browser tests)

## Prerequisites

- **Node.js** (v18 or higher)
- **Go** (1.24.3 or higher)
- **Rust** (latest stable - for Tauri development)
- **npm** or **pnpm**

## Getting Started

### 1. Install Dependencies

```bash
# Install frontend dependencies
cd frontend
npm install
```

### 2. Start the Backend

The backend uses PocketBase, which provides the database, admin UI, and REST/realtime APIs.

```bash
cd backend
go run main.go serve
```

The PocketBase server will start on `http://localhost:8090`

- Admin UI: `http://localhost:8090/_/`
- API: `http://localhost:8090/api/`

### 3. Start the Frontend

In a separate terminal:

```bash
cd frontend
npm run dev
```

The Tauri app will launch with the dev server running on `http://localhost:1420`

### 4. Running Tests

End-to-end tests automatically start the dev server and validate functionality:

```bash
cd frontend
npm run test:e2e          # Run all tests headless
npm run test:e2e:ui       # Interactive test UI
npm run test:e2e:headed   # Run with visible browser
```

See `frontend/E2E_TESTING.md` for detailed testing documentation.

## Development Workflow

This project uses an AI-assisted development workflow with Claude Code:

1. **Feature Implementation** - Implement features using Claude Code subagents
2. **CLI Verification** - Verify functionality works via command-line testing
3. **E2E Testing** - Create Playwright tests that validate the full stack (frontend + PocketBase backend)
4. **Data Validation** - Ensure all data flows correctly through the PocketBase API

### Building for Production

```bash
cd frontend
npm run build           # TypeScript check + Vite build
npm run tauri build     # Build Tauri desktop app
```

## Project Structure

```
mobile-tracker-app/
├── frontend/                 # Tauri + React application
│   ├── src/
│   │   ├── routes/          # TanStack Router file-based routes
│   │   ├── components/      # React components
│   │   └── lib/             # Utilities (PocketBase client, etc.)
│   ├── e2e/                 # Playwright E2E tests
│   ├── src-tauri/           # Tauri Rust code
│   └── package.json
├── backend/                 # PocketBase Go server
│   ├── main.go              # Server entry point
│   └── go.mod
└── CLAUDE.md                # AI development guidance
```

## Development Philosophy

- **Test-Driven**: Every feature should have E2E tests before completion
- **CLI-First**: Features should be verifiable from the command line
- **Data Integrity**: All data operations validated through PocketBase
- **AI-Assisted**: Leverage Claude Code for rapid, reliable development

## Contributing

This is a personal project, but the development approach and architecture may be useful as a reference for AI-assisted application development.

## Production Deployment

This project includes production-ready deployment infrastructure for VPS hosting.

**📚 Complete deployment documentation:** See [`docs/`](docs/)

**Quick Start:**
1. [Infrastructure Overview](docs/INFRASTRUCTURE.md) - Architecture deep-dive
2. [Deployment Guide](docs/DEPLOYMENT.md) - Step-by-step VPS setup
3. [Path to 100/100](docs/PATH_TO_100.md) - Achieve perfect production score

**Current Production Score: 92/100** ⭐

Features:
- ✅ Zero-downtime deployments (blue-green strategy)
- ✅ Zero-downtime backups (SQLite online backup)
- ✅ Automatic rollback on failure
- ✅ Production-grade security (fail2ban, security headers, resource limits)
- ✅ Comprehensive error handling
- ✅ HTTP/3 support

See [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) for full details.

## License

This project is for personal use.
