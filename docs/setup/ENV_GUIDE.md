# Environment Variables Guide

## Root `.env`

`scripts/post-setup.sh` creates `/opt/food-tracker-app/.env` on the VPS with:

```bash
APP_NAME=food-tracker-app
DOMAIN=yourdomain.com
ADMIN_EMAIL=you@example.com
TZ=America/Los_Angeles
```

This file is deployment metadata for the server scripts and Caddy setup.

## Mobile App

Use `apps/mobile/.env.example` as the template for local mobile development.

Typical local values:

```bash
EXPO_PUBLIC_APP_ENV=local
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8090
EXPO_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
EXPO_PUBLIC_APP_WEB_URL=http://localhost:8081
EXPO_PUBLIC_ADMIN_URL=http://localhost:5173
EXPO_PUBLIC_MARKETING_URL=http://localhost:4173
EXPO_PUBLIC_IOS_APP_STORE_URL=https://apps.apple.com/us/app/yummy-recs/id6761597807
EXPO_PUBLIC_POSTHOG_API_KEY=
EXPO_PUBLIC_POSTHOG_HOST=
```

Notes:

- `pnpm dev`, `pnpm mobile:start`, `pnpm mobile:ios`, and `pnpm mobile:android` now run with `EXPO_NO_DOTENV=1`, so local dev uses the shared local environment from `scripts/app-env.sh` instead of `apps/mobile/.env`.
- Direct Expo commands run inside `apps/mobile` still read `apps/mobile/.env` by default. If that file contains beta or production values, localhost web will point at those environments unless you clear the file or run with `EXPO_NO_DOTENV=1`.

## Admin App

Use `apps/admin/.env.example` as the template for local admin development.

Typical local value:

```bash
VITE_APP_ENV=local
VITE_API_URL=http://127.0.0.1:8090
VITE_ADMIN_URL=http://localhost:5173
```

`VITE_API_URL` is the backend origin the admin app talks to. In local dev it should stay `http://127.0.0.1:8090`. In hosted beta and production builds it resolves to the admin site origin because Caddy proxies `/api/*` there.

## Backend App

Use `backend/.env.example` as the template when you need a local backend `.env`.

Typical local values:

```bash
FOOD_TRACKER_ENV=local
FOOD_TRACKER_MARKETING_URL=http://localhost:4173
FOOD_TRACKER_APP_URL=http://localhost:8081
FOOD_TRACKER_ADMIN_URL=http://localhost:5173
FOOD_TRACKER_API_BASE_URL=http://127.0.0.1:8090
FOOD_TRACKER_POCKETBASE_URL=http://127.0.0.1:8090
FOOD_TRACKER_POSTHOG_HOST=http://127.0.0.1:8090/api/analytics
FOOD_TRACKER_IOS_APP_STORE_URL=https://apps.apple.com/us/app/yummy-recs/id6761597807
FOOD_TRACKER_APP_SCHEME=yummyrecs
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUSH_ACCESS_TOKEN=
```

Notes:

- `GEMINI_API_KEY` and `GOOGLE_PLACES_API_KEY` are required for backend startup today.
- `POSTHOG_API_KEY` is optional.
- `EXPO_PUSH_ACCESS_TOKEN` is optional until Expo push security is enabled. When blank, backend Remote Device Notification sends omit the Expo `Authorization` header so local development and existing deployments keep working. Before enabling push security in the EAS dashboard, set this server-only secret in the matching backend environment.
- Waitlist approval emails build token-backed **Waitlist Approval Links** from `FOOD_TRACKER_APP_URL`; public marketing links use `FOOD_TRACKER_MARKETING_URL`. The approval link includes the approved email plus the `waitlist_approved` / `waitlistApprovalToken` technical route parameters so signup can require a valid one-time approval token instead of trusting approved email identity alone.
- Waitlist confirmation emails, mobile invite sharing, and the public marketing App Store badge use `FOOD_TRACKER_IOS_APP_STORE_URL` / `EXPO_PUBLIC_IOS_APP_STORE_URL` / `IOS_APP_STORE_URL`. The default is `https://apps.apple.com/us/app/yummy-recs/id6761597807` in local, beta, and production.
- The first-party PostHog proxy lives at `/api/analytics` and forwards only `Content-Type` and `Accept`; it does not forward client IP, referrer, or user-agent headers.
- PostHog Web Analytics Authorized URLs must be configured in the PostHog dashboard for deployed web origins. Add `https://app.yummyrecs.com`, `https://beta.app.yummyrecs.com`, and any local Expo web origin you want to inspect, such as `http://localhost:19000`.
- During VPS deploys, `scripts/deploy.sh` writes `backend/.env` as a symlink to `/opt/food-tracker-secrets/{beta|production}/.env`.

