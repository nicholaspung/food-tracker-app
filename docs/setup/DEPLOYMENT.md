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
   dig trackyourfoods.com

   # Check www redirect
   dig www.trackyourfoods.com

   # Check beta subdomain (if you added it)
   dig beta.trackyourfoods.com
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
sudo mkdir -p /opt/food-tracker-app

# Take ownership of the directory
sudo chown $USER:$USER /opt/food-tracker-app

# Clone the repository
cd /opt/food-tracker-app
git clone git@github.com:nicholaspung/food-tracker-app.git .

# Configure git to ignore file permission changes (important for deployment)
git config core.fileMode false
```

**Why `core.fileMode false`?** Scripts need to be executable (`chmod +x`), but we don't want git to track these permission changes on the VPS. This prevents conflicts when pulling updates.

### Step 5: Run Setup Script

Run the VPS setup script from the cloned repository:

```bash
cd /opt/food-tracker-app
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
cd /opt/food-tracker-app
bash scripts/post-setup.sh
```

This will automatically:
- ✅ Configure Caddyfile with your domain and email
- ✅ Deploy Caddy configuration and restart the service
- ✅ Create environment files (frontend/.env and .env)
- ✅ Build PocketBase Docker image from your Go application
- ✅ Start PocketBase container with proper permissions
- ✅ Build the React frontend (npm install + build)
- ✅ Deploy frontend to `/opt/food-tracker-app/frontend_build`

**When prompted:**
- Press `Y` to use defaults (Domain: `trackyourfoods.com`, Email: `22228236+nicholaspung@users.noreply.github.com`)

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
https://trackyourfoods.com/_/#/pbinstal/YOUR_TOKEN_HERE
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
chmod +x /opt/food-tracker-app/scripts/backup-pocketbase.sh

# Test the backup script
/opt/food-tracker-app/scripts/backup-pocketbase.sh

# Setup cron job for daily backups at 2 AM
crontab -e
```

Add this line to the crontab:
```
0 2 * * * /opt/food-tracker-app/scripts/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1
```

**Verify the backup setup:**
```bash
# Make the verification script executable
chmod +x /opt/food-tracker-app/scripts/verify-backup-setup.sh

# Run the verification script
bash /opt/food-tracker-app/scripts/verify-backup-setup.sh
```

This script checks:
- ✅ Backup script exists and is executable
- ✅ Cron service is running
- ✅ Crontab entry is configured
- ✅ Log file permissions are correct
- ✅ Backup directory exists with backup files
- ✅ PocketBase container is running
- ✅ Can run a test backup

### Step 9: Production Security Hardening (Recommended)

This step configures PocketBase production security features to protect your application and data.

#### 9a. Settings Encryption (5 minutes)

Encrypts sensitive application settings like SMTP passwords, S3 credentials, and OAuth secrets.

**On your VPS:**
```bash
cd /opt/food-tracker-app

# Generate encryption keys
bash scripts/generate-encryption-keys.sh

# Restart containers to apply encryption
docker compose restart pocketbase
docker compose -f docker-compose.beta.yml restart pocketbase_beta
```

**What gets encrypted:**
- SMTP passwords (for email delivery)
- S3/storage credentials
- OAuth client secrets
- API keys stored in PocketBase

**Security notes:**
- Keys are stored in `.env` (never commit to git!)
- Backup `.env` file securely
- If keys are lost, you'll need to re-enter encrypted settings in admin UI

#### 9b. Enable MFA and Rate Limiting (3 minutes)

Enable built-in PocketBase security features via the admin UI.

**Enable Multi-Factor Authentication (MFA):**

1. Visit your PocketBase admin panel:
   - Production: `https://trackyourfoods.com/_/`
   - Beta: `https://beta.trackyourfoods.com/_/`

2. Navigate to **Settings** (gear icon) → **Admins**

3. Click on your admin account

4. Enable **"MFA (One-Time Password)"**

5. Scan the QR code with an authenticator app:
   - Google Authenticator
   - Authy
   - 1Password
   - Bitwarden

6. Enter the 6-digit code to confirm

