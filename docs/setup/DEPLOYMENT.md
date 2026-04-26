# VPS Deployment Guide

## Prerequisites

- Ubuntu VPS with sudo access
- domain DNS pointed at the VPS
- repository cloned to `/opt/food-tracker-app`

## Initial Setup

Run the base server setup:

```bash
cd /opt/food-tracker-app
bash scripts/setup-vps.sh
```

Log out and back in after it completes so Docker group permissions take effect.

## Automated Post-Setup

Run:

```bash
cd /opt/food-tracker-app
bash scripts/post-setup.sh
```

That script will:

- configure and deploy `Caddyfile`
- create the root `.env`
- build and start the PocketBase Docker image
- run the unified production deploy, which builds and deploys marketing/app/admin web surfaces
- prepare backup directories and logs

## Deploying Updates

### Production

```bash
cd /opt/food-tracker-app
bash scripts/deploy.sh production
```

### Beta

```bash
cd /opt/food-tracker-app
bash scripts/deploy.sh beta
```

## What Gets Deployed

### Production

- site: `https://yummyrecs.com`
- app web: `https://app.yummyrecs.com`
- admin web: `https://admin.yummyrecs.com`
- static files:
  - `/opt/food-tracker-app/marketing_build`
  - `/opt/food-tracker-app/app_build`
  - `/opt/food-tracker-app/admin_build`
- PocketBase: `localhost:8090`
- data dir: `/opt/food-tracker-app/backend/pb_data_production`

### Beta

- site: `https://beta.yummyrecs.com`
- app web: `https://beta.app.yummyrecs.com`
- admin web: `https://beta.admin.yummyrecs.com`
- static files:
  - `/opt/food-tracker-app/marketing_build_beta`
  - `/opt/food-tracker-app/app_build_beta`
  - `/opt/food-tracker-app/admin_build_beta`
- PocketBase: `localhost:8091`
- data dir: `/opt/food-tracker-app/backend/pb_data_beta`

## GitHub Actions

The deploy workflow SSHes into the VPS and runs `scripts/deploy.sh`. The server-side script is the source of truth for deployment behavior.

The deploy workflow also generates Universal Link/App Link association files for customer-facing auth emails:

- `app_build/.well-known/apple-app-site-association`
- `app_build/.well-known/assetlinks.json`

Add these GitHub environment secrets to both `beta` and `production` so those files can be generated during deploy:

```bash
FOOD_TRACKER_IOS_TEAM_ID=
FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS=
```

If either value is missing, deploy still succeeds, but the corresponding association file is skipped and HTTPS auth links may open in the browser instead of the installed app.

## Troubleshooting

### Site not updating

```bash
ls -la /opt/food-tracker-app/marketing_build
ls -la /opt/food-tracker-app/app_build
ls -la /opt/food-tracker-app/admin_build
sudo systemctl reload caddy
bash scripts/deploy.sh production
```

### PocketBase not healthy

```bash
docker compose ps
docker compose logs pocketbase
curl http://localhost:8090/api/health
```

### Beta not healthy

```bash
docker compose -f docker-compose.beta.yml ps
docker compose -f docker-compose.beta.yml logs pocketbase_beta
curl http://localhost:8091/api/health
```
