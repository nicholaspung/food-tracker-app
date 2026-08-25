# VPS Deployment Guide

## Prerequisites

- Ubuntu VPS with sudo access
- domain DNS pointed at the VPS
- Beta repository checkout at `/opt/food-tracker-app`
- Production repository checkout at `/opt/food-tracker-app-production`, owned only by the Production deploy account

## Initial Setup

Run the base server setup:

```bash
cd /opt/food-tracker-app
bash scripts/setup-vps.sh
```

Log out and back in after it completes so Docker group permissions take effect.

## Legacy Post-Setup

`scripts/post-setup.sh` predates the split deploy accounts and runs Production from `/opt/food-tracker-app`. Do not use it after adopting this hardened layout. For a new or recovered host, follow **Deployment security** below and the full-loss procedure in `docs/operations/DISASTER_RECOVERY.md`.

For historical single-checkout hosts, the old command was:

```bash
cd /opt/food-tracker-app
bash scripts/post-setup.sh
```

That script:

- configure and deploy `Caddyfile`
- create the root `.env`
- build and start the PocketBase Docker image
- run the unified production deploy, which builds and deploys marketing/app/admin web surfaces
- prepare backup directories and logs

Migrate historical hosts to the separate Production checkout before enabling either workflow. Subsequent Production deploys must not run from the Beta checkout.

## Deploying Updates

### Production

```bash
cd /opt/food-tracker-app-production
FOOD_TRACKER_APP_DIR=/opt/food-tracker-app-production bash scripts/deploy.sh production
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
  - `/opt/food-tracker-app-production/marketing_build`
  - `/opt/food-tracker-app-production/app_build`
  - `/opt/food-tracker-app-production/admin_build`
- PocketBase: `localhost:8090`
- data dir: `/opt/food-tracker-app-production/backend/pb_data_production`

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

The Beta workflow runs `scripts/deploy.sh` in the Beta checkout. The Production workflow invokes a root-owned fixed launcher, which updates the isolated Production checkout and then runs the same script there.

### Deployment security

- Keep the workflow token at `contents: read` and retain required reviewers on the GitHub `production` environment.
- Third-party actions and reusable workflows must use reviewed full commit SHAs. `scripts/check-github-action-pins.rb` enforces this in CI; upgrades should change the SHA and its adjacent release comment together. Production SSH uses the runner's OpenSSH client because the previously pinned action downloaded a mutable runtime binary.
- Require CODEOWNER review for changes to the deploy workflow or immutable-action policy. Branch protection must enable **Require review from Code Owners** for this to be enforced.
- Use a dedicated Production deploy account with a Production-only SSH key. Restrict that key to the fixed deploy entry point below and disable all forwarding. `scripts/setup-deploy-sudo.sh` installs a root-owned fixed-argument helper for the narrow Caddy, backup, and secrets operations needed by `scripts/deploy.sh`; do not add wildcard sudo rules. Production must not store or forward `SUDO_PASSWORD`.
- Keep provider tokens on the Production host and scope them to the minimum service permissions the deployed application needs. Do not reuse Beta credentials.

Before enabling either workflow, provision distinct Beta and Production accounts with environment-specific helper grants. Re-running this command also removes the legacy cross-environment sudoers file for that account:

```bash
sudo bash scripts/setup-deploy-sudo.sh beta-deploy beta
sudo bash scripts/setup-deploy-sudo.sh production-deploy production
```

The helper keeps `/opt/food-tracker-{backups,secrets}/{beta,production}` owned and readable only by the matching account. Do not grant either account the other environment's helper operations. The Beta account must use rootless Docker and must not belong to the root-equivalent `docker` group; the setup script rejects that configuration. Only Production can install the shared Caddyfile, while Beta may validate its checkout and reload the already reviewed live config.

Create the separate Production checkout before enabling the forced-command key. On an existing host, stop Production PocketBase, then copy its data and current static builds into this checkout before Caddy is switched to the new roots. Preserve ownership and permissions, and verify the copies before removing the old directories:

```bash
sudo install -d -o production-deploy -g production-deploy -m 0750 /opt/food-tracker-app-production
sudo -u production-deploy git clone git@github.com:nicholaspung/food-tracker-app.git /opt/food-tracker-app-production
cd /opt/food-tracker-app && docker compose down pocketbase
sudo cp -a /opt/food-tracker-app/backend/pb_data_production /opt/food-tracker-app-production/backend/
sudo cp -a /opt/food-tracker-app/marketing_build /opt/food-tracker-app-production/
sudo cp -a /opt/food-tracker-app/app_build /opt/food-tracker-app-production/
sudo cp -a /opt/food-tracker-app/admin_build /opt/food-tracker-app-production/
sudo chown -R production-deploy:production-deploy /opt/food-tracker-app-production
```

Keep the Beta account unable to write `/opt/food-tracker-app-production` or `/usr/local/sbin/food-tracker-production-deploy`. Confirm the copied `marketing_build`, `app_build`, and `admin_build` each contain `index.html`; these preserve the last good sites if the first isolated build fails after Caddy cutover. The Production deploy makes non-build checkout paths deploy-owner-only, grants the `caddy` group traversal at the checkout root, and grants it read access only to validated published build directories. Run the first Production deploy immediately, then verify Caddy access before removing the old data or build directories:

```bash
for build_dir in marketing_build app_build admin_build; do
  sudo -u caddy test -r "/opt/food-tracker-app-production/$build_dir/index.html" || exit 1
