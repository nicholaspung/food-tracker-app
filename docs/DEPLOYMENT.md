# VPS Deployment Guide

## Prerequisites

Before you start, you need:

1. **A VPS** - Ubuntu 22.04-25.04 (DigitalOcean, Linode, AWS, etc.)
2. **A domain name** - Pointed to your VPS IP address
3. **SSH access** - With sudo privileges
4. **Git repository** - Your code pushed to GitHub/GitLab

## Step-by-Step Deployment

### Step 1: Get a VPS and Domain

**VPS Providers (choose one):**
- [DigitalOcean](https://www.digitalocean.com/) - $6/month Droplet
- [Linode](https://www.linode.com/) - $5/month
- [Vultr](https://www.vultr.com/) - $6/month
- [Hetzner](https://www.hetzner.com/) - €4.5/month (cheapest)

**Minimum specs:**
- 1 CPU
- 1GB RAM
- 25GB SSD
- Ubuntu 22.04 LTS, 24.04 LTS, or 25.04

**Domain setup:**
1. Buy a domain (Namecheap, Google Domains, Cloudflare)
2. Add DNS A records pointing to your VPS IP:
   ```dns
   # Main production domain
   Type: A
   Name: @
   Value: <your-vps-ip>
   TTL: 300

   # Beta subdomain (for beta/prod pipeline)
   Type: A
   Name: beta
   Value: <your-vps-ip>
   TTL: 300

   # WWW redirect for production
   Type: A
   Name: www
   Value: <your-vps-ip>
   TTL: 300
   ```

3. Wait 5-10 minutes for DNS propagation

4. Verify DNS propagation:
   ```bash
   # Check main domain
   dig myexperiment.life

   # Check www redirect
   dig www.myexperiment.life

   # Check beta subdomain (if you added it)
   dig beta.myexperiment.life
   ```

   You should see your VPS IP address in the ANSWER section of each response.

**Note:** If you're only doing a simple production deployment without beta, you can skip the beta subdomain record. See the "Setting Up Beta/Production CI/CD Pipeline" section below for full beta/prod setup.

### Step 2: Initial VPS Setup

SSH into your VPS:
```bash
ssh root@your-vps-ip
```

Create a non-root user (recommended):
```bash
# Create user
adduser deploy

# Add to sudo group
usermod -aG sudo deploy

# Switch to new user
su - deploy
```

### Step 3: Run Setup Script

Copy the setup script to your VPS:
```bash
# Download the setup script
curl -o setup-vps.sh https://raw.githubusercontent.com/nicholaspung/mobile-tracker-app/main/scripts/setup-vps.sh

# Make it executable
chmod +x setup-vps.sh

# Run it
./setup-vps.sh
```

**Important:** Log out and log back in after the script completes for Docker permissions to take effect.

### Step 3.5: Run Post-Setup Script (Automated)

After cloning the repo, you can use the automated post-setup script:
```bash
cd /opt/mobile-tracker-app
bash scripts/post-setup.sh
```

This will use the defaults:
- Domain: `myexperiment.life`
- Email: `22228236+nicholaspung@users.noreply.github.com`

Just press `Y` when prompted to use defaults, and it will configure everything automatically!

### Step 4: Clone Repository

```bash
cd /opt/mobile-tracker-app
git clone https://github.com/nicholaspung/mobile-tracker-app.git .
```

### Step 5: Configure Environment

**Caddyfile is already configured:**
- Email: `22228236+nicholaspung@users.noreply.github.com`
- Domain: `myexperiment.life`

**Create environment files:**
```bash
# Root .env (optional for now)
cp .env.example .env

# Frontend .env (important!)
cd frontend
cp .env.example .env
nano .env
```

In `frontend/.env`, set:
```bash
VITE_API_URL=https://myexperiment.life/api
```

### Step 6: Deploy Caddy Configuration

```bash
cd /opt/mobile-tracker-app
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy
```

Check Caddy logs if there are issues:
```bash
sudo journalctl -u caddy -f
```

### Step 7: Start PocketBase

```bash
cd /opt/mobile-tracker-app
docker-compose up -d
```

Verify it's running:
```bash
docker-compose ps
docker-compose logs pocketbase
```

Test the health endpoint:
```bash
curl http://127.0.0.1:8090/api/health
```

### Step 8: Build and Deploy Frontend

```bash
cd /opt/mobile-tracker-app
bash scripts/deploy.sh
```

This will:
- Build the React app
- Deploy it to `/opt/mobile-tracker-app/frontend_build`
- Reload Caddy

### Step 9: Setup PocketBase Admin

Visit your domain's admin panel:
```
https://myexperiment.life/_/
```

Create your admin account (do this immediately for security!)

### Step 10: Setup Automated Backups

```bash
# Make backup script executable
chmod +x /opt/mobile-tracker-app/scripts/backup-pocketbase.sh

# Test the backup script
/opt/mobile-tracker-app/scripts/backup-pocketbase.sh

# Setup cron job for daily backups at 2 AM
crontab -e
```

Add this line:
```
0 2 * * * /opt/mobile-tracker-app/scripts/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1
```

### Step 11: Verify Deployment

Test your app:
```bash
# Check if site is live
curl https://myexperiment.life

# Check API
curl https://myexperiment.life/api/health

# Check PocketBase admin
curl https://myexperiment.life/_/
```

Visit in browser: `https://myexperiment.life`

## Future Deployments

After the initial setup, deployments are simple:

```bash
cd /opt/mobile-tracker-app
bash scripts/deploy.sh
```

This pulls the latest code, builds, and deploys with zero downtime.

## Setting Up Beta/Production CI/CD Pipeline

This project uses a **beta → production pipeline** where:
1. Code pushes to `master` automatically deploy to **beta**
2. After beta testing, you manually approve deployment to **production**

### Step 1: Setup DNS Records

Add DNS A records for your domain, beta subdomain, and www redirect:

**Required DNS Records:**
```
# Main production domain
Type: A
Name: @
Value: <your-vps-ip>
TTL: 300

# Beta subdomain
Type: A
Name: beta
Value: <your-vps-ip>
TTL: 300

# WWW redirect for production
Type: A
Name: www
Value: <your-vps-ip>
TTL: 300
```

Wait 5-10 minutes for DNS propagation. Verify with:
```bash
dig myexperiment.life
dig beta.myexperiment.life
dig www.myexperiment.life
```

**Note:** The Caddyfile is configured to redirect `www.myexperiment.life` to `myexperiment.life` with a 301 permanent redirect.

### Step 2: Setup VPS for Both Environments

SSH into your VPS and create beta data directories:
```bash
cd /opt/mobile-tracker-app/backend
mkdir -p pb_data_beta pb_data_production

# Move existing data to production folder
if [ -d "pb_data" ]; then
    mv pb_data pb_data_production
fi

# Create beta PocketBase admin (first time)
cd /opt/mobile-tracker-app
docker-compose -f docker-compose.beta.yml up -d
```

Then visit `https://beta.myexperiment.life/_/` to create the beta admin account.

### Step 3: Update Caddy Configuration

Deploy the updated Caddyfile (already configured for both environments):
```bash
cd /opt/mobile-tracker-app
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy
```

Verify both domains work:
```bash
curl -I https://myexperiment.life
curl -I https://beta.myexperiment.life
```

### Step 4: Configure GitHub Environments

1. Go to your GitHub repository → **Settings** → **Environments**
2. Create two environments:

**Beta Environment:**
- Name: `beta`
- No protection rules needed
- URL: `https://beta.myexperiment.life`

**Production Environment:**
- Name: `production`
- ✅ Enable "Required reviewers"
- Add yourself (or team members) as required reviewers
- URL: `https://myexperiment.life`

### Step 5: Add GitHub Secrets

Go to Settings → Secrets and variables → Actions

Add these secrets:
- `VPS_HOST` - Your VPS IP address
- `VPS_USER` - SSH username (e.g., `deploy`)
- `VPS_SSH_KEY` - Your private SSH key
- `VPS_PORT` - SSH port (usually `22`)

### How the Pipeline Works

When you push to `master`:

1. **Tests run** - TypeScript checks and E2E tests
2. **Auto-deploy to Beta** - If tests pass, deploys to `beta.myexperiment.life`
3. **Manual approval required** - Check beta, then approve in GitHub UI
4. **Deploy to Production** - After approval, deploys to `myexperiment.life`

### Approving Production Deployments

1. Push code to `master`
2. GitHub Actions will automatically deploy to beta
3. Test the beta site: `https://beta.myexperiment.life`
4. Go to **Actions** tab in GitHub
5. Find the workflow run
6. Click **Review deployments** button
7. Select **production** and click **Approve and deploy**

### Manual Deployments

You can also manually deploy from the VPS:

**Deploy to Beta:**
```bash
cd /opt/mobile-tracker-app
bash scripts/deploy.sh beta
```

**Deploy to Production:**
```bash
cd /opt/mobile-tracker-app
bash scripts/deploy.sh production
```

### Environment-Specific Details

| Feature | Beta | Production |
|---------|------|------------|
| Domain | `beta.myexperiment.life` | `myexperiment.life` |
| PocketBase Port | 8091 | 8090 |
| Data Directory | `backend/pb_data_beta` | `backend/pb_data_production` |
| Frontend Build | `frontend_build_beta` | `frontend_build` |
| Docker Compose | `docker-compose.beta.yml` | `docker-compose.yml` |
| Caddy Logs | `/var/log/caddy/beta-access.log` | `/var/log/caddy/access.log` |

### Monitoring Both Environments

**Check running containers:**
```bash
docker ps
# Should see both pocketbase and pocketbase_beta
```

**View logs:**
```bash
# Beta logs
docker-compose -f docker-compose.beta.yml logs -f pocketbase_beta

# Production logs
docker-compose logs -f pocketbase
```

**Health checks:**
```bash
# Beta
curl http://localhost:8091/api/health

# Production
curl http://localhost:8090/api/health
```

### Troubleshooting

**Beta not accessible:**
```bash
# Check DNS
dig beta.myexperiment.life

# Check Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile

# Check beta container
docker ps | grep beta
docker-compose -f docker-compose.beta.yml logs pocketbase_beta
```

**Production deployment blocked:**
- Ensure you've set up the "production" environment in GitHub Settings
- Add yourself as a required reviewer
- Check the Actions tab for the "Review deployments" button

## Troubleshooting

### Site not loading
```bash
# Check Caddy status
sudo systemctl status caddy
sudo journalctl -u caddy -n 50

# Check if port 80/443 are accessible
sudo ufw status
```

### PocketBase not working
```bash
# Check container status
docker-compose ps
docker-compose logs pocketbase

# Restart container
docker-compose restart pocketbase
```

### Frontend showing old version
```bash
# Check build directory
ls -la /opt/mobile-tracker-app/frontend_build/

# Rebuild and deploy
cd /opt/mobile-tracker-app
bash scripts/deploy.sh
```

### DNS not resolving
```bash
# Check DNS propagation
dig yourdomain.com

# Or use online tools:
# https://dnschecker.org/
```

## Monitoring

**View logs:**
```bash
# Caddy access logs
sudo tail -f /var/log/caddy/access.log

# PocketBase logs
docker-compose logs -f pocketbase

# System logs
journalctl -f
```

**Check disk space:**
```bash
df -h
du -sh /opt/mobile-tracker-app/pb_data/
```

**List backups:**
```bash
ls -lh /var/backups/pocketbase/
```

## Security Checklist

- [ ] Changed default SSH port (optional but recommended)
- [ ] Disabled root SSH login
- [ ] Enabled UFW firewall
- [ ] Created PocketBase admin account
- [ ] Setup automatic security updates
- [ ] Configured automated backups
- [ ] HTTPS working with valid certificate
- [ ] PocketBase only accessible via Caddy (not directly)

## Ubuntu 25.04 Compatibility

All deployment scripts are **fully compatible** with Ubuntu 25.04 x64. The setup has been tested and verified on:
- Ubuntu 22.04 LTS
- Ubuntu 24.04 LTS
- Ubuntu 25.04

**What was verified:**
- ✅ Docker and Docker Compose V2 installation
- ✅ Caddy web server with modern GPG key management
- ✅ Node.js 20 via NodeSource repository
- ✅ All systemd service commands
- ✅ UFW firewall configuration
- ✅ Fail2ban intrusion prevention
- ✅ Automatic security updates

**No changes needed** - All scripts work out of the box on Ubuntu 25.04!

## WWW Redirect Configuration

The Caddyfile is pre-configured to redirect www URLs to non-www with a 301 permanent redirect:

**Redirect:**
- `www.myexperiment.life` → `myexperiment.life`

**Testing the redirect:**
```bash
curl -I https://www.myexperiment.life
# Should show: Location: https://myexperiment.life/
```

The redirect preserves the full URI path, so:
- `www.myexperiment.life/profile` → `myexperiment.life/profile`
- `www.myexperiment.life/api/health` → `myexperiment.life/api/health`

## Costs

**Estimated monthly costs:**
- VPS: $5-6/month
- Domain: $10-15/year (~$1/month)
- **Total: ~$6-7/month**

**Free tier options:**
- [Oracle Cloud](https://www.oracle.com/cloud/free/) - Free forever VPS (limited)
- [Fly.io](https://fly.io/) - Free tier for small apps
- DNS: Cloudflare (free)

## Next Steps

Once deployed:
1. Test the signup/login flow on production
2. Setup monitoring (optional: UptimeRobot, Pingdom)
3. Configure email service in PocketBase (for password resets)
4. Setup SSL certificate monitoring (Caddy auto-renews, but good to monitor)
5. Consider adding a CDN (Cloudflare) for better performance
