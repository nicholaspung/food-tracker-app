# Environment Variables Guide

## Root `.env`

`scripts/post-setup.sh` creates `/opt/food-tracker-app/.env` on the VPS with:

```bash
APP_NAME=food-tracker-app
DOMAIN=yourdomain.com
ADMIN_EMAIL=you@example.com
TZ=America/Los_Angeles
```

This file is deployment metadata for the server scripts and Caddy setup.

## Mobile App

Use `apps/mobile/.env.example` as the template for local mobile development.

Typical local values:

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8090
EXPO_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
EXPO_PUBLIC_POSTHOG_API_KEY=
EXPO_PUBLIC_POSTHOG_HOST=
```

## Admin App

Use `apps/admin/.env.example` as the template for local admin development.

Typical local value:

```bash
VITE_API_URL=http://127.0.0.1:8090
```

## Public Marketing Site

`apps/marketing/dist` is static and does not use a runtime `.env` file.

The `Open App` marketing links use a deploy-time placeholder replacement:

- local marketing dev injects `http://localhost:8081/`
- beta deploy injects `https://beta.app.yummyrecs.com/`
- production deploy injects `https://app.yummyrecs.com/`

## App/Admin Web Deploy Builds

`scripts/deploy.sh` builds these on the VPS:

- `apps/mobile/web-dist` for `app.yummyrecs.com` or `beta.app.yummyrecs.com`
- `apps/admin/dist` for `admin.yummyrecs.com` or `beta.admin.yummyrecs.com`

The deploy script injects environment-specific API origins before building:

- mobile web uses `https://app.yummyrecs.com` or `https://beta.app.yummyrecs.com`
- admin web uses `https://admin.yummyrecs.com` or `https://beta.admin.yummyrecs.com`

## Local Workflow

```bash
corepack enable
pnpm install
pnpm dev
```

Or run pieces separately:

```bash
pnpm dev:admin
pnpm dev:api
pnpm mobile:start
```

## Production Workflow

```bash
cd /opt/food-tracker-app
bash scripts/post-setup.sh
bash scripts/deploy.sh production
```

## Security Notes

- do not commit real `.env` files
- commit only `.env.example` templates
- keep deployment secrets in the VPS environment or GitHub Actions secrets
