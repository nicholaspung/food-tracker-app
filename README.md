# Yummy Recs

Yummy Recs is a multi-app workspace for the mobile product, admin console, backend, and public marketing pages.

Proprietary software. Copyright (c) 2025-2026 Yummy Recs. All rights reserved. No permission is granted to use, copy, modify, distribute, or commercialize this code without prior written permission from Yummy Recs. Permission requests: legal@yummyrecs.com.

## Apps

- `apps/mobile`: Expo + React Native mobile app
- `apps/admin`: Vite + React admin console
- `apps/marketing`: Static public site served by Caddy in production
- `tools/frontend`: Vite tools UI for tutorial media and asset workflows
- `tools/backend`: Isolated tools PocketBase backend
- `backend`: PocketBase-based Go backend

## Tooling

- Node.js 20+
- `pnpm` via Corepack
- Go 1.24+

## Local Development

Install workspace dependencies once from the repo root:

```bash
corepack enable
pnpm install
```

Start the main local workflow:

```bash
pnpm dev
```

That script starts:

- the admin app on `http://localhost:5173`
- the backend on `http://localhost:8090`
- the static marketing site on `http://localhost:4173`
- the Expo mobile dev client flow

Useful commands:

```bash
pnpm dev:admin
pnpm dev:api
pnpm mobile:start
pnpm mobile:ios
pnpm mobile:android
pnpm mobile:lint
pnpm mobile:typecheck
pnpm admin:build
pnpm admin:typecheck
```

## Environment Files

- `apps/mobile/.env.example`: mobile app local API and observability config
- `apps/admin/.env.example`: admin API URL override
- `backend/.env.example`: backend runtime URLs and service integrations for local development
- `.env`: VPS deployment metadata created by `scripts/post-setup.sh`

## Environment Modes

The workspace now uses three shared environment modes:

- `local`: app web `http://localhost:8081`, admin `http://localhost:5173`, marketing `http://localhost:4173`, backend `http://127.0.0.1:8090`
- `beta`: marketing `https://beta.yummyrecs.com`, app web/API `https://beta.app.yummyrecs.com`, admin `https://beta.admin.yummyrecs.com`
- `production`: marketing `https://yummyrecs.com`, app web/API `https://app.yummyrecs.com`, admin `https://admin.yummyrecs.com`

`pnpm dev` exports the `local` environment automatically. `scripts/deploy.sh beta` and `scripts/deploy.sh production` export the matching hosted environment before building and starting services.

## Production Deployment

Production serves:

- PocketBase via Docker
- the marketing site from `apps/marketing/dist`, copied to `marketing_build` on the VPS
- the app web build from `apps/mobile/web-dist`, copied to `app_build` on the VPS
- the admin web build from `apps/admin/dist`, copied to `admin_build` on the VPS
- app-link association files under `app_build/.well-known` for customer-facing auth email links
- Caddy on the host machine, routing `yummyrecs.com`, `app.yummyrecs.com`, and `admin.yummyrecs.com`

Deployment docs live in [docs/setup/README.md](docs/setup/README.md).

GitHub deploy environments must include app-link association secrets in addition to the backend API keys:

```bash
FOOD_TRACKER_IOS_TEAM_ID=
FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS=
```

See [docs/setup/ENV_GUIDE.md](docs/setup/ENV_GUIDE.md) for where to find those values.

Useful scripts:

```bash
bash scripts/setup-vps.sh
bash scripts/post-setup.sh
bash scripts/deploy.sh production
bash scripts/deploy.sh beta
```
