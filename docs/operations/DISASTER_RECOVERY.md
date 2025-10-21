# Disaster Recovery Plan

## Emergency Contacts
- **Primary Admin**: 22228236+nicholaspung@users.noreply.github.com
- **VPS Provider**: [Your VPS Provider]
- **Domain Registrar**: [Your Domain Registrar]

---

## Recovery Scenarios

### Scenario 1: VPS Completely Lost (Worst Case)

**Recovery Time Objective (RTO):** 2-4 hours
**Recovery Point Objective (RPO):** Last backup (daily at 2 AM)

#### Steps:

1. **Provision new VPS**
   ```bash
   # On new VPS
   curl -o setup-vps.sh https://raw.githubusercontent.com/nicholaspung/mobile-tracker-app/master/scripts/setup-vps.sh
   chmod +x setup-vps.sh
   ./setup-vps.sh
   ```

2. **Update DNS A record** to point to new VPS IP

3. **Clone repository**
   ```bash
   cd /opt/mobile-tracker-app
   git clone https://github.com/nicholaspung/mobile-tracker-app.git .
   ```

4. **Restore from remote backup**
   ```bash
   # Download latest backup from S3/B2/Rsync
   aws s3 cp s3://your-bucket/mobile-tracker-app/pb-LATEST.tar.gz /tmp/

   # Or from Backblaze B2
   b2 download-file-by-name mobile-tracker-backups pocketbase/pb-LATEST.tar.gz /tmp/pb-LATEST.tar.gz

   # Extract to pb_data
   mkdir -p backend/pb_data
   tar -xzf /tmp/pb-LATEST.tar.gz -C backend/pb_data
   ```

5. **Run post-setup**
   ```bash
   bash scripts/post-setup.sh
   # Press Y for defaults
   ```

6. **Verify restoration**
   ```bash
   # Check users exist
   curl https://trackmyfoods.com/api/health
   # Login to admin panel
   open https://trackmyfoods.com/_/
   ```

**Total Time:** ~2-4 hours (depending on backup size and download speed)

---

### Scenario 2: Database Corruption

**RTO:** 15-30 minutes
**RPO:** Last backup

#### Steps:

1. **Stop PocketBase**
   ```bash
   cd /opt/mobile-tracker-app
   docker-compose down pocketbase
   ```

2. **Backup corrupted data** (for investigation)
   ```bash
   mv backend/pb_data backend/pb_data_corrupted_$(date +%Y%m%d)
   ```

3. **Restore from latest backup**
   ```bash
   # Find latest backup
   ls -lt /var/backups/pocketbase/pb-*.tar.gz | head -1

   # Extract
   mkdir -p backend/pb_data
   tar -xzf /var/backups/pocketbase/pb-LATEST.tar.gz -C backend/pb_data
   ```

4. **Restart PocketBase**
   ```bash
   docker-compose up -d pocketbase
   docker-compose logs -f pocketbase
   ```

5. **Verify**
   ```bash
   curl http://localhost:8090/api/health
   ```

---

### Scenario 3: Deployment Rollback

**RTO:** 2-5 minutes
**RPO:** Previous deployment

#### Automatic (on failure):
- Deploy script automatically rolls back on failure
- Old build kept for 5 minutes

#### Manual rollback:
```bash
cd /opt/mobile-tracker-app

# List available backups
ls -lt /opt/mobile-tracker-backups/

# Choose backup to restore
BACKUP_DIR=/opt/mobile-tracker-backups/20250106_143022

# Restore frontend
rm -rf frontend_build
cp -r $BACKUP_DIR/frontend_build .

# Restore PocketBase
docker-compose down pocketbase
rm -rf backend/pb_data
tar -xzf $BACKUP_DIR/pb_data_backup.tar.gz -C backend/
docker-compose up -d pocketbase

# Reload Caddy
sudo systemctl reload caddy
```

---

### Scenario 4: SSL Certificate Issues

**RTO:** 5-10 minutes

#### Steps:

1. **Check Caddy logs**
   ```bash
   sudo journalctl -u caddy -n 100
   ```

2. **Verify DNS**
   ```bash
   dig trackmyfoods.com
   # Should point to your VPS IP
   ```

3. **Restart Caddy**
   ```bash
   sudo systemctl restart caddy
   ```

4. **Force certificate renewal**
   ```bash
   sudo caddy reload --config /etc/caddy/Caddyfile
   ```

5. **Check Let's Encrypt rate limits**
   - https://crt.sh/?q=trackmyfoods.com
   - Limit: 5 certs per week

---

### Scenario 5: Out of Disk Space

**RTO:** 10-30 minutes

#### Steps:

1. **Check disk usage**
   ```bash
   df -h
   du -sh /opt/mobile-tracker-app/* | sort -h
   du -sh /var/backups/pocketbase/* | sort -h
   ```

2. **Clean old backups**
   ```bash
   # Remove backups older than 3 days
   find /var/backups/pocketbase -name "pb-*.tar.gz" -mtime +3 -delete
   find /opt/mobile-tracker-backups -type d -mtime +7 -exec rm -rf {} +
   ```

