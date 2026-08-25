# Disaster Recovery Plan

## Critical Paths

- production marketing: `/opt/food-tracker-app-production/marketing_build`
- production app: `/opt/food-tracker-app-production/app_build`
- production admin: `/opt/food-tracker-app-production/admin_build`
- beta marketing: `/opt/food-tracker-app/marketing_build_beta`
- beta app: `/opt/food-tracker-app/app_build_beta`
- beta admin: `/opt/food-tracker-app/admin_build_beta`
- production data: `/opt/food-tracker-app-production/backend/pb_data_production`
- beta data: `/opt/food-tracker-app/backend/pb_data_beta`
- backups: `/opt/food-tracker-backups`

## Scenario 1: Full VPS Loss

1. Provision the VPS and run `scripts/setup-vps.sh` from an administrator checkout.
2. Create distinct `beta-deploy` and `production-deploy` accounts. Configure rootless Docker for Beta; do not add that account to the `docker` group. Give only the Production account the Docker access required by its forced deploy.
3. Clone the repository into `/opt/food-tracker-app` as `beta-deploy` and `/opt/food-tracker-app-production` as `production-deploy`. Confirm neither account can write the other checkout.
4. Run `sudo bash scripts/setup-deploy-sudo.sh beta-deploy beta` and `sudo bash scripts/setup-deploy-sudo.sh production-deploy production` from a reviewed checkout.
5. Restore Beta and Production PocketBase backups and the last good static build directories into their matching checkout. Restore `/opt/food-tracker-secrets/production/deploy.env` as mode `0600` owned by `production-deploy`, plus the other environment-specific application secrets.
6. Install the restricted Production public key with `command="/usr/local/sbin/food-tracker-production-deploy",restrict`. Restore the reviewed host key in the `VPS_SSH_KNOWN_HOSTS` Production environment secret.
7. Run the root-owned Production launcher as `production-deploy`; it installs the reviewed Caddyfile from the isolated checkout. Run the Beta deploy separately as `beta-deploy`.
8. Complete the verification checklist below before restoring traffic or automated deployments.

## Scenario 2: PocketBase Data Corruption

```bash
cd /opt/food-tracker-app-production
docker compose down pocketbase
mv backend/pb_data_production backend/pb_data_production_corrupted_$(date +%Y%m%d_%H%M%S)
tar -xzf /opt/food-tracker-backups/production/latest/pb_data_backup.tar.gz -C backend
docker compose up -d pocketbase
curl http://localhost:8090/api/health
```

## Scenario 3: Bad Site Deploy

```bash
cd /opt/food-tracker-app-production
rm -rf marketing_build app_build admin_build
cp -r /opt/food-tracker-backups/production/latest/marketing_build marketing_build
cp -r /opt/food-tracker-backups/production/latest/app_build app_build
cp -r /opt/food-tracker-backups/production/latest/admin_build admin_build
sudo systemctl reload caddy
```

For beta, use the matching `marketing_build_beta`, `app_build_beta`, and `admin_build_beta` backups.

## Scenario 4: Caddy or TLS Issues

An interrupted Production deployment leaves `/etc/caddy/Caddyfile.food-tracker-rollback` in place. The next Production deploy restores that last-live config before beginning a new cutover. To recover manually, run `sudo /usr/local/sbin/food-tracker-deploy-privileged caddy-restore-live`, validate the live config, then run the helper with `caddy-reload` and `caddy-clear-backup`. Do not delete or overwrite the rollback snapshot before the restored config has reloaded successfully.

```bash
sudo journalctl -u caddy -n 100
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

## Scenario 5: Disk Pressure

```bash
df -h
du -sh /opt/food-tracker-app/* | sort -h
du -sh /opt/food-tracker-app-production/* | sort -h
du -sh /opt/food-tracker-backups/* | sort -h
docker system prune -af
sudo journalctl --vacuum-time=7d
```

If workspace dependencies were installed on the server manually, they can also be removed:

```bash
rm -rf /opt/food-tracker-app/node_modules
rm -rf /opt/food-tracker-app/apps/admin/node_modules
rm -rf /opt/food-tracker-app/apps/mobile/node_modules
rm -rf /opt/food-tracker-app-production/node_modules
rm -rf /opt/food-tracker-app-production/apps/admin/node_modules
rm -rf /opt/food-tracker-app-production/apps/mobile/node_modules
```

## Scenario 6: Beta Recovery

```bash
cd /opt/food-tracker-app
docker compose -f docker-compose.beta.yml down
tar -xzf /opt/food-tracker-backups/beta/latest/pb_data_backup.tar.gz -C backend
bash scripts/deploy.sh beta
curl http://localhost:8091/api/health
```

## Verification Checklist

- `curl https://app.yummyrecs.com/api/health`
- `curl https://beta.app.yummyrecs.com/api/health`
- `docker compose ps`
- `docker compose -f docker-compose.beta.yml ps`
- `sudo journalctl -u caddy -n 50`
