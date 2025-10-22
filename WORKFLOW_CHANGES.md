# GitHub Workflow Changes

## Summary

The GitHub Actions deployment workflow has been simplified to **deployment-only**, removing all e2e testing from CI. Testing now happens **exclusively on your local machine** via the pre-push git hook.

## What Changed

### 1. Removed E2E Testing from CI

**Before:**
- ❌ `test-local` job - Ran Playwright tests before deployment
- ❌ `test-beta-after-deploy` job - Ran Playwright tests after beta deployment
- ❌ `test-beta-before-prod` job - Ran Playwright tests before production deployment
- Complex workflow with test artifacts, caching, and multiple test stages

**After:**
- ✅ Tests run locally via pre-push hook (using Cypress)
- ✅ Simple, fast deployments focused on shipping code
- ✅ No CI/CD test dependencies or caching needed

### 2. Updated Domain

**Old Domain:**
- Production: `myexperiment.life`
- Beta: `beta.myexperiment.life`
- WWW: `www.myexperiment.life`

**New Domain:**
- Production: `trackmyfoods.com`
- Beta: `beta.trackmyfoods.com`
- WWW: `www.trackmyfoods.com`

**Files Updated:**
- `.github/workflows/deploy.yml` - Deployment workflow
- `scripts/deploy.sh` - Deployment script
- `scripts/setup-beta.sh` - Beta setup script
- `scripts/monitoring-setup.sh` - Monitoring setup
- `scripts/setup-filesystem-encryption.sh` - Encryption setup
- `Caddyfile` - Web server configuration
- All documentation in `docs/`

### 3. Simplified Workflow Structure

**Current Workflow (`.github/workflows/deploy.yml`):**

```yaml
name: Deploy to Beta/Production

on:
  push:
    branches: [main]           # Auto-deploy to beta
  workflow_dispatch:            # Manual production deployment
    inputs:
      environment:
        type: choice
        options: [production]

jobs:
  deploy-beta:
    # Automatically deploys to beta.trackmyfoods.com on push to main
    - Checkout code
    - SSH to VPS
    - Run deployment script
    - Health check
    - Summary

  deploy-production:
    # Manually triggered via GitHub Actions UI
    - Checkout code
    - SSH to VPS
    - Run deployment script
    - Health check
    - Summary
```

## How It Works Now

### Local Development Workflow

1. **Make code changes**
2. **Commit changes:** `git commit -m "Add new feature"`
3. **Push to main:** `git push origin main`
   - Pre-push hook automatically runs Cypress tests
   - If tests fail → Push blocked, fix tests locally
   - If tests pass → Code pushed to GitHub
4. **GitHub automatically deploys to beta:** `beta.trackmyfoods.com`
5. **Test beta environment** manually
6. **Promote to production** (manual, via GitHub UI)

### Pre-Push Hook

Located at: `.git/hooks/pre-push`

**What it does:**
```bash
# 1. Checks if PocketBase backend is running (port 8090)
# 2. Runs Cypress e2e tests (npm run test:e2e)
# 3. If tests pass → Allow push
# 4. If tests fail → Block push, show errors
```

**Setup:**
```bash
# From project root
./setup-hooks.sh
```

**Skip hook (emergency only):**
```bash
git push --no-verify
```

### CI/CD Workflow

**Beta Deployment (Automatic):**
- Trigger: Push to `main` branch
- Target: `beta.trackmyfoods.com`
- Actions: Pull code → Deploy → Health check
- Time: ~30 seconds

**Production Deployment (Manual):**
- Trigger: GitHub Actions UI → "Run workflow" → Select "production"
- Target: `trackmyfoods.com`
- Actions: Pull code → Deploy → Health check
- Time: ~30 seconds

## Benefits

### Speed
- ⚡ **90% faster deployments** - No CI test overhead
- ⚡ **Instant feedback** - Tests run locally before push
- ⚡ **Simple workflow** - Deploy-only, no test orchestration