7. **Save your recovery codes** in a secure location

**Enable Rate Limiting:**

1. In the admin panel, go to **Settings** → **Application**

2. Scroll to **"Security"** section

3. Enable **"API rate limiting"**

4. Recommended limits:
   - Auth endpoints: `5` requests per minute
   - API endpoints: `100` requests per minute
   - Admin endpoints: `20` requests per minute

5. Click **"Save changes"**

**What this protects against:**
- Brute force login attempts
- API abuse
- DDoS attacks
- Unauthorized admin access

#### 9c. Filesystem Encryption (Optional - Advanced)

**⚠️ Advanced users only!** This encrypts your database files at rest using LUKS.

**Domain:** This guide uses `trackyourfoods.com` as an example. Replace with your actual domain throughout the setup.

**When to use encryption:**
- You store sensitive PII (Personally Identifiable Information)
- Compliance requirements (HIPAA, GDPR, etc.)
- Extra protection against physical disk theft

**What it does:**
- Encrypts the entire PocketBase data directory
- Uses LUKS (Linux Unified Key Setup)
- Transparent to the application
- Auto-mounts on boot

**Prerequisites:**
- Root/sudo access to VPS
- Recent backups of your data
- ~30-60 minutes downtime
- Strong passphrase you'll remember

**Setup:**
```bash
cd /opt/food-tracker-app
sudo bash scripts/setup-filesystem-encryption.sh
```

The script will:
1. Guide you through encryption setup
2. Backup existing data
3. Create encrypted LUKS volume
4. Migrate data to encrypted storage
5. Configure auto-mount on boot
6. Update Docker volumes

**Important:**
- You will set an encryption passphrase
- If you lose the passphrase, **your data is lost forever**
- Keep secure backups of encryption keys
- Test thoroughly after setup

**Skip this step if:**
- You don't have compliance requirements
- Your VPS provider offers volume encryption
- You're okay with regular HTTPS + settings encryption

### Step 10: Verify Deployment

Test your app:
```bash
# Check if site is live
curl https://trackyourfoods.com

# Check API
curl https://trackyourfoods.com/api/health

# Check PocketBase admin
curl https://trackyourfoods.com/_/
```

Visit in browser: `https://trackyourfoods.com`

## Future Deployments

After the initial setup, deployments are simple:

```bash
cd /opt/food-tracker-app
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
dig trackyourfoods.com
dig beta.trackyourfoods.com
dig www.trackyourfoods.com
```

**Note:** The Caddyfile is configured to redirect `www.trackyourfoods.com` to `trackyourfoods.com` with a 301 permanent redirect.

### Step 2: Setup VPS for Both Environments

SSH into your VPS and run the automated beta setup script:

```bash
cd /opt/food-tracker-app

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
cd /opt/food-tracker-app/backend
mkdir -p pb_data_beta pb_data_production

# Move existing data to production folder
if [ -d "pb_data" ]; then
    mv pb_data pb_data_production
fi

# Create beta PocketBase admin (first time)
cd /opt/food-tracker-app
docker compose -f docker-compose.beta.yml up -d

# Deploy beta frontend
bash scripts/deploy.sh beta
```

Then get the installation token and visit the URL to create the beta admin account:
```bash
docker compose -f docker-compose.beta.yml logs pocketbase_beta | grep "pbinstal"
# Visit: https://beta.trackyourfoods.com/_/#/pbinstal/YOUR_TOKEN
```

**Troubleshooting: Production asking for admin again?**

If production suddenly asks for a superuser after moving directories:

```bash
cd /opt/food-tracker-app

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
cd /opt/food-tracker-app
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy
```

Verify both domains work:
```bash
curl -I https://trackyourfoods.com
curl -I https://beta.trackyourfoods.com
```

### Step 4: Configure GitHub Environments

#### Create Beta Environment

1. Go to your GitHub repository → **Settings** → **Environments**
2. Click **"New environment"**
3. Name: `beta`
4. Click **"Configure environment"** (optional - you can just save immediately)
5. No other configuration needed - click **"Save"** or just navigate away

#### Create Production Environment