done
```

Production Caddy cutovers keep `/etc/caddy/Caddyfile.food-tracker-rollback` until deployment health checks pass. The helper refuses to replace an existing snapshot, and the next Production deploy restores and clears a snapshot left by an interrupted cutover before making new changes. Complete the normal Production health checks after verifying file access.

Provision `/opt/food-tracker-secrets/production/deploy.env` as mode `0600`, owned by the deploy account, with the application and app-link values consumed by `scripts/deploy.sh`:

```bash
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUSH_ACCESS_TOKEN=
FOOD_TRACKER_IOS_TEAM_ID=
FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS=
```

Install the matching public key in the deploy account's `authorized_keys` with this prefix (keep the public-key fields on the same line):

```text
restrict,command="/usr/local/sbin/food-tracker-production-deploy" ssh-ed25519 AAAA... production-deploy
```

The workflow opens a session without supplying a remote command. The root-owned forced entry point rejects `SSH_ORIGINAL_COMMAND`, loads the host-only environment, fast-forwards the Production-only checkout, and runs the Production deploy. Although the account needs Docker authority, a holder of this key can only trigger that fixed operation. Use no unrestricted key or password for this account.

If an unreviewed or compromised action revision may have run:

1. Disable Production deployments and preserve the affected workflow run logs and the exact action SHA.
2. Revoke the deploy SSH key, remove it from `authorized_keys`, and rotate every Production secret that was exposed to the affected job. Rotate the deploy account password or sudo credential too if one existed historically.
3. Review GitHub audit/workflow logs and the VPS authentication logs, running processes, scheduled tasks, deploy logs, and filesystem changes for the exposure window.
4. Rebuild the host from a known-good image and restore verified data backups if host integrity cannot be established.
5. Re-enable deployments only after every action reference is a reviewed immutable SHA, the restricted SSH path is restored, credentials are replaced, and Production health checks pass.

The deploy workflow also generates Universal Link/App Link association files for customer-facing auth emails:

- `app_build/.well-known/apple-app-site-association`
- `app_build/.well-known/assetlinks.json`

These association files cover `/reset-password`, `/verify-email`, `/signup`, and `/lists/shared/*` app routes.

Add these values to the Beta GitHub environment and the Production host's `deploy.env` so those files can be generated during deploy:

```bash
FOOD_TRACKER_IOS_TEAM_ID=
FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS=
```

Keep `FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS` in the Production GitHub environment too; the post-deploy workflow uses it to decide whether to verify `assetlinks.json`. If either app-link value is missing from the deploy environment, deploy still succeeds, but the corresponding association file is skipped and HTTPS auth links may open in the browser instead of the installed app.

## Troubleshooting

### Site not updating

```bash
ls -la /opt/food-tracker-app-production/marketing_build
ls -la /opt/food-tracker-app-production/app_build
ls -la /opt/food-tracker-app-production/admin_build
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
