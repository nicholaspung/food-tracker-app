# API Keys Deployment Guide

This guide explains how to configure the new backend API keys (Gemini and Google Places) for automated deployments.

## Overview

As of the latest changes, the following API keys have been **moved to the backend**:
- ✅ **Google Gemini API** - For menu OCR/parsing
- ✅ **Google Places API** - For restaurant search and geocoding

These keys are **no longer stored in client-side app configuration** for security reasons.

---

## 🔑 Required API Keys

### 1. Google Gemini API Key
- **Purpose**: Menu image parsing using Google Gemini AI
- **Get it from**: https://makersuite.google.com/app/apikey
- **Environment Variable**: `GEMINI_API_KEY`

### 2. Google Places API Key
- **Purpose**: Restaurant search, nearby search, and geocoding
- **Get it from**: https://console.cloud.google.com/google/maps-apis/credentials
- **Required APIs to enable**:
  - Places API
  - Geocoding API
- **Environment Variable**: `GOOGLE_PLACES_API_KEY`

---

## 📋 Setup Instructions

### Option A: GitHub Actions Deployment (Recommended)

If you're using the automated GitHub Actions workflow for deployment:

#### Step 1: Add GitHub Secrets

Go to your GitHub repository settings:
```
Settings > Secrets and variables > Actions > New repository secret
```

Add these two secrets:

1. **GEMINI_API_KEY**
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API key from https://makersuite.google.com/app/apikey

2. **GOOGLE_PLACES_API_KEY**
   - Name: `GOOGLE_PLACES_API_KEY`
   - Value: Your Google Places API key from Google Cloud Console

#### Step 2: Deploy

The GitHub Actions workflow (`.github/workflows/deploy.yml`) will automatically:
- Pass the secrets to the server as environment variables
- The deployment script will create secure `.env` files in `/opt/food-tracker-secrets/`
- Beta and production environments have separate `.env` files

#### Step 3: Verify

After deployment, SSH into your server and verify:

```bash
# Check beta environment
cat /opt/food-tracker-secrets/beta/.env

# Check production environment
cat /opt/food-tracker-secrets/production/.env
```

You should see both API keys populated.

---

### Option B: Manual Deployment on Server

If you're deploying manually on the server:

#### Step 1: SSH to Server

```bash
ssh user@your-vps-ip
```

#### Step 2: Set Environment Variables

Before running the deployment script, export the API keys:

```bash
export GEMINI_API_KEY="your_gemini_api_key_here"
export GOOGLE_PLACES_API_KEY="your_google_places_api_key_here"
```

#### Step 3: Run Deployment

```bash
cd /opt/food-tracker-app
bash scripts/deploy.sh beta    # For beta
# OR
bash scripts/deploy.sh production  # For production
```

The script will:
- Read the API keys from environment variables
- Store them securely in `/opt/food-tracker-secrets/{environment}/.env`
- Create a symlink from `backend/.env` to the secure location

#### Step 4: Verify

```bash
# Check the environment file
cat /opt/food-tracker-secrets/beta/.env

# Verify symlink
ls -la /opt/food-tracker-app/backend/.env
```

---

## 📁 File Locations

### Secure Storage
API keys are stored in environment-specific directories:
```
/opt/food-tracker-secrets/
├── beta/
│   └── .env          # Beta environment API keys (chmod 600)
└── production/
    └── .env          # Production environment API keys (chmod 600)
```

### Symlinks
The backend code reads from:
```
/opt/food-tracker-app/backend/.env  -> /opt/food-tracker-secrets/{environment}/.env
```

This symlink is automatically created/updated by the deployment script.

---

## 🔒 Security Features

1. **Separate Storage**: API keys are stored outside the application directory in `/opt/food-tracker-secrets/`
2. **Secure Permissions**:
   - Directory: `chmod 700` (only owner can access)
   - Files: `chmod 600` (only owner can read/write)
3. **Environment Separation**: Beta and production have completely separate API keys
4. **Not in Git**: The secrets directory is outside the git repository
5. **GitHub Secrets**: When using GitHub Actions, keys never touch the repository