1. Back on the Environments page, click **"New environment"** again
2. Name: `production`
3. Click **"Configure environment"** (optional - you can just save immediately)
4. No other configuration needed - click **"Save"** or just navigate away

**Note:** The environment URLs (`https://beta.trackyourfoods.com` and `https://trackyourfoods.com`) are configured in the workflow file (`.github/workflows/deploy.yml`), not in the GitHub UI. They will automatically appear in the GitHub Actions UI after the first deployment.

**Note about protection rules:**
- **GitHub Free plan (private repos)**: "Required reviewers" is not available. Production deployments use manual workflow triggers instead (see workflow instructions below).
- **GitHub Team/Enterprise** or **Public repos**: You can optionally enable "Required reviewers" under "Deployment protection rules" for additional approval gates.

### Step 5: Add GitHub Secrets

#### Creating a Dedicated SSH Key for GitHub Actions (Recommended)

For security, create a separate SSH key specifically for GitHub Actions deployments:

**On your local machine:**
```bash
# Generate a new key specifically for GitHub Actions
ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy_food -C "github-actions-deploy-food"

# When prompted:
# - Enter file: (already specified, press Enter)
# - Passphrase: (leave empty, press Enter twice)

# Display the public key (copy this)
cat ~/.ssh/github_actions_deploy_food.pub
```

**On your VPS (as the deploy user):**
```bash
# Add the new public key to authorized_keys
echo "PASTE_THE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys

# Verify the key was added
tail -1 ~/.ssh/authorized_keys
```

**Test the new key from your local machine:**
```bash
# Test SSH connection with the new key
ssh -i ~/.ssh/github_actions_deploy_food deploy@YOUR_VPS_IP

# If it works, exit and continue
exit
```

**Get the private key for GitHub Secrets:**
```bash
# On your local machine, display the private key
cat ~/.ssh/github_actions_deploy_food

# Copy the ENTIRE output including:
# -----BEGIN OPENSSH PRIVATE KEY-----
# ... (all lines) ...
# -----END OPENSSH PRIVATE KEY-----
```

#### Alternative: Use Your Existing SSH Key

If you already SSH to your VPS, you can reuse that key:
```bash
# On your local machine
cat ~/.ssh/id_ed25519
```

**Note:** Using a dedicated key (Option 1) is more secure because you can revoke it independently without affecting your personal SSH access.

#### Configure Passwordless Sudo for Deploy User

The deployment script needs to reload Caddy and manage backup directories. Configure passwordless sudo for these operations:

**On your VPS (as root or a user with sudo access):**

1. Transfer the setup script to your VPS:
```bash
# From your local machine
scp scripts/setup-deploy-sudo.sh deploy@YOUR_VPS_IP:/tmp/
```

2. SSH into your VPS and run the setup script:
```bash
# SSH to VPS
ssh deploy@YOUR_VPS_IP

# Run the script with sudo (use your deploy username)
sudo bash /tmp/setup-deploy-sudo.sh deploy

# Clean up
rm /tmp/setup-deploy-sudo.sh
```

The script will configure passwordless sudo for:
- Caddy web server management (reload, restart, status, validate)
- Backup directory operations
- Docker Compose commands

3. Verify the setup:
```bash
# Test passwordless sudo
sudo systemctl status caddy

# Should work without asking for password
```

**Manual Setup (Alternative):**

If you prefer to configure manually instead of using the script:

```bash
# Create sudoers file
sudo visudo -f /etc/sudoers.d/deploy-deployment

# Add these lines (replace 'deploy' with your username):
deploy ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart caddy
deploy ALL=(ALL) NOPASSWD: /bin/systemctl status caddy
deploy ALL=(ALL) NOPASSWD: /usr/bin/caddy validate *
deploy ALL=(ALL) NOPASSWD: /bin/mkdir -p /opt/food-tracker-backups*
deploy ALL=(ALL) NOPASSWD: /bin/chown * /opt/food-tracker-backups*
deploy ALL=(ALL) NOPASSWD: /bin/chmod * /opt/food-tracker-backups*
deploy ALL=(ALL) NOPASSWD: /usr/bin/docker-compose *
deploy ALL=(ALL) NOPASSWD: /usr/bin/docker compose *

# Save and exit (Ctrl+X, Y, Enter)

# Set proper permissions
sudo chmod 0440 /etc/sudoers.d/deploy-deployment
```

