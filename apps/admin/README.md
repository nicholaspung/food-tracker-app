# Admin App

Internal moderation and operations console for Food Tracker.

## Stack

- React + TypeScript
- Vite
- pnpm
- React Router
- TanStack Query
- PocketBase browser client

## Run

1. Copy `.env.example` to `.env.local` if you need a non-default API URL.
2. Install workspace dependencies from the repo root:

```bash
corepack enable
pnpm install
```

3. Start the app:

```bash
pnpm --filter @food-tracker/admin dev -- --host localhost --port 5173
```

## Initial Routes

- `/login`
- `/dashboard`
- `/menu-reviews`
- `/menu-reviews/:requestId`
- `/feedback`
- `/access-controls`
- `/moderation`
- `/users`
- `/users/:userId`

## Architecture Notes

- `src/features/*/api.ts` holds PocketBase data access.
- `src/features/auth/AuthProvider.tsx` owns the admin session gate.
- `src/components/layout/AdminShell.tsx` is the shared admin frame.
- Query keys are namespaced under `['admin', ...]`.

## Next Backlog

- Add feedback thread detail and admin reply workflow.
- Add dedicated flagged-comment and flagged-photo collections/statuses in PocketBase.
- Add audit logging for moderation decisions.
- Add role-based permissions beyond a single `isAdmin` boolean.