## Shared Environment Modes

The repo standardizes on three modes:

- `local`: marketing `http://localhost:4173`, app web `http://localhost:8081`, admin `http://localhost:5173`, backend `http://127.0.0.1:8090`
- `beta`: marketing `https://beta.yummyrecs.com`, app web/API `https://beta.app.yummyrecs.com`, admin `https://beta.admin.yummyrecs.com`
- `production`: marketing `https://yummyrecs.com`, app web/API `https://app.yummyrecs.com`, admin `https://admin.yummyrecs.com`

Runtime mode selectors:

- mobile: `EXPO_PUBLIC_APP_ENV`
- admin: `VITE_APP_ENV`
- backend/scripts: `FOOD_TRACKER_ENV`

Shared runtime URLs exported by the scripts:

- `FOOD_TRACKER_MARKETING_URL`
- `FOOD_TRACKER_APP_URL`
- `FOOD_TRACKER_ADMIN_URL`
- `FOOD_TRACKER_API_BASE_URL`
- `FOOD_TRACKER_POCKETBASE_URL`
- `FOOD_TRACKER_POSTHOG_HOST`
- `FOOD_TRACKER_IOS_APP_STORE_URL`
- `FOOD_TRACKER_APP_SCHEME`

## Public Marketing Site

`apps/marketing/dist` is static and does not use a runtime `.env` file.

The `Open App` marketing links use a deploy-time placeholder replacement:

- local marketing dev injects `http://localhost:8081/`
- beta deploy injects `https://beta.app.yummyrecs.com/`
- production deploy injects `https://app.yummyrecs.com/`

## App/Admin Web Deploy Builds

`scripts/deploy.sh` builds these on the VPS:

- `apps/mobile/web-dist` for `app.yummyrecs.com` or `beta.app.yummyrecs.com`
- `apps/admin/dist` for `admin.yummyrecs.com` or `beta.admin.yummyrecs.com`

The deploy script injects environment-specific API origins before building:

- mobile web resolves from `EXPO_PUBLIC_APP_ENV`
- admin web resolves from `VITE_APP_ENV`

## GitHub Environments

The repo currently uses two GitHub environments:

- `beta`: used by automatic beta deploys and the mobile preview workflow
- `production`: used by manual production deploys

### GitHub `beta` Environment Secrets

Required for [.github/workflows/deploy.yml](/Users/developer/programming/food-tracker-app/.github/workflows/deploy.yml) beta deploys:

```bash
VPS_HOST=
VPS_USER=
VPS_SSH_KEY=
VPS_PORT=
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUSH_ACCESS_TOKEN=
SUDO_PASSWORD=
FOOD_TRACKER_IOS_TEAM_ID=
FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS=
```

Required for [.github/workflows/mobile-preview.yml](/Users/developer/programming/food-tracker-app/.github/workflows/mobile-preview.yml):

```bash
EXPO_TOKEN=
```

### GitHub `production` Environment Secrets

Required for production deploys in [.github/workflows/deploy.yml](/Users/developer/programming/food-tracker-app/.github/workflows/deploy.yml):

```bash
VPS_HOST=
VPS_USER=
VPS_SSH_KEY=
VPS_PORT=
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUSH_ACCESS_TOKEN=
SUDO_PASSWORD=
FOOD_TRACKER_IOS_TEAM_ID=
FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS=
```

Notes:

- Beta and production can point at the same VPS connection values if both environments deploy to the same server.
- `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `POSTHOG_API_KEY`, `POSTHOG_HOST`, and `EXPO_PUSH_ACCESS_TOKEN` should usually be scoped separately per GitHub environment so beta and production can diverge safely.
- Attach `EXPO_TOKEN` to the `production` GitHub environment as well if you want to use the manual production-targeted mobile preview dispatch in `.github/workflows/mobile-preview.yml`.

### App Link Association Secrets

The deploy workflow uses these secrets to write `/.well-known` association files into the app web build. Those files let password reset, email verification, signup, and Shared Restaurant List HTTPS links open the installed app when the device supports Universal Links/App Links.

`FOOD_TRACKER_IOS_TEAM_ID` is the Apple Developer Team ID. Find it in Apple Developer:

- Apple Developer website: Account > Membership details > Team ID.
- App Store Connect: Users and Access > Integrations > Team ID.

Use the same Team ID for beta and production unless the preview app is signed under a different Apple Developer team.

`FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS` is one or more SHA-256 signing certificate fingerprints for the Android app. Use comma-separated values when more than one signing cert should be trusted:

```bash
FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:CC:...,DD:EE:FF:...
```

Find Android fingerprints from the signing credentials used for the build:

- EAS-managed credentials: `pnpm --dir apps/mobile exec eas credentials -p android`, select the app/profile, then inspect the Android keystore certificate fingerprints.
- Google Play App Signing: Play Console > the app > Setup > App integrity > App signing key certificate > SHA-256 certificate fingerprint. Also copy the Upload key certificate fingerprint if links should work for builds signed with the upload key outside Play distribution.
- Local keystore: run `keytool -list -v -keystore path/to/keystore.jks -alias your_alias` and copy the `SHA256` value.

Use the preview package fingerprint for the `beta` environment if the preview app uses `com.yummyrecs.mobile.preview`; use the production package fingerprint for the `production` environment if it uses `com.yummyrecs.mobile`.

## Expo Environments

Expo and EAS have two distinct concerns in this repo:

- EAS build profiles in [apps/mobile/eas.json](/Users/developer/programming/food-tracker-app/apps/mobile/eas.json)
- Expo environment variables used by OTA updates, especially `eas update --environment ...`

Build profiles such as `preview` and `production-preview` are for binary builds. OTA updates should target channels plus EAS environments, not build profiles. In this repo that means:

- beta OTA: `channel=preview` with `environment=preview`
- production-internal OTA: `channel=production-preview` with `environment=production`
- Expo-hosted OTA runs should use the explicit EAS Workflows update jobs in `apps/mobile/.eas/workflows/` rather than any build-oriented run path

### EAS Profile Mapping

- `development` profile -> local resources
- `preview` profile -> beta resources
- `production-preview` profile -> production resources via internal distribution
- `production` profile -> production resources
- `ios-simulator` profile -> local resources

The checked-in `eas.json` already sets:

- `preview` profile: `EXPO_PUBLIC_APP_ENV=beta`
- `production-preview` profile: `EXPO_PUBLIC_APP_ENV=production`
- `production` profile: `EXPO_PUBLIC_APP_ENV=production`

### Expo Environment `preview`

This should represent the beta mobile environment. It is especially important for OTA updates because [.github/workflows/mobile-preview.yml](/Users/developer/programming/food-tracker-app/.github/workflows/mobile-preview.yml) runs:

```bash
pnpm exec eas update --channel preview --environment preview
```

Recommended `preview` Expo environment variables:

```bash
EXPO_PUBLIC_APP_ENV=beta
EXPO_PUBLIC_API_BASE_URL=https://beta.app.yummyrecs.com
EXPO_PUBLIC_POCKETBASE_URL=https://beta.app.yummyrecs.com
EXPO_PUBLIC_APP_WEB_URL=https://beta.app.yummyrecs.com
EXPO_PUBLIC_ADMIN_URL=https://beta.admin.yummyrecs.com
EXPO_PUBLIC_MARKETING_URL=https://beta.yummyrecs.com
EXPO_PUBLIC_IOS_APP_STORE_URL=https://apps.apple.com/us/app/yummy-recs/id6761597807
EXPO_PUBLIC_POSTHOG_API_KEY=
EXPO_PUBLIC_POSTHOG_HOST=https://beta.app.yummyrecs.com/api/analytics
```

Only `EXPO_PUBLIC_APP_ENV=beta` is strictly required for host selection in the current codebase. The URL overrides are recommended to keep EAS Update, EAS Build, and local reasoning aligned and explicit.

Optional PostHog build-time variables for preview builds:

```bash
POSTHOG_CLI_PROJECT_ID=
POSTHOG_CLI_HOST=
POSTHOG_CLI_API_KEY=
```

### Expo Environment `production`

This should represent the production mobile environment. Use it for any future production OTA updates or production EAS builds run with `--environment production`.

Recommended `production` Expo environment variables:

```bash
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_API_BASE_URL=https://app.yummyrecs.com
EXPO_PUBLIC_POCKETBASE_URL=https://app.yummyrecs.com
EXPO_PUBLIC_APP_WEB_URL=https://app.yummyrecs.com
EXPO_PUBLIC_ADMIN_URL=https://admin.yummyrecs.com
EXPO_PUBLIC_MARKETING_URL=https://yummyrecs.com
EXPO_PUBLIC_IOS_APP_STORE_URL=https://apps.apple.com/us/app/yummy-recs/id6761597807
EXPO_PUBLIC_POSTHOG_API_KEY=
EXPO_PUBLIC_POSTHOG_HOST=https://app.yummyrecs.com/api/analytics
```

Optional PostHog build-time variables for production builds:

```bash
POSTHOG_CLI_PROJECT_ID=
POSTHOG_CLI_HOST=
POSTHOG_CLI_API_KEY=
```

### OTA Channel Mapping

Use these pairings consistently:

- preview OTA updates -> `--channel preview --environment preview` -> beta URLs/resources
- production-preview OTA updates -> `--channel production-preview --environment production` -> production URLs/resources for internal testing
- production OTA updates -> `--channel production --environment production` -> production URLs/resources

That keeps the OTA bundle environment aligned with the install base:

- preview builds install onto the `preview` channel and should talk to beta
- production-preview builds install onto the `production-preview` channel and can safely talk to production without sharing OTA updates with beta preview installs
- production builds install onto the `production` channel and should talk to production

### Optional PostHog CLI Variables

These are not used by the app runtime for backend selection, but they may be useful for PostHog build-time tooling because this repo includes the PostHog Expo plugin, Metro integration, and `@posthog/cli`.

Use them only if you want PostHog CLI features during EAS builds, such as uploading build artifacts for debugging/observability workflows.

What they represent:

- `POSTHOG_CLI_PROJECT_ID`: the PostHog project ID that the CLI should upload artifacts to
- `POSTHOG_CLI_HOST`: your PostHog host/API base, typically `https://us.i.posthog.com` or `https://eu.i.posthog.com`
- `POSTHOG_CLI_API_KEY`: a PostHog API key/token that allows the CLI to access that project and upload artifacts