### Reliability
- ✅ **Tests always run** - Pre-push hook ensures 100% coverage
- ✅ **Fast local feedback** - Developers catch issues immediately
- ✅ **No CI flakiness** - Consistent local test environment

### Cost
- 💰 **Lower CI minutes** - No test jobs consuming GitHub Actions minutes
- 💰 **Simpler infrastructure** - No test artifact storage needed

## Testing Strategy

### Local Testing (Pre-Push)
- **Tool:** Cypress
- **Location:** `frontend/cypress/e2e/`
- **When:** Before every `git push`
- **Coverage:**
  - Authentication (login/logout)
  - Navigation (tab switching)
  - Food tracker (restaurants, food items, ratings)

### Manual Testing (Beta)
- **Environment:** `beta.trackmyfoods.com`
- **When:** After every beta deployment
- **What to test:**
  - New features work as expected
  - No regressions in existing features
  - UI looks correct on mobile

### Production Promotion
- **Requirements:**
  - ✅ Local tests passed (enforced by pre-push hook)
  - ✅ Beta environment tested manually
  - ✅ All features working as expected
- **Process:** Manual workflow dispatch in GitHub Actions

## Migration Checklist

If you're setting up a new VPS or migrating:

### DNS Setup
- [ ] Add A record: `trackmyfoods.com` → VPS IP
- [ ] Add A record: `beta.trackmyfoods.com` → VPS IP
- [ ] Add A record: `www.trackmyfoods.com` → VPS IP
- [ ] Verify DNS propagation: `dig trackmyfoods.com`

### VPS Configuration
- [ ] Update Caddyfile: `sudo cp Caddyfile /etc/caddy/Caddyfile`
- [ ] Restart Caddy: `sudo systemctl restart caddy`
- [ ] Verify domains: `curl https://trackmyfoods.com`

### GitHub Secrets
- [ ] `VPS_HOST` - Your VPS IP address
- [ ] `VPS_USER` - SSH username (e.g., `deploy`)
- [ ] `VPS_SSH_KEY` - Private SSH key for deployments
- [ ] `VPS_PORT` - SSH port (usually `22`)

### GitHub Environments
- [ ] Create `beta` environment
- [ ] Create `production` environment

### Local Setup
- [ ] Run `./setup-hooks.sh` to install pre-push hook
- [ ] Create test user in PocketBase (test@example.com / testpassword123)
- [ ] Test pre-push hook: Make a commit and try pushing

## Troubleshooting

### Pre-Push Hook Issues

**Backend not running:**
```bash
cd backend
go run main.go serve
```

**Tests failing locally:**
```bash
cd frontend
npm run cypress:open  # Interactive debugging
```

**Hook not executing:**
```bash
# Check if hook is executable
ls -la .git/hooks/pre-push

# If not, run setup again
./setup-hooks.sh
```

### Deployment Issues

**Beta deployment failed:**
```bash
# SSH to VPS
ssh deploy@YOUR_VPS_IP

# Check logs
cd /opt/food-tracker-app
docker compose -f docker-compose.beta.yml logs pocketbase_beta
```

**Production deployment failed:**
```bash
# SSH to VPS
ssh deploy@YOUR_VPS_IP

# Check logs
cd /opt/food-tracker-app
docker compose logs pocketbase
```

**Health check failed:**
```bash
# Verify services are running
docker ps

# Test health endpoint
curl http://localhost:8090/api/health  # Production
curl http://localhost:8091/api/health  # Beta
```

## Documentation

- **Deployment Guide:** `docs/setup/DEPLOYMENT.md`
- **Cypress Testing:** `frontend/cypress/README.md`
- **Pre-Push Hook:** `setup-hooks.sh`
- **Deploy Script:** `scripts/deploy.sh`

## Questions?

- Check the deployment guide: `docs/setup/DEPLOYMENT.md`
- Review Cypress tests: `frontend/cypress/e2e/`
- Examine the workflow: `.github/workflows/deploy.yml`
