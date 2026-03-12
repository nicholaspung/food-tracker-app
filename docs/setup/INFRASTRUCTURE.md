# Infrastructure Setup Guide

## Architecture

Production is split into four pieces:

- PocketBase runs in Docker from `backend/`
- Caddy runs on the VPS host and terminates HTTPS
- the marketing site is copied from `apps/marketing/dist` into `marketing_build` and served as static files
- the app/admin web builds are generated from `apps/mobile` and `apps/admin`, then copied into `app_build` and `admin_build`

## VPS Layout

```text
/opt/food-tracker-app/
├── apps/
│   ├── admin/
│   │   └── dist/                # Source of the admin web build
│   ├── marketing/
│   │   └── dist/                # Source of the marketing site
│   └── mobile/
│       └── web-dist/            # Source of the app web build
├── backend/
│   ├── pb_data_production/      # Production PocketBase data
│   └── pb_data_beta/            # Beta PocketBase data
├── docker-compose.yml
├── docker-compose.beta.yml
├── marketing_build/             # Production marketing site
├── marketing_build_beta/        # Beta marketing site
├── app_build/                   # Production app web site
├── app_build_beta/              # Beta app web site
├── admin_build/                 # Production admin web site
├── admin_build_beta/            # Beta admin web site
├── Caddyfile
└── scripts/
```

## Request Flow

```text
Browser
  -> Caddy on :443
    -> yummyrecs.com / beta.yummyrecs.com served from marketing_build*
    -> app.yummyrecs.com / beta.app.yummyrecs.com serve app web and proxy /api/* + /_/*
    -> admin.yummyrecs.com / beta.admin.yummyrecs.com serve admin web and proxy /api/* + /_/*
```

## Deploy Flow

`scripts/deploy.sh` performs:

1. preflight checks
2. git sync on the server
3. dependency install and web builds on the server
4. blue-green deploy of marketing, app web, and admin web
5. PocketBase environment/config refresh
6. PocketBase container rollout
7. Caddy reload and health checks

## Caddy

Caddy serves:

- `yummyrecs.com` from `/opt/food-tracker-app/marketing_build`
- `beta.yummyrecs.com` from `/opt/food-tracker-app/marketing_build_beta`
- `app.yummyrecs.com` from `/opt/food-tracker-app/app_build`
- `beta.app.yummyrecs.com` from `/opt/food-tracker-app/app_build_beta`
- `admin.yummyrecs.com` from `/opt/food-tracker-app/admin_build`
- `beta.admin.yummyrecs.com` from `/opt/food-tracker-app/admin_build_beta`
- PocketBase production on `localhost:8090`
- PocketBase beta on `localhost:8091`

## Backups

Backups live under `/opt/food-tracker-backups/{production,beta}` and include:

- the currently deployed marketing/app/admin static directories
- the matching Docker compose file
- a tarball of the PocketBase data directory

## Operational Notes

- `scripts/setup-vps.sh` installs Docker, Docker Compose, Caddy, Node.js, pnpm, fail2ban, backups, and log rotation.
- `scripts/post-setup.sh` configures Caddy, creates `.env`, starts PocketBase, and hands off to `scripts/deploy.sh production`.
- `scripts/setup-beta.sh` prepares the beta PocketBase data directory and runs `scripts/deploy.sh beta`.