3. **Clean Docker**
   ```bash
   docker system prune -af
   ```

4. **Clean logs**
   ```bash
   sudo journalctl --vacuum-time=7d
   sudo truncate -s 0 /var/log/caddy/access.log
   ```

5. **Emergency: Clean node_modules**
   ```bash
   rm -rf /opt/mobile-tracker-app/frontend/node_modules
   ```

---

### Scenario 6: PocketBase Container Won't Start

**RTO:** 5-15 minutes

#### Steps:

1. **Check logs**
   ```bash
   docker-compose logs pocketbase
   ```

2. **Common issues:**

   **File permissions:**
   ```bash
   sudo chown -R 1000:1000 backend/pb_data
   ```

   **Port conflict:**
   ```bash
   sudo lsof -i :8090
   # Kill conflicting process
   ```

   **Corrupted migration:**
   ```bash
   # Temporarily disable migrations
   docker-compose run --rm pocketbase serve --http=0.0.0.0:8090
   ```

3. **Restart from clean state**
   ```bash
   docker-compose down
   docker-compose rm -f pocketbase
   docker-compose up -d pocketbase
   ```

---

## Recovery Testing Schedule

| Test | Frequency | Last Tested | Next Test |
|------|-----------|-------------|-----------|
| Backup restoration | Monthly | - | - |
| Full VPS rebuild | Quarterly | - | - |
| Rollback deployment | Monthly | - | - |
| SSL certificate renewal | Annually | - | - |

---

## Backup Verification Checklist

Run this monthly:

```bash
#!/bin/bash
# Test backup restoration

# 1. Download latest backup
LATEST_BACKUP=$(ls -t /var/backups/pocketbase/pb-*.tar.gz | head -1)

# 2. Extract to temp directory
TEST_DIR="/tmp/backup-test-$(date +%s)"
mkdir -p $TEST_DIR
tar -xzf $LATEST_BACKUP -C $TEST_DIR

# 3. Verify database integrity
docker run --rm -v $TEST_DIR/data.db:/test.db \
  ghcr.io/pocketbase/pocketbase:latest \
  sqlite3 /test.db "PRAGMA integrity_check;"

# 4. Verify user count matches production
PROD_USERS=$(docker exec pocketbase sqlite3 /pb/pb_data/data.db "SELECT COUNT(*) FROM _users;")
BACKUP_USERS=$(docker run --rm -v $TEST_DIR/data.db:/test.db \
  ghcr.io/pocketbase/pocketbase:latest \
  sqlite3 /test.db "SELECT COUNT(*) FROM _users;")

if [ "$PROD_USERS" -eq "$BACKUP_USERS" ]; then
  echo "✅ Backup verification passed"
else
  echo "❌ User count mismatch: Prod=$PROD_USERS, Backup=$BACKUP_USERS"
fi

# 5. Cleanup
rm -rf $TEST_DIR
```

---

## Escalation Path

1. **Check automated rollback** (automatic on deployment failure)
2. **Check logs** in `/var/log/`
3. **Try manual rollback** from `/opt/mobile-tracker-backups/`
4. **Restore from remote backup** (S3/B2)
5. **Rebuild VPS from scratch** (2-4 hours)
6. **Contact emergency support** (if configured)

---

## Key Files to Backup Manually

Before major changes, backup:
```bash
# Configuration
/etc/caddy/Caddyfile
/opt/mobile-tracker-app/docker-compose.yml
/opt/mobile-tracker-app/.env
/opt/mobile-tracker-app/frontend/.env

# Database
/opt/mobile-tracker-app/backend/pb_data/

# Scripts (already in git)
/opt/mobile-tracker-app/scripts/
```

---

## Emergency Commands Cheat Sheet

```bash
# Quick health check
curl https://trackmyfoods.com/api/health

# View all logs
docker-compose logs -f
sudo journalctl -u caddy -f

# Restart everything
docker-compose restart
sudo systemctl restart caddy

# Nuclear option (clean slate)
cd /opt/mobile-tracker-app
docker-compose down
rm -rf frontend_build
bash scripts/deploy.sh
```

---

## Prevention Checklist

- [ ] Daily backups running (check cron)
- [ ] Remote backups configured (S3/B2/rsync)
- [ ] Monitoring alerts working (healthchecks.io)
- [ ] Disk space > 20% free
- [ ] SSL certificate valid > 30 days
- [ ] Test restoration monthly
- [ ] Document any manual changes

---

## Contact Information

**In case of emergency:**
1. Email: 22228236+nicholaspung@users.noreply.github.com
2. GitHub Issues: https://github.com/nicholaspung/mobile-tracker-app/issues
3. Check monitoring alerts (healthchecks.io, Uptime Robot)

**Service Providers:**
- VPS: [Provider dashboard URL]
- Domain: [Registrar dashboard URL]
- Backup Storage: [S3/B2 dashboard URL]
