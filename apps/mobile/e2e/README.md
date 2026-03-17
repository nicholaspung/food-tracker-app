# Mobile Screenshot Review

This setup is now intentionally narrow.

It assumes:

- you run your normal local stack with `pnpm dev`
- the iOS simulator is already open in your current dev build
- the app starts on the first onboarding screen

The flow only does three things:

1. capture onboarding
2. tap `Sign In` and log in with your dev account
3. wait for Home and capture it

## Setup

1. Install Maestro: [docs.maestro.dev/getting-started/installing-maestro](https://docs.maestro.dev/getting-started/installing-maestro)
2. Make sure Java 17+ is installed: `java -version`
3. Create `apps/mobile/e2e/.env.local`:

```bash
SCREENSHOT_LOGIN_EMAIL="you@example.com"
SCREENSHOT_LOGIN_PASSWORD="your-password"
```

## Run

```bash
pnpm dev
pnpm mobile:screenshots
```

Each run is written to `apps/mobile/e2e/artifacts/<timestamp>/`.

## Flow

The active flow is `apps/mobile/e2e/maestro/flows/onboarding-login-home.yaml`.

It captures:

- `01-onboarding`
- `02-login`
- `03-home`

## Review Website

Run the local review site with:

```bash
pnpm mobile:screenshots:review
```

Then open `http://localhost:4174`.

What it does:

- reads artifact runs from `apps/mobile/e2e/artifacts/<run>/screenshots/`
- shows artifact images beside any existing baseline image
- lets you move an approved artifact image into `apps/mobile/e2e/baselines/<set>/`

The move is local filesystem state, not just UI state. Once promoted, the image is removed from the artifact run and becomes the baseline file for that filename.
