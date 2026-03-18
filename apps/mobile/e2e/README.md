# Mobile Screenshot Review

This setup supports named screenshot review flows and multi-flow runs.

It assumes:

- you run your normal local stack with `pnpm dev`
- the iOS simulator is already open in your current dev build
- the app starts on the first onboarding screen

Available named flows:

- `core-review`: onboarding, login, profile, legal/settings, feedback, logout
- `lists-review`: login, More, list screens, photo viewer, edit/delete list states, and friend lists

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

If you run `pnpm mobile:screenshots` in an interactive terminal, it will prompt you to choose:

- `all`
- `core-review`
- `lists-review`

You can also pass one or more flow names explicitly:

```bash
pnpm mobile:screenshots -- core-review
pnpm mobile:screenshots -- lists-review
pnpm mobile:screenshots -- core-review lists-review
pnpm mobile:screenshots -- all
```

## Flow

Flow aliases:

- `core-review` -> `apps/mobile/e2e/maestro/flows/core-review.yaml`
- `lists-review` -> `apps/mobile/e2e/maestro/flows/lists-review-part-1.yaml`

`core-review` captures:

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

`lists-review` captures:

- `20-login`
- `21-home`
- `22-more`
- `23-lists-list`
- `24-add-list`
- `25-primary-list-detail`
- `26-add-visit-ratings-to-list`
- `27-add-restaurant-to-list-detail`
- `28-secondary-list-detail`
- `29-full-photo`
- `30-edit-list`
- `31-delete-list-confirmation`
- `32-friend-lists`
- `33-friend-list-detail`

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
