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

# Setup SSH access for deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Switch to new user
su - deploy
```

### Step 3: Setup GitHub SSH Access

Generate an SSH key on your VPS to access your GitHub repository:

```bash
# Generate SSH key (press Enter to accept defaults)
ssh-keygen -t ed25519 -C "your-email@example.com"

# Start the SSH agent
eval "$(ssh-agent -s)"

# Add your SSH key
ssh-add ~/.ssh/id_ed25519

# Display your public key (copy this)
cat ~/.ssh/id_ed25519.pub
```

Add the SSH key to GitHub:
1. Copy the entire public key output
2. Go to GitHub → Settings → SSH and GPG keys → New SSH key
3. Give it a title (e.g., "VPS Deploy Server")
4. Key type: **Authentication Key**
5. Paste your public key and click "Add SSH key"

Verify the connection:
```bash
ssh -T git@github.com
# Should see: "Hi username! You've successfully authenticated..."
```

### Step 4: Clone Repository

Create the app directory and clone your repository:

```bash
# Create the app directory
sudo mkdir -p /opt/mobile-tracker-app

# Take ownership of the directory
sudo chown $USER:$USER /opt/mobile-tracker-app

# Clone the repository
cd /opt/mobile-tracker-app
git clone git@github.com:nicholaspung/mobile-tracker-app.git .

# Configure git to ignore file permission changes (important for deployment)
git config core.fileMode false
```

**Why `core.fileMode false`?** Scripts need to be executable (`chmod +x`), but we don't want git to track these permission changes on the VPS. This prevents conflicts when pulling updates.

### Step 5: Run Setup Script

Run the VPS setup script from the cloned repository:

```bash
cd /opt/mobile-tracker-app
bash scripts/setup-vps.sh
```

**Important:** Log out and log back in after the script completes for Docker permissions to take effect:

```bash
exit
ssh deploy@your-vps-ip
```

**Tip:** Create a convenience script for SSH access:
```bash
# On your local machine, copy and edit the SSH helper script
cp scripts/ssh-vps.sh.example scripts/ssh-vps.sh
nano scripts/ssh-vps.sh  # Update VPS_USER and VPS_HOST

# Make it executable
chmod +x scripts/ssh-vps.sh

# Now you can SSH with:
bash scripts/ssh-vps.sh
```

This script is gitignored and won't be committed to your repository.

### Step 6: Run Post-Setup Script (Automated)

After logging back in, run the automated post-setup script:

```bash
cd /opt/mobile-tracker-app
bash scripts/post-setup.sh
```

This will automatically:
- ✅ Configure Caddyfile with your domain and email
- ✅ Deploy Caddy configuration and restart the service
- ✅ Create environment files (frontend/.env and .env)
- ✅ Build PocketBase Docker image from your Go application
- ✅ Start PocketBase container with proper permissions
- ✅ Build the React frontend (npm install + build)
- ✅ Deploy frontend to `/opt/mobile-tracker-app/frontend_build`

**When prompted:**
- Press `Y` to use defaults (Domain: `myexperiment.life`, Email: `nicholaspungdev@gmail.com`)

**What to expect:**
- The script takes 5-10 minutes to complete
- PocketBase container may show a health check timeout (this is normal on first build)
- All Docker images and npm dependencies will be downloaded and cached

### Step 7: Setup PocketBase Admin

Get the installation URL from the PocketBase logs:
```bash
docker compose logs pocketbase | grep "pbinstal"
```

You'll see output like:
```
pocketbase  | http://0.0.0.0:8090/_/#/pbinstal/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Copy the token part** (everything after `/_/#/pbinstal/`) and visit:
```
https://myexperiment.life/_/#/pbinstal/YOUR_TOKEN_HERE
```

Replace `YOUR_TOKEN_HERE` with the actual token from your logs.

Create your admin account (do this immediately for security!)

**Note:** The installation token expires after a certain period. If it expires, restart PocketBase to generate a new one:
```bash
docker compose restart pocketbase
docker compose logs pocketbase | grep "pbinstal"
```

### Step 8: Setup Automated Backups

```bash
# Create log file with proper permissions
sudo touch /var/log/pocketbase-backup.log
sudo chown $USER:$USER /var/log/pocketbase-backup.log
sudo chmod 644 /var/log/pocketbase-backup.log

# Make backup script executable
chmod +x /opt/mobile-tracker-app/scripts/backup-pocketbase.sh

# Test the backup script
/opt/mobile-tracker-app/scripts/backup-pocketbase.sh

# Setup cron job for daily backups at 2 AM
crontab -e
```

Add this line to the crontab:
```
0 2 * * * /opt/mobile-tracker-app/scripts/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1
```

**Verify the backup setup:**
```bash
# Make the verification script executable
chmod +x /opt/mobile-tracker-app/scripts/verify-backup-setup.sh

# Run the verification script
bash /opt/mobile-tracker-app/scripts/verify-backup-setup.sh
```

This script checks:
- ✅ Backup script exists and is executable
- ✅ Cron service is running
- ✅ Crontab entry is configured
- ✅ Log file permissions are correct
- ✅ Backup directory exists with backup files
- ✅ PocketBase container is running
- ✅ Can run a test backup

### Step 9: Verify Deployment

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
1. Code pushes to `main` automatically deploy to **beta**
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

SSH into your VPS and run the automated beta setup script:

```bash
cd /opt/mobile-tracker-app

# Make the script executable
chmod +x scripts/setup-beta.sh

# Run the beta setup script
bash scripts/setup-beta.sh
```

This script will automatically:
- ✅ Create beta data directories
- ✅ Start the beta PocketBase container
- ✅ Deploy the beta frontend
- ✅ Provide the installation URL for creating the beta admin account

**Manual Setup (Alternative):**

If you prefer to set up manually:
```bash
cd /opt/mobile-tracker-app/backend
mkdir -p pb_data_beta pb_data_production

# Move existing data to production folder
if [ -d "pb_data" ]; then
    mv pb_data pb_data_production
fi

# Create beta PocketBase admin (first time)
cd /opt/mobile-tracker-app
docker compose -f docker-compose.beta.yml up -d

# Deploy beta frontend
bash scripts/deploy.sh beta
```

Then get the installation token and visit the URL to create the beta admin account:
```bash
docker compose -f docker-compose.beta.yml logs pocketbase_beta | grep "pbinstal"
# Visit: https://beta.myexperiment.life/_/#/pbinstal/YOUR_TOKEN
```

**Troubleshooting: Production asking for admin again?**

If production suddenly asks for a superuser after moving directories:

```bash
cd /opt/mobile-tracker-app

# Stop containers
docker compose down

# Check which directory has your data (look for larger size)
du -sh backend/pb_data* 2>/dev/null

# If pb_data has your admin but container uses pb_data_production:
# Move the correct data to production
mv backend/pb_data_production backend/pb_data_production.old
mv backend/pb_data backend/pb_data_production

# Restart
docker compose up -d

# Clean up old data after verifying production works
rm -rf backend/pb_data_production.old
```

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
