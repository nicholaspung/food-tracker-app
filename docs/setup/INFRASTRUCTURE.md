# Infrastructure Setup Guide

## Architecture

Production is split into four pieces:

- PocketBase runs in Docker from `backend/`
- Caddy runs on the VPS host and terminates HTTPS
- the marketing site is copied from `apps/marketing/dist` into `marketing_build` and served as static files
- the app/admin web builds are generated from `apps/mobile` and `apps/admin`, then copied into `app_build` and `admin_build`

## VPS Layout

```text
/opt/food-tracker-app-production/  # Production account only
├── backend/pb_data_production/
├── marketing_build/
├── app_build/
├── admin_build/
└── source checkout

/opt/food-tracker-app/             # Beta account only
├── backend/pb_data_beta/
├── marketing_build_beta/
├── app_build_beta/
├── admin_build_beta/
└── source checkout
```

## Request Flow

```text
Browser
  -> Caddy on :443
    -> yummyrecs.com / beta.yummyrecs.com served from marketing_build*
    -> app.yummyrecs.com / beta.app.yummyrecs.com serve app web and proxy /api/*
    -> admin.yummyrecs.com / beta.admin.yummyrecs.com serve admin web and proxy /api/* + /_/*
```

## Deploy Flow

`scripts/deploy.sh` performs:

1. Production launcher selection and verification of the environment-approved commit (Production only)
2. preflight checks
3. dependency install and web builds on the server
4. blue-green deploy of marketing, app web, and admin web
5. PocketBase environment/config refresh
6. PocketBase container rollout
7. Caddy reload, health checks, and immutable deployment provenance recording

## Caddy

Caddy serves:

- `yummyrecs.com` from `/opt/food-tracker-app-production/marketing_build`
- `beta.yummyrecs.com` from `/opt/food-tracker-app/marketing_build_beta`
- `app.yummyrecs.com` from `/opt/food-tracker-app-production/app_build`
- `beta.app.yummyrecs.com` from `/opt/food-tracker-app/app_build_beta`
- `admin.yummyrecs.com` from `/opt/food-tracker-app-production/admin_build`
- `beta.admin.yummyrecs.com` from `/opt/food-tracker-app/admin_build_beta`
- PocketBase production on `localhost:8090`
- PocketBase beta on `localhost:8091`

## Backups

Backups live under `/opt/food-tracker-backups/{production,beta}` and include:

- the currently deployed marketing/app/admin static directories
- the matching Docker compose file
- a tarball of the PocketBase data directory
- the bind-mounted PocketBase migration, hook, and public-file directories
- the prior deployment's approved commit and immutable artifact digests

## Operational Notes

- `scripts/setup-vps.sh` installs Docker, Docker Compose, Caddy, Node.js, pnpm, fail2ban, backups, and log rotation.
- `scripts/post-setup.sh` performs base host setup; provision the separate Production checkout and restricted launcher in `docs/setup/DEPLOYMENT.md` before enabling automated Production deploys.
- `scripts/setup-beta.sh` prepares the beta PocketBase data directory and runs `scripts/deploy.sh beta`.
