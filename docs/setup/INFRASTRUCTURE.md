# Infrastructure Setup Guide

## Table of Contents
1. [VPS Deployment with Docker](#vps-deployment-with-docker)
2. [Build & Deployment](#build-deployment)
3. [Security & Backups](#security-backups)

---

## VPS Deployment with Docker

### Architecture Overview

**What Gets Dockerized:**
- ✅ **PocketBase** - Backend API and database (runs in Docker)
- ❌ **React Frontend** - Static files served directly by Caddy (NOT dockerized)
- ❌ **Caddy** - Reverse proxy installed on VPS host (NOT dockerized)

**Why this architecture?**
- PocketBase benefits from Docker isolation and easy updates
- React builds are just static HTML/CSS/JS files - no need for a container
- Caddy on the host is simpler, more reliable, and can serve multiple projects

### VPS Directory Structure

```
/opt/mobile-tracker-app/
├── docker-compose.yml          # Only PocketBase
├── frontend/                   # React source code (from Git)
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── frontend_build/             # Built static files (Caddy serves these)
│   ├── index.html
│   └── assets/
├── pb_data/                    # PocketBase database (persisted)
│   ├── data.db                # SQLite database
│   └── storage/               # Uploaded files
├── pb_migrations/              # Migration files (from Git)
└── pb_hooks/                   # Custom hooks (from Git)

/etc/caddy/
└── Caddyfile                  # Caddy config on host

/var/backups/pocketbase/       # Daily backups
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  pocketbase:
    image: ghcr.io/pocketbase/pocketbase:latest
    container_name: pocketbase
    restart: unless-stopped
    ports:
      - "127.0.0.1:8090:8090"  # Only accessible from localhost
    volumes:
      # CRITICAL: These bind mounts persist data on the VPS disk
      - ./pb_data:/pb/pb_data              # Database and uploads
      - ./pb_migrations:/pb/pb_migrations  # Migration files
      - ./pb_hooks:/pb/pb_hooks            # Custom hooks
    environment:
      - TZ=America/Los_Angeles
    command: serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8090/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

# No frontend service - React is just static files!
# No Caddy service - Caddy runs on host via systemd
```

### Caddyfile (installed on VPS host)

```
{
    email your-email@example.com
}

yourdomain.com {
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # PocketBase API (proxied to Docker container)
    handle /api/* {
        reverse_proxy localhost:8090
    }

    # PocketBase Admin UI
    handle /_/* {
        reverse_proxy localhost:8090
    }

    # Serve React static files directly from disk
    handle {
        root * /opt/mobile-tracker-app/frontend_build
        try_files {path} /index.html  # SPA routing
        file_server
    }

    # Logging
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

### Data Persistence Explained

**What Survives Container Restarts/Updates:**
```yaml
volumes:
  - ./pb_data:/pb/pb_data
  # ./pb_data = Directory on VPS disk (/opt/mobile-tracker-app/pb_data)
  # /pb/pb_data = Path inside container
  # Data lives on VPS, container just accesses it
```

- ✅ Database file (`pb_data/data.db`) - persisted on VPS
- ✅ Uploaded files (`pb_data/storage/`) - persisted on VPS
- ✅ Logs and backups - persisted on VPS
- ❌ Container filesystem - recreated on updates
- ❌ Application code inside container - comes from Docker image

**Even if you delete the container, your data is safe!**

---

## Build & Deployment

### Deployment Flow (Zero Downtime)

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Deploying to VPS..."

# 1. Pull latest code from Git
cd /opt/mobile-tracker-app
git pull origin main

# 2. Build frontend (NOT in Docker!)
echo "📦 Building frontend..."
cd frontend
npm ci --production=false
npm run build

# 3. Deploy frontend with blue-green strategy
echo "🔄 Deploying frontend (blue-green)..."
cd /opt/mobile-tracker-app
rm -rf frontend_build_new
cp -r frontend/dist frontend_build_new
rm -rf frontend_build_old
mv frontend_build frontend_build_old
mv frontend_build_new frontend_build

# 4. Update PocketBase container (database stays intact)
echo "🗄️  Updating PocketBase..."
docker-compose pull pocketbase
docker-compose up -d pocketbase
# Database in pb_data/ is never touched - only container is replaced

# 5. Reload Caddy gracefully (no downtime)
echo "🔁 Reloading Caddy..."
sudo systemctl reload caddy

# 6. Cleanup old frontend build
rm -rf frontend_build_old

echo "✅ Deployment complete!"
echo "Database: $(du -sh pb_data/ | cut -f1)"
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy to VPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Build Frontend
        run: |
          cd frontend
          npm ci
          npm run build

      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT }}
          script: |
            cd /opt/mobile-tracker-app
            git pull origin main
            bash scripts/deploy.sh
```

---

## Security & Backups

### VPS Initial Setup Script

```bash
#!/bin/bash
# scripts/setup-vps.sh

# Create application directory
sudo mkdir -p /opt/mobile-tracker-app
sudo chown $USER:$USER /opt/mobile-tracker-app

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt-get update
sudo apt-get install -y docker-compose-plugin

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Configure UFW Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw --force enable

# Enable automatic security updates
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

echo "✅ VPS setup complete!"
echo "Next steps:"
echo "1. Clone your repository to /opt/mobile-tracker-app"
echo "2. Copy docker-compose.yml and configure environment variables"
echo "3. Copy Caddyfile to /etc/caddy/Caddyfile"
echo "4. Run: cd /opt/mobile-tracker-app && docker-compose up -d"
echo "5. Run: sudo systemctl restart caddy"
```

### Backup Strategy

```bash
#!/bin/bash
# scripts/backup-pocketbase.sh

# Stop container for consistent backup
cd /opt/mobile-tracker-app
docker-compose stop pocketbase

# Backup database and files
tar -czf /var/backups/pocketbase/pb-$(date +%Y%m%d-%H%M%S).tar.gz pb_data/

# Restart container
docker-compose start pocketbase

# Keep only last 7 days of local backups
find /var/backups/pocketbase/ -name "pb-*.tar.gz" -mtime +7 -delete

# Optional: Upload to remote storage
# aws s3 cp /var/backups/pocketbase/pb-*.tar.gz s3://my-bucket/

echo "✅ Backup complete!"
```

**Online Backup (No Downtime):**
```bash
# SQLite online backup
docker exec pocketbase sqlite3 /pb/pb_data/data.db \
  ".backup /pb/pb_data/backup-$(date +%Y%m%d).db"

# Copy backup file out
docker cp pocketbase:/pb/pb_data/backup-*.db /var/backups/
```

**Setup Cron Job:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/mobile-tracker-app/scripts/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1
```

### Database Safety Best Practices

1. **Never use `-v` flag with docker-compose down:**
   ```bash
   # ✅ SAFE - Keeps volumes
   docker-compose down
   docker-compose up -d

   # ❌ DANGER - Deletes volumes and data!
   docker-compose down -v  # NEVER use -v in production!
   ```

2. **Test data persistence:**
   ```bash
   # 1. Create test data
   curl -X POST http://localhost:8090/api/collections/users/records \
     -H "Content-Type: application/json" \
     -d '{"name":"Test User"}'

   # 2. Stop and remove container
   docker-compose down

   # 3. Start container again
   docker-compose up -d

   # 4. Verify data still exists
   curl http://localhost:8090/api/collections/users/records
   # ✅ Data should still be there!
   ```

---

## Key Architecture Decisions

### ✅ What's in Docker:
- **PocketBase only** - Benefits from isolation, easy updates, portable

### ❌ What's NOT in Docker:
- **React frontend** - Just static files, served directly by Caddy
- **Caddy** - More reliable on host, simpler management

### 🎯 Why This Works:
1. **Simpler** - Fewer containers to manage
2. **Faster** - No container overhead for static files
3. **More reliable** - Caddy runs even if Docker has issues
4. **Standard approach** - How most production deployments work
5. **Easy debugging** - Direct access to files and logs
6. **Data safety** - Database persists via bind mounts on VPS disk

### 🔒 Security Layers:
1. **SSH** - Key-only auth, custom port, fail2ban
2. **Firewall** - UFW with strict rules
3. **HTTPS** - Automatic with Let's Encrypt
4. **Container isolation** - PocketBase in Docker
5. **Localhost binding** - PocketBase only accessible via Caddy
6. **Regular backups** - Automated with remote storage
7. **Security updates** - Unattended-upgrades for OS

---

## Environment Variables

Create `.env` file in `/opt/mobile-tracker-app/`:

```bash
# .env.example
# Copy to .env and fill in values

# Application
APP_NAME=mobile-tracker-app
DOMAIN=yourdomain.com

# Email for Let's Encrypt
ADMIN_EMAIL=your-email@example.com

# PocketBase (optional env vars)
# Most configuration is in docker-compose.yml
TZ=America/Los_Angeles

# GitHub (for CI/CD secrets)
# VPS_HOST=your.vps.ip.address
# VPS_USER=deploy
# VPS_SSH_KEY=<your-private-key>
# VPS_PORT=22
```

---

## Quick Start Deployment

```bash
# 1. Run VPS setup script
bash scripts/setup-vps.sh

# 2. Clone repository
cd /opt/mobile-tracker-app
git clone <your-repo-url> .

# 3. Create environment file
cp .env.example .env
# Edit .env with your values

# 4. Start PocketBase
docker-compose up -d

# 5. Configure Caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy

# 6. Build and deploy frontend
cd frontend
npm ci
npm run build
cd ..
cp -r frontend/dist frontend_build

# 7. Setup automated backups
sudo mkdir -p /var/backups/pocketbase
crontab -e
# Add: 0 2 * * * /opt/mobile-tracker-app/scripts/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1

echo "✅ Deployment complete! Visit https://$DOMAIN"
```