#### Add Secrets to GitHub

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Click **"New repository secret"** and add each of these:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `VPS_HOST` | Your VPS IP address | `123.45.67.89` |
| `VPS_USER` | SSH username | `deploy` |
| `VPS_SSH_KEY` | Your **private** SSH key (entire contents) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_PORT` | SSH port | `22` (or custom port) |

For `VPS_SSH_KEY`, paste the entire private key including the header and footer lines.

### How the Pipeline Works

**Automatic Beta Deployment (on push to `main`):**

1. **Tests run locally** - E2E tests run via pre-push git hook before code is pushed
2. **Auto-deploy to Beta** - On push to main, automatically deploys to `beta.trackyourfoods.com`
3. **Health check** - Verifies the beta deployment is accessible

**Manual Production Deployment (workflow_dispatch):**

Production deployments require manual triggering through the GitHub UI for safety. E2E tests are run locally via the pre-push hook, so CI only handles deployment.

### Deploying to Production

After testing your changes on beta, deploy to production:

1. Make your code changes locally
2. Tests run automatically via pre-push hook when you `git push`
3. If tests pass, code is pushed to `main` and automatically deploys to beta
4. Test the beta site: `https://beta.trackyourfoods.com`
5. Once satisfied, go to **Actions** tab in GitHub
6. Click on **"Deploy to Beta/Production"** workflow
7. Click the **"Run workflow"** dropdown button (top right)
8. Select `main` branch
9. Choose **"production"** from the environment dropdown
10. Click **"Run workflow"**

The workflow will:
- Deploy to production at `https://trackyourfoods.com`
- Run health checks
- Show deployment summary

**Note:** There is no manual beta deployment option in the workflow since beta deploys automatically on every push to main.

### Manual Deployments

You can also manually deploy from the VPS:

**Deploy to Beta:**
```bash
cd /opt/food-tracker-app
bash scripts/deploy.sh beta
```

**Deploy to Production:**
```bash
cd /opt/food-tracker-app
bash scripts/deploy.sh production
```

### Environment-Specific Details

| Feature | Beta | Production |
|---------|------|------------|
| Domain | `beta.trackyourfoods.com` | `trackyourfoods.com` |
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
docker compose -f docker-compose.beta.yml logs -f pocketbase_beta

# Production logs
docker compose logs -f pocketbase
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
dig beta.trackyourfoods.com

# Check Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile

# Check beta container
docker ps | grep beta
docker compose -f docker-compose.beta.yml logs pocketbase_beta
```

**Production deployment not triggered:**
- Ensure you've set up the "production" environment in GitHub Settings → Environments
- Production deploys are manual only - use the "Run workflow" button in the Actions tab
- Select "production" from the environment dropdown when manually triggering

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
docker compose ps
docker compose logs pocketbase

# Restart container
docker compose restart pocketbase
```

### Frontend showing old version
```bash
# Check build directory
ls -la /opt/food-tracker-app/frontend_build/

# Rebuild and deploy
cd /opt/food-tracker-app
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
docker compose logs -f pocketbase

# System logs
journalctl -f
```

**Check disk space:**
```bash
df -h
du -sh /opt/food-tracker-app/pb_data/
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
- [ ] Enabled PocketBase settings encryption
- [ ] Enabled MFA for admin accounts
- [ ] Enabled rate limiting in PocketBase
- [ ] (Optional) Configured filesystem encryption for PII

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
- `www.trackyourfoods.com` → `trackyourfoods.com`

**Testing the redirect:**
```bash
curl -I https://www.trackyourfoods.com
# Should show: Location: https://trackyourfoods.com/
```

The redirect preserves the full URI path, so:
- `www.trackyourfoods.com/profile` → `trackyourfoods.com/profile`
- `www.trackyourfoods.com/api/health` → `trackyourfoods.com/api/health`

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