---

## 🔄 Updating API Keys

### Via GitHub Actions (Recommended)

1. Go to GitHub repository settings
2. Update the secret value for `GEMINI_API_KEY` or `GOOGLE_PLACES_API_KEY`
3. Trigger a new deployment (push to main or manual workflow dispatch)
4. The deployment will automatically update the keys on the server

### Manual Update on Server

```bash
# SSH to server
ssh user@your-vps-ip

# Edit the environment file directly
nano /opt/food-tracker-secrets/beta/.env
# OR
nano /opt/food-tracker-secrets/production/.env

# Restart PocketBase container to apply changes
cd /opt/food-tracker-app
docker compose -f docker-compose.beta.yml restart pocketbase_beta
# OR
docker compose -f docker-compose.yml restart pocketbase
```

---

## ✅ Verification

### Test Gemini API

SSH to server and test the endpoint:

```bash
# For beta (port 8091)
curl -X POST http://localhost:8091/api/parse-menu \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "image=@path/to/menu.jpg"

# For production (port 8090)
curl -X POST http://localhost:8090/api/parse-menu \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "image=@path/to/menu.jpg"
```

### Test Google Places API

```bash
# For beta
curl -X POST http://localhost:8091/api/places/nearby \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060, "radius": 1500}'

# For production
curl -X POST http://localhost:8090/api/places/nearby \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060, "radius": 1500}'
```

---

## 🐛 Troubleshooting

### Issue: "API key not configured" errors

**Check 1**: Verify environment file exists and has correct permissions
```bash
ls -la /opt/food-tracker-secrets/beta/.env
# Should show: -rw------- (600)

cat /opt/food-tracker-secrets/beta/.env
# Should show: GEMINI_API_KEY=... and GOOGLE_PLACES_API_KEY=...
```

**Check 2**: Verify symlink is correct
```bash
ls -la /opt/food-tracker-app/backend/.env
# Should point to: /opt/food-tracker-secrets/{environment}/.env
```

**Check 3**: Restart PocketBase container
```bash
cd /opt/food-tracker-app
docker compose -f docker-compose.beta.yml restart pocketbase_beta
```

### Issue: API keys not updating after deployment

**Solution**: The deployment script preserves existing API keys if environment variables aren't set. To force update:

```bash
# Option 1: Set environment variables before deployment
export GEMINI_API_KEY="new_key"
export GOOGLE_PLACES_API_KEY="new_key"
bash scripts/deploy.sh beta

# Option 2: Manually edit the file
nano /opt/food-tracker-secrets/beta/.env
docker compose -f docker-compose.beta.yml restart pocketbase_beta
```

### Issue: GitHub Actions deployment fails with "API key not set" warnings

This is just a **warning**, not an error. The deployment will complete successfully, but:
- If you see this warning, it means the GitHub secrets are not configured
- Features requiring those API keys will not work
- Add the secrets as described in "Option A: GitHub Actions Deployment" above

---

## 📊 Migration from Old Setup

If you're migrating from the old setup where `VITE_GOOGLE_PLACES_API_KEY` lived in client-side config:

1. **Remove the old client-side env variable**:
   - The deployment script now automatically removes `VITE_GOOGLE_PLACES_API_KEY`
   - Your old key can be reused as `GOOGLE_PLACES_API_KEY` in backend

2. **Add new backend keys**:
   - Follow either Option A (GitHub Actions) or Option B (Manual) above

3. **Deploy**:
   - The first deployment will create the new backend `.env` files
   - Client apps will use backend APIs for all Google Places operations

4. **Verify**:
   - Check that restaurant search still works
   - Check that menu OCR works (new feature)

---

## 📝 Summary

✅ **Before deployment**: Add GitHub secrets for `GEMINI_API_KEY` and `GOOGLE_PLACES_API_KEY`
✅ **During deployment**: Script automatically configures backend `.env` files
✅ **After deployment**: Verify API keys are working via test endpoints
✅ **Security**: Keys stored in secure directory with strict permissions
✅ **Separation**: Beta and production have separate keys
