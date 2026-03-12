# Disaster Recovery Plan

## Critical Paths

- production marketing: `/opt/food-tracker-app/marketing_build`
- production app: `/opt/food-tracker-app/app_build`
- production admin: `/opt/food-tracker-app/admin_build`
- beta marketing: `/opt/food-tracker-app/marketing_build_beta`
- beta app: `/opt/food-tracker-app/app_build_beta`
- beta admin: `/opt/food-tracker-app/admin_build_beta`
- production data: `/opt/food-tracker-app/backend/pb_data_production`
- beta data: `/opt/food-tracker-app/backend/pb_data_beta`
- backups: `/opt/food-tracker-backups`

## Scenario 1: Full VPS Loss

1. Provision a new VPS.
2. Clone the repo into `/opt/food-tracker-app`.
3. Run `bash scripts/setup-vps.sh`.
4. Restore the latest PocketBase backup into the correct `backend/pb_data_*` directory.
5. Run `bash scripts/post-setup.sh`.
6. Run `bash scripts/deploy.sh production`.

## Scenario 2: PocketBase Data Corruption

```bash
cd /opt/food-tracker-app
docker compose down pocketbase
mv backend/pb_data_production backend/pb_data_production_corrupted_$(date +%Y%m%d_%H%M%S)
tar -xzf /opt/food-tracker-backups/production/latest/pb_data_backup.tar.gz -C backend
docker compose up -d pocketbase
curl http://localhost:8090/api/health
```

## Scenario 3: Bad Site Deploy

```bash
cd /opt/food-tracker-app
rm -rf marketing_build app_build admin_build
cp -r /opt/food-tracker-backups/production/latest/marketing_build marketing_build
cp -r /opt/food-tracker-backups/production/latest/app_build app_build
cp -r /opt/food-tracker-backups/production/latest/admin_build admin_build
sudo systemctl reload caddy
```

For beta, use the matching `marketing_build_beta`, `app_build_beta`, and `admin_build_beta` backups.

## Scenario 4: Caddy or TLS Issues

```bash
sudo journalctl -u caddy -n 100
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

## Scenario 5: Disk Pressure

```bash
df -h
du -sh /opt/food-tracker-app/* | sort -h
du -sh /opt/food-tracker-backups/* | sort -h
docker system prune -af
sudo journalctl --vacuum-time=7d
```

If workspace dependencies were installed on the server manually, they can also be removed:

```bash
rm -rf /opt/food-tracker-app/node_modules
rm -rf /opt/food-tracker-app/apps/admin/node_modules
rm -rf /opt/food-tracker-app/apps/mobile/node_modules
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