Recommended practice:

- keep these optional
- use beta-scoped values in the Expo `preview` environment
- use production-scoped values in the Expo `production` environment
- do not confuse them with the runtime mobile variables `EXPO_PUBLIC_POSTHOG_API_KEY` and `EXPO_PUBLIC_POSTHOG_HOST`

The checked-in app code does not read `POSTHOG_CLI_*` directly. This section is based on the PostHog build tooling present in the repo rather than a runtime config dependency.

### Current Mobile Automation Status

Today, the checked-in GitHub automation covers:

- preview OTA update: `.github/workflows/mobile-preview.yml`
- production OTA update: `.github/workflows/mobile-production-ota.yml`
- commits never trigger preview builds from `.github/workflows/mobile-preview.yml`; native-affecting push changes fail clearly without starting EAS build usage
- manual preview dispatch defaults to OTA and only builds when the `force_preview_build=true` checkbox is selected in `.github/workflows/mobile-preview.yml`
- manual production-targeted internal OTA/build dispatch via `.github/workflows/mobile-preview.yml` with `deploy_target=production`, which still maps to the `production-preview` OTA channel and build profile rather than the App Store `production` channel/profile
- manual production OTA dispatch via `.github/workflows/mobile-production-ota.yml`, protected by the GitHub `production` environment approval, which publishes to the App Store/TestFlight `production` channel with the Expo `production` environment

For Expo-hosted OTA runs, use the checked-in EAS Workflows update jobs:

- `apps/mobile/.eas/workflows/publish-preview-update.yml`
- `apps/mobile/.eas/workflows/publish-production-preview-update.yml`

These are explicit `type: update` workflows and are intended to avoid routing OTA publishes through any iOS build/prebuild path.

For App Store/TestFlight production OTA updates, use the GitHub Actions `Mobile Production OTA` workflow. It runs the full mobile validation suite, then publishes with:

```bash
pnpm exec eas update --channel production --environment production
```

The local fallback command for authenticated Expo operators is:

```bash
pnpm mobile:update:production
```

For internal device testing against production today, use:

```bash
pnpm --dir apps/mobile exec eas build --profile production-preview --platform ios
```

and, after that build is installed:

```bash
pnpm mobile:update:production-preview
```

## Local Workflow

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` exports the shared `local` environment automatically for the mobile app, admin app, marketing links, and backend process.

Or run pieces separately:

```bash
pnpm dev:admin
pnpm dev:api
pnpm mobile:start
pnpm mobile:start:beta
pnpm mobile:start:production
pnpm mobile:web:beta
pnpm mobile:web:production
```

If you intentionally need to test a non-local mobile `.env` while running Expo directly, use commands inside `apps/mobile` instead of the root `pnpm mobile:*` scripts.

Environment-aware Expo helper commands:

- `pnpm mobile:start:local`
- `pnpm mobile:start:beta`
- `pnpm mobile:start:production`
- `pnpm mobile:web:local`
- `pnpm mobile:web:beta`
- `pnpm mobile:web:production`

These run [scripts/mobile-expo.sh](/Users/developer/programming/food-tracker-app/scripts/mobile-expo.sh), which:

- loads the shared environment mapping from `scripts/app-env.sh`
- sets `EXPO_NO_DOTENV=1`
- starts Expo with the requested environment

## Production Workflow

```bash
cd /opt/food-tracker-app
bash scripts/post-setup.sh
bash scripts/deploy.sh production
```

## Security Notes

- do not commit real `.env` files
- commit only `.env.example` templates
- keep deployment secrets in the VPS environment or GitHub Actions secrets
