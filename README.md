# Yummy Recs

Yummy Recs is a multi-app workspace for the mobile product, admin console, backend, and public marketing pages.

## Apps

- `apps/mobile`: Expo + React Native mobile app
- `apps/admin`: Vite + React admin console
- `apps/marketing`: Static public site served by Caddy in production
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
- `.env`: VPS deployment metadata created by `scripts/post-setup.sh`

## Production Deployment

Production serves:

- PocketBase via Docker
- the marketing site from `apps/marketing/dist`, copied to `marketing_build` on the VPS
- the app web build from `apps/mobile/web-dist`, copied to `app_build` on the VPS
- the admin web build from `apps/admin/dist`, copied to `admin_build` on the VPS
- Caddy on the host machine, routing `yummyrecs.com`, `app.yummyrecs.com`, and `admin.yummyrecs.com`

Deployment docs live in [docs/setup/README.md](docs/setup/README.md).

Useful scripts:

```bash
bash scripts/setup-vps.sh
bash scripts/post-setup.sh
bash scripts/deploy.sh production
bash scripts/deploy.sh beta
```
