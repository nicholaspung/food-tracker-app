# Mobile Screenshot Review

This setup now has a single default review flow.

It assumes:

- you run your normal local stack with `pnpm dev`
- the iOS simulator is already open in your current dev build
- the app starts on the first onboarding screen

The default review flow walks through onboarding, login, the Profile tab, legal/settings pages, feedback pages, and logout.

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

The active flow is `apps/mobile/e2e/maestro/flows/core-review.yaml`.

It captures:

- `01-onboarding`
- `02-create-account`
- `03-login`
- `04-forgot-password`
- `05-home`
- `06-profile`
- `07-profile-edit-account-name`
- `08-profile-account-details-collapsed`
- `09-profile-invite-codes`
- `10-profile-delete-account`
- `11-whats-new`
- `12-about`
- `13-terms-of-service`
- `14-privacy-policy`
- `15-settings`
- `16-feedback-list`
- `17-create-feedback`
- `18-feedback-detail`
- `19-onboarding-logged-out`

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

`apps/mobile/e2e/baselines/` is intentionally gitignored. Promoted baseline screenshots stay local unless you explicitly share them out of band.
