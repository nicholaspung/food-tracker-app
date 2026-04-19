# Mobile Screenshot Review

This setup supports named screenshot review flows, multi-flow runs, and environment-aware run metadata.

It assumes:

- the iOS simulator is already open in your current dev build
- the app starts on the first onboarding screen
- you start the mobile app in the same target environment you want the screenshot run to represent

Available named flows:

- `sign-in-review`: onboarding, create-account, login, forgot-password, and authenticated home handoff
- `profile-review`: profile, legal/settings, and feedback screens after sign-in
- `lists-review`: More tab, list screens, photo viewer, edit/delete list states, and friend lists
- `bills-review`: More tab bills/tips screens, bill filters, create bill, bill detail, and edit bill
- `friends-review`: More-to-Friends tab handoff, friend sub-tabs, my code, add friend, and QR scanner
- `add-visit-review`: Add tab restaurant-visit flow, menu-scan/manual-item entry, ratings, save/edit/delete-confirm states, and home feed toggles
- `add-quick-track-review`: Add tab quick-track flow, rating guide states, and quick rating selections
- `notes-review`: Add tab notes entry, notes list filters, edit, and delete-confirm states
- `sign-out-review`: profile logout handoff back to onboarding

## Setup

1. Install Maestro: [docs.maestro.dev/getting-started/installing-maestro](https://docs.maestro.dev/getting-started/installing-maestro)
2. Make sure Java 17+ is installed: `java -version`
3. Create `apps/mobile/e2e/.env.local`:

```bash
SCREENSHOT_LOGIN_EMAIL="you@example.com"
SCREENSHOT_LOGIN_PASSWORD="your-password"
```

## Run

For local development:

```bash
pnpm dev
pnpm mobile:screenshots --env local
```

Each run is written to `apps/mobile/e2e/artifacts/<timestamp>/`.

For beta or production-targeted review, start the app in that environment first, then run screenshots with the matching `--env` label:

```bash
pnpm mobile:start:beta
pnpm mobile:screenshots --env beta -- all

pnpm mobile:start:production
pnpm mobile:screenshots --env production -- all
```

The screenshot suite stores the selected environment in `run.json` alongside endpoint metadata such as API and PocketBase base URLs. This is intended to classify the target backend environment for the run.

Environment metadata priority:

1. `--env <local|beta|production>`
2. `SCREENSHOT_APP_ENV`
3. `EXPO_PUBLIC_APP_ENV`
4. `FOOD_TRACKER_ENV`

If none of those are set, the run is left unclassified.

Important: environment-classified runs tell you what the app shows when pointed at the selected backend environment. They do not automatically prove parity with every preview or production release binary difference.

If you run `pnpm mobile:screenshots` in an interactive terminal, it will prompt you to choose:

- `all`
- `sign-in-review`
- `profile-review`
- `lists-review`
- `bills-review`
- `friends-review`
- `add-visit-review`
- `add-quick-track-review`
- `notes-review`
- `sign-out-review`

Interactive prompt input also accepts multiple selections, including numeric shortcuts such as `2,3` or `2 3`.

You can also pass one or more flow names explicitly:

```bash
pnpm mobile:screenshots --env local -- profile-review
pnpm mobile:screenshots --env beta -- sign-in-review
pnpm mobile:screenshots --env production -- lists-review
pnpm mobile:screenshots --env production -- bills-review
pnpm mobile:screenshots --env beta -- friends-review
pnpm mobile:screenshots --env beta -- add-visit-review
pnpm mobile:screenshots --env beta -- add-quick-track-review
pnpm mobile:screenshots --env beta -- notes-review
pnpm mobile:screenshots --env local -- sign-out-review
pnpm mobile:screenshots --env beta -- sign-in-review profile-review lists-review bills-review friends-review add-visit-review add-quick-track-review notes-review sign-out-review
pnpm mobile:screenshots --env local -- all
```

## Flow

Flow aliases:

- `sign-in-review` -> `apps/mobile/e2e/maestro/flows/sign-in-review.yaml`
- `profile-review` -> `apps/mobile/e2e/maestro/flows/profile-review.yaml`
- `lists-review` -> `apps/mobile/e2e/maestro/flows/lists-review-part-1.yaml`
- `bills-review` -> `apps/mobile/e2e/maestro/flows/bills-review.yaml`
- `friends-review` -> `apps/mobile/e2e/maestro/flows/friends-review.yaml`
- `add-visit-review` -> `apps/mobile/e2e/maestro/flows/add-visit-review.yaml`
- `add-quick-track-review` -> `apps/mobile/e2e/maestro/flows/add-quick-track-review.yaml`
- `notes-review` -> `apps/mobile/e2e/maestro/flows/notes-review.yaml`
- `sign-out-review` -> `apps/mobile/e2e/maestro/flows/sign-out-review.yaml`

`profile-review` assumes the app is already signed in on Home. It is intended to run immediately after `sign-in-review`, and `pnpm mobile:screenshots -- all` runs them in that order.

`lists-review` assumes the app is already on Profile. It is intended to run immediately after `profile-review`, and `pnpm mobile:screenshots -- all` runs them in that order.

`bills-review` assumes the app is already on the More tab. It is intended to run immediately after `lists-review`, and `pnpm mobile:screenshots -- all` runs them in that order.

`friends-review` assumes the app is already back on the More tab after `bills-review`, and `pnpm mobile:screenshots -- all` runs it after the bills flow.

`add-visit-review` assumes the app is already on Friends after `friends-review`. It is intended to run immediately after `friends-review`, and it ends on Home so `add-quick-track-review` can continue cleanly.

`add-quick-track-review` assumes the app is already on Home after `add-visit-review`. It is intended to run immediately after `add-visit-review`, and it returns to the Add tab so `notes-review` can continue cleanly.

`notes-review` assumes the app is already on the Add tab after `add-quick-track-review`. It is intended to run immediately after `add-quick-track-review`, and it returns to Friends so `sign-out-review` can continue cleanly.

`sign-out-review` assumes the app is already back on Friends. It is intended to run immediately after `notes-review`, and `pnpm mobile:screenshots -- all` runs it after the notes flow.

`sign-in-review` captures:

- `01-onboarding`
- `02-create-account`
- `02a-create-account-name-keyboard`
- `02b-create-account-email-keyboard`
- `02c-create-account-invite-code-keyboard`
- `02d-create-account-password-keyboard`
- `02e-create-account-confirm-password-keyboard`
- `03-login`
- `04-forgot-password`
- `04a-forgot-password-email-keyboard`
- `05-home`

`profile-review` captures:

- `06-profile`
- `07-profile-edit-account-name`
- `07a-profile-edit-account-name-keyboard`
- `08-profile-account-details-collapsed`
- `09-profile-invite-codes`
- `10-profile-delete-account`
- `12-about`
- `13-terms-of-service`
- `14-privacy-policy`
- `15-settings`
- `15a-settings-default-list-visibility`
- `16-feedback-list`
- `17-create-feedback`
- `17a-create-feedback-subject-keyboard`
- `17b-create-feedback-message-keyboard`
- `18-feedback-detail`
- `18a-feedback-detail-message-keyboard`

`lists-review` captures:

- `22-more`
- `23-lists-list`
- `23a-lists-search-keyboard`
- `24-add-list`
- `24a-add-list-name-keyboard`
- `24b-add-list-description-keyboard`
- `25-primary-list-detail`
- `26-add-visit-ratings-to-list`
- `27-add-restaurant-to-list-detail`
- `27a-add-restaurant-to-list-note-keyboard`
- `28-secondary-list-detail`
- `29-full-photo`
- `30-edit-list`
- `30a-edit-list-name-keyboard`
- `30b-edit-list-description-keyboard`
- `31-delete-list-confirmation`
- `32-friend-lists`
- `32a-friend-lists-search-keyboard`
- `33-friend-list-detail`

`bills-review` captures:

- `34-tip-calculator`
- `34a-tip-calculator-subtotal-keyboard`
- `34b-tip-calculator-taxes-keyboard`
- `34c-tip-calculator-tip-percentage-keyboard`
- `34d-tip-calculator-specific-amount`
- `34e-tip-calculator-tip-amount-keyboard`
- `35-bills-you-owe`
- `36-bills-all`
- `37-bills-youre-owed`
- `38-bills-settled`
- `39-create-bill`
- `39a-create-bill-name-keyboard`
- `39b-create-bill-total-bill-price-keyboard`
- `39c-create-bill-custom`
- `39d-create-bill-custom-name-keyboard`
- `39e-create-bill-item-name-keyboard`
- `39f-create-bill-item-price-keyboard`
- `39g-create-bill-tax-keyboard`
- `39h-create-bill-fees-keyboard`
- `39i-create-bill-tip-keyboard`
- `39j-create-bill-final-price-keyboard`
- `39k-create-bill-manual`
- `39l-create-bill-manual-name-keyboard`
- `39m-create-bill-manual-total-bill-price-keyboard`
- `40-create-bill-lower`
- `40a-create-bill-manual-owed-amount-keyboard`
- `41-bill-detail`
- `42-bill-detail-bottom`
- `43-edit-bill`
- `43a-edit-bill-name-keyboard`
- `43b-edit-bill-item-name-keyboard`
- `43c-edit-bill-item-price-keyboard`
- `44-edit-bill-items-tax`
- `44a-edit-bill-tax-keyboard`
- `44b-edit-bill-fees-keyboard`
- `44c-edit-bill-custom-tip-keyboard`
- `44d-edit-bill-custom-tip-split-0-keyboard`
- `44e-edit-bill-custom-tip-split-1-keyboard`
- `45-edit-bill-final-owed`
- `45a-edit-bill-final-price-keyboard`

`friends-review` captures:

- `46-friends`
- `47-friends-requests`
- `48-friends-sent`
- `49-friends-my-code`
- `50-add-friend`
- `51-scan-qr`

`add-visit-review` captures:

- `52-add-tab`
- `53-track-restaurant-visit`
- `54-track-visit-search-expanded`
- `55-add-new-restaurant`
- `56-first-your-restaurant`
- `57-scan-menu-photo`
- `58-after-menu-scan-cancel`
- `59-after-items-cancel`
- `60-item-entry-tip`
- `61-add-menu-item`
- `62-after-add-menu-item-cancel`
- `63-selected-menu-item-rating`
- `64-rating-guide-expanded`
- `65-rating-1`
- `66-rating-2`
- `67-rating-4`
- `68-rating-5`
- `69-home-new-visit`
- `70-edit-visit`
- `71-edit-visit-lower`
- `72-edit-visit-items`
- `73-edit-visit-restaurant`
- `74-delete-visit-confirmation`
- `75-home-friends`
- `76-home-mine`

`add-quick-track-review` captures:

- `77-add-tab-quick-track`
- `78-quick-track-item`
- `79-quick-track-rating-guide`
- `80-quick-track-rating-guide-expanded`
- `81-quick-track-rating-1`
- `82-quick-track-rating-2`
- `83-quick-track-rating-4`
- `84-quick-track-rating-5`

`notes-review` captures:

- `85-log-note`
- `86-manage-notes`
- `87-add-note`
- `88-notes-used`
- `89-notes-all`
- `90-edit-note`
- `91-delete-note-confirmation`

`sign-out-review` captures:

- `19-onboarding-logged-out`

## Review Website

Run the local review site with:

```bash
pnpm mobile:screenshots:review
```

Then open `http://localhost:4174`.

What it does:

- reads artifact runs from `apps/mobile/e2e/artifacts/<run>/screenshots/`
- reads run metadata from `apps/mobile/e2e/artifacts/<run>/run.json`
- shows artifact images beside any existing baseline image
- shows each run's classified environment and lets you filter runs by environment
- defaults beta and production runs to matching baseline sets when `baselines/beta/` or `baselines/production/` exist
- lets you move an approved artifact image into `apps/mobile/e2e/baselines/<set>/`

The move is local filesystem state, not just UI state. Once promoted, the image is removed from the artifact run and becomes the baseline file for that filename.

`apps/mobile/e2e/baselines/` is intentionally gitignored. Promoted baseline screenshots stay local unless you explicitly share them out of band.

Recommended baseline layout:

- `apps/mobile/e2e/baselines/current/` for existing shared screenshots
- `apps/mobile/e2e/baselines/local/` for local/dev-targeted runs
- `apps/mobile/e2e/baselines/beta/` for beta-targeted runs
- `apps/mobile/e2e/baselines/production/` for production-targeted runs
