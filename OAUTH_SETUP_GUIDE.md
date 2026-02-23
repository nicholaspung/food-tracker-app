# OAuth Authentication Setup Guide

This guide provides step-by-step instructions for setting up Google and Facebook OAuth authentication in production for your Yummy Recs application.

## Table of Contents
1. [Overview](#overview)
2. [Google OAuth Setup](#google-oauth-setup)
3. [Facebook OAuth Setup](#facebook-oauth-setup)
4. [PocketBase Configuration](#pocketbase-configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Overview

Your application now supports OAuth authentication with Google and Facebook in addition to traditional email/password authentication. Users can sign up or log in using their existing Google or Facebook accounts.

**What's been implemented:**
- OAuth button components for Google and Facebook
- OAuth authentication hook (`useOAuth`)
- Updated Login and Sign Up pages with OAuth options
- Automatic user creation with default settings for new OAuth users

**What you need to do:**
- Create OAuth applications in Google Cloud Console and Facebook Developers
- Configure OAuth redirect URLs
- Add OAuth credentials to PocketBase admin panel

---

## Google OAuth Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter a project name (e.g., "Yummy Recs")
4. Click **Create**

### Step 2: Enable Google+ API (if required)

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Google+ API" or "People API"
3. Click on it and click **Enable**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type (unless you have a Google Workspace)
3. Click **Create**

**Fill in the required fields:**
- **App name**: Yummy Recs
- **User support email**: Your email address
- **Developer contact information**: Your email address
- **Authorized domains**: Add your production domain (e.g., `yourdomain.com`)
- **Application logo**: (Optional) Upload your app logo

4. Click **Save and Continue**
5. On the **Scopes** page, click **Save and Continue** (default scopes are sufficient)
6. On the **Test users** page, you can add test users or skip
7. Click **Save and Continue**
8. Review and click **Back to Dashboard**

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Select **Web application** as the application type
4. **Name**: Yummy Recs Web Client

**Authorized JavaScript origins:**
```
https://yourdomain.com
http://localhost:8090
```

**Authorized redirect URIs:**
```
https://yourdomain.com/api/oauth2-redirect
https://yourdomain.com/_/api/oauth2-redirect
http://localhost:8090/api/oauth2-redirect
http://localhost:8090/_/api/oauth2-redirect
```

5. Click **Create**
6. **Save the Client ID and Client Secret** - you'll need these for PocketBase

### Step 5: Notes for Production

- Replace `yourdomain.com` with your actual production domain
- Remove localhost URLs for production
- If using a PWA deployment, use your PWA's backend URL for redirect URIs
- Keep your Client Secret secure and never commit it to version control

---

## Facebook OAuth Setup

### Step 1: Create a Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Consumer** as the app type
4. Click **Next**

**Fill in the required fields:**
- **App name**: Yummy Recs
- **App contact email**: Your email address
- **Business account**: (Optional) Select if you have one

5. Click **Create App**
6. Complete the security check if prompted

### Step 2: Add Facebook Login Product

1. In your app dashboard, find **Facebook Login** in the products list
2. Click **Set Up** on the Facebook Login card
3. Select **Web** as your platform
4. Enter your site URL: `https://yourdomain.com`
5. Click **Save** and continue through the quickstart (you can skip most steps)

### Step 3: Configure Facebook Login Settings

1. In the left sidebar, go to **Facebook Login** → **Settings**

**Valid OAuth Redirect URIs** (add all of these):
```
https://yourdomain.com/api/oauth2-redirect
https://yourdomain.com/_/api/oauth2-redirect
http://localhost:8090/api/oauth2-redirect
http://localhost:8090/_/api/oauth2-redirect
```

2. Click **Save Changes**

### Step 4: Get App Credentials

1. Go to **Settings** → **Basic** in the left sidebar
2. You'll see:
   - **App ID** (this is your Client ID)
   - **App Secret** (click **Show** to reveal it - this is your Client Secret)
3. **Save both the App ID and App Secret** - you'll need these for PocketBase

### Step 5: Configure App Settings

**App Domains:**
```
yourdomain.com
localhost
```

**Privacy Policy URL**: Add your privacy policy URL (required for production)

**Terms of Service URL**: (Optional) Add your terms of service URL

### Step 6: Make App Live

1. At the top of the page, you'll see the app mode toggle
2. Click **App Mode** → **Live** (once you're ready for production)
3. Note: You must complete all required fields before you can switch to Live mode

### Step 7: Notes for Production

- Replace `yourdomain.com` with your actual production domain
- Remove localhost URLs for production
- Your Facebook app must be in **Live** mode for non-developers to use it
- You may need to submit your app for review if requesting advanced permissions (not required for basic login)

---

## PocketBase Configuration

### Step 1: Access PocketBase Admin Panel

1. Start your PocketBase server:
   ```bash
   cd backend
   go run main.go serve
   ```
2. Open your browser and go to `http://localhost:8090/_/`
3. Log in with your admin credentials

### Step 2: Configure Google OAuth

1. In the admin panel, go to **Settings** (gear icon in the left sidebar)
2. Click on **Auth providers**
3. Find **Google** in the list and click to expand

**Configuration:**
- **Enabled**: Toggle ON
- **Client ID**: Paste your Google Client ID
- **Client Secret**: Paste your Google Client Secret
- **Allow registration**: Toggle ON (if you want new users to sign up via Google)

4. Click **Save changes**

**Important Notes:**
- OAuth users are **automatically verified** by PocketBase
- Google and Facebook already verify email addresses, so users who sign up via OAuth are trusted
- This reduces spam and improves user experience (no verification email needed)

### Step 3: Configure Facebook OAuth

1. Still in **Settings** → **Auth providers**
2. Find **Facebook** in the list and click to expand

**Configuration:**
- **Enabled**: Toggle ON
- **App ID**: Paste your Facebook App ID
- **App Secret**: Paste your Facebook App Secret
- **Allow registration**: Toggle ON (if you want new users to sign up via Facebook)

4. Click **Save changes**

**Important Notes:**
- OAuth users are **automatically verified** by PocketBase
- Facebook already verifies email addresses, so users who sign up via OAuth are trusted
- This reduces spam and improves user experience (no verification email needed)

### Step 4: GitHub Actions Secrets Setup (Recommended for Production)

For production deployments using GitHub Actions, you should store OAuth credentials as repository secrets rather than in `.env` files.

#### Setting Up GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

**Add the following secrets:**

| Secret Name | Value |
|------------|-------|
| `GOOGLE_CLIENT_ID` | Your Google Client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google Client Secret |
| `FACEBOOK_APP_ID` | Your Facebook App ID |
| `FACEBOOK_APP_SECRET` | Your Facebook App Secret |

4. Click **Add secret** for each one

#### Using Secrets in GitHub Actions

In your GitHub Actions workflow file (e.g., `.github/workflows/deploy.yml`), reference these secrets:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy Backend
        env:
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
          FACEBOOK_APP_ID: ${{ secrets.FACEBOOK_APP_ID }}
          FACEBOOK_APP_SECRET: ${{ secrets.FACEBOOK_APP_SECRET }}
        run: |
          # Your deployment commands here
          # PocketBase will automatically use these environment variables
          # if they match the provider's expected variable names
```

**How PocketBase Reads Environment Variables:**

PocketBase can automatically populate OAuth credentials from environment variables if you name them correctly:

- For **Google**: `PB_GOOGLE_CLIENT_ID` and `PB_GOOGLE_CLIENT_SECRET`
- For **Facebook**: `PB_FACEBOOK_CLIENT_ID` and `PB_FACEBOOK_CLIENT_SECRET`

Alternatively, you can manually configure them in the PocketBase admin panel (recommended for simplicity).

#### Alternative: Local Development with .env

For **local development only**, you can create a `.env` file in your `backend` directory:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

**Important**:
- Add `.env` to your `.gitignore` file to prevent committing credentials
- **Never commit OAuth credentials to version control**
- Use GitHub Secrets for production deployments

---

## Testing

### Local Testing

1. Start your backend server:
   ```bash
   cd backend
   go run main.go serve
   ```

2. Start your frontend development server:
   ```bash
   cd frontend
   npm run dev
   ```

3. Navigate to the login or sign up page
4. Click on "Continue with Google" or "Continue with Facebook"
5. Complete the OAuth flow
6. Verify that you're logged in successfully

### Testing Checklist

- [ ] Google OAuth login works
- [ ] Google OAuth signup creates a new user
- [ ] Facebook OAuth login works
- [ ] Facebook OAuth signup creates a new user
- [ ] Existing users can log in with OAuth (if linked)
- [ ] Error handling works (e.g., when user denies permission)
- [ ] OAuth flow redirects back to your app correctly

---

## Troubleshooting

### Common Issues

#### "redirect_uri_mismatch" Error (Google)

**Problem**: The redirect URI in the OAuth request doesn't match what's configured in Google Cloud Console.

**Solution**:
1. Check the error message for the exact redirect URI being used
2. Add that exact URI to **Authorized redirect URIs** in Google Cloud Console
3. Make sure there are no trailing slashes or typos
4. Common URIs to add:
   - `http://localhost:8090/api/oauth2-redirect`
   - `http://localhost:8090/_/api/oauth2-redirect`

#### "URL Blocked: This redirect failed because the redirect URI is not whitelisted" (Facebook)

**Problem**: The redirect URI isn't configured in Facebook app settings.

**Solution**:
1. Go to Facebook Developers → Your App → Facebook Login → Settings
2. Add the redirect URI to **Valid OAuth Redirect URIs**
3. Click **Save Changes**
4. Wait a few minutes for changes to propagate

#### "Failed to authenticate with [provider]"

**Problem**: OAuth credentials are incorrect or not configured.

**Solution**:
1. Verify Client ID and Client Secret in PocketBase admin panel
2. Make sure the OAuth provider is **Enabled** in PocketBase
3. Check that **Allow registration** is enabled if you want new user signups
4. Check browser console for detailed error messages

#### OAuth Popup Blocked

**Problem**: Browser is blocking the OAuth popup window.

**Solution**:
1. PocketBase's `authWithOAuth2` should handle redirects automatically
2. If using a popup, ensure user interaction triggered the OAuth flow (not automatic)
3. Check browser settings for popup blockers

#### OAuth User Auto-Verification

**Expected Behavior**: OAuth users (Google/Facebook) are **automatically verified** upon signup.

**Why?**
- Google and Facebook already verify email addresses
- OAuth providers are trusted sources
- This reduces spam and improves user experience
- No verification email is sent to OAuth users

**If you need to change this:**
1. This is the recommended behavior and shouldn't be changed
2. OAuth users from trusted providers (Google/Facebook) are less likely to be spam
3. The app is configured to trust OAuth providers by default

### Production Issues

#### OAuth Works Locally But Not in Production

**Checklist**:
1. Did you add your production domain to authorized domains in Google/Facebook?
2. Did you add production redirect URIs?
3. Did you update PocketBase with production environment variables?
4. Is your Facebook app in **Live** mode?
5. Are you using HTTPS in production? (Required for OAuth)
6. Check CORS settings in PocketBase for your frontend domain

#### Environment Variables Not Loading

**Solution**:

**For GitHub Actions Deployments:**
1. Verify secrets are set in GitHub repository settings
2. Check that your workflow file correctly references secrets with `${{ secrets.SECRET_NAME }}`
3. Ensure secrets are passed as environment variables to your deployment step
4. Check GitHub Actions logs for any errors related to missing secrets
5. Make sure secret names match exactly (case-sensitive)

**For Local Development:**
1. Verify `.env` file is in the correct directory (`backend/`)
2. Check your PocketBase deployment method - some platforms require environment variables to be set differently
3. For Docker deployments, use `-e` flags or `docker-compose.yml` env sections
4. For systemd services, use `EnvironmentFile` directive

**For Other Platforms:**
- **Heroku**: Use `heroku config:set GOOGLE_CLIENT_ID=...`
- **Vercel**: Add environment variables in project settings
- **Netlify**: Add environment variables in site settings
- **Railway**: Add variables in the Variables tab
- **Fly.io**: Use `fly secrets set GOOGLE_CLIENT_ID=...`

---

## Additional Resources

### Google OAuth
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

### Facebook OAuth
- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login)
- [Facebook Developers](https://developers.facebook.com/)

### PocketBase
- [PocketBase OAuth2 Documentation](https://pocketbase.io/docs/authentication/#oauth2-integration)
- [PocketBase Auth Providers](https://pocketbase.io/docs/authentication/#auth-providers)

---

## Security Best Practices

1. **Never commit OAuth credentials** to version control
2. **Use environment variables** for production credentials
3. **Rotate secrets regularly** (especially if they may have been exposed)
4. **Use HTTPS in production** (required for OAuth)
5. **Validate redirect URIs** - only whitelist your actual domains
6. **Review OAuth scopes** - only request permissions you need
7. **Monitor for suspicious activity** in OAuth provider dashboards
8. **Keep dependencies updated** (PocketBase, React, etc.)

---

## Support

If you encounter issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review PocketBase logs: `backend/pb_data/logs/`
3. Check browser console for errors
4. Review OAuth provider documentation
5. Search PocketBase discussions on GitHub

---

**Need help?** Open an issue on your project repository with:
- Description of the problem
- Error messages (from browser console and PocketBase logs)
- Steps to reproduce
- What you've already tried
