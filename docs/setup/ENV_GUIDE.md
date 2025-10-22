# Environment Variables Guide

## Overview

This project uses minimal environment configuration. Most values are set automatically by the deployment scripts.

## Files and Their Purpose

### 1. `.env` (root directory)
**Created automatically by `post-setup.sh`**

This is mainly for documentation. The values are used in Caddyfile and scripts.

```bash
# Application
APP_NAME=food-tracker-app
DOMAIN=yourdomain.com          # Your actual domain

# Email for Let's Encrypt
ADMIN_EMAIL=your@email.com     # Your email for SSL cert notifications

# PocketBase Configuration
TZ=America/Los_Angeles         # Your timezone
```

**You don't need to manually create this** - the post-setup script will ask for your domain and email, then generate it.

### 2. `frontend/.env` (frontend directory)
**Created automatically by `post-setup.sh`**

```bash
# API Configuration - Production
VITE_API_URL=https://yourdomain.com/api
```

This tells the React app where the PocketBase API is located.

**For local development**, create `frontend/.env.local`:
```bash
# Local development only
VITE_API_URL=http://127.0.0.1:8090/api
```

### 3. GitHub Actions Secrets (Optional - for CI/CD)

If you want automatic deployments when you push code, add these as **repository secrets** in GitHub:

1. Go to: `Settings → Secrets and variables → Actions → New repository secret`

2. Add these secrets:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `VPS_HOST` | Your VPS IP address | `123.45.67.89` |
| `VPS_USER` | SSH username | `deploy` or `root` |
| `VPS_SSH_KEY` | Your private SSH key | Contents of `~/.ssh/id_rsa` |
| `VPS_PORT` | SSH port | `22` |

**How to get your SSH key:**
```bash
# On your local machine
cat ~/.ssh/id_rsa
# Copy the entire output (including BEGIN/END lines)
```

## What You Actually Need to Provide

### During Initial Setup

When you run `scripts/post-setup.sh`, it will ask for:

1. **Domain name**
   - Example: `myapp.com` or `tracker.example.com`
   - Must be pointed to your VPS IP (A record in DNS)

2. **Email address**
   - Example: `you@gmail.com`
   - Used for Let's Encrypt SSL certificate notifications

**That's it!** Everything else is configured automatically.

## Environment Priority

The app uses environment variables in this order:

1. **Production (VPS)**: Values from `frontend/.env` (created by post-setup script)
   - `VITE_API_URL=https://yourdomain.com/api`

2. **Local Development**: Values from `frontend/.env.local` (you create this)
   - `VITE_API_URL=http://127.0.0.1:8090/api`

3. **Default (in code)**: Fallback in `src/lib/pocketbase.ts`
   - `http://127.0.0.1:8090`

## Quick Reference

### I want to deploy to VPS
1. Run `scripts/setup-vps.sh` (installs Docker, Caddy, etc.)
2. Clone your repo to `/opt/food-tracker-app`
3. Run `scripts/post-setup.sh` (asks for domain & email, configures everything)

**No manual .env editing required!**

### I want to develop locally
1. Start backend: `cd backend && go run main.go serve`
2. Create `frontend/.env.local`:
   ```bash
   VITE_API_URL=http://127.0.0.1:8090/api
   ```
3. Start frontend: `cd frontend && npm run dev`

### I want to change my domain
1. Update DNS A record to point to VPS IP
2. Edit `/opt/food-tracker-app/Caddyfile` (change `yourdomain.com`)
3. Edit `/opt/food-tracker-app/frontend/.env` (change VITE_API_URL)
4. Redeploy:
   ```bash
   sudo systemctl restart caddy
   bash scripts/deploy.sh
   ```

## Troubleshooting

### "API calls are failing"
Check that `VITE_API_URL` is set correctly:
```bash
# On VPS
cat /opt/food-tracker-app/frontend/.env

# Locally
cat frontend/.env.local
```

### "Let's Encrypt SSL not working"
1. Check your domain DNS: `dig yourdomain.com`
2. Check email in Caddyfile: `sudo cat /etc/caddy/Caddyfile`
3. Check Caddy logs: `sudo journalctl -u caddy -n 50`

### "Frontend showing wrong API URL"
The API URL is baked into the build. After changing `.env`, rebuild:
```bash
cd /opt/food-tracker-app
bash scripts/deploy.sh
```

## Security Notes

- ✅ `.env` and `frontend/.env` are in `.gitignore` (don't commit them!)
- ✅ `.env.example` and `frontend/.env.example` are templates (safe to commit)
- ✅ Never commit API keys or secrets to git
- ✅ Use GitHub Secrets for CI/CD credentials
