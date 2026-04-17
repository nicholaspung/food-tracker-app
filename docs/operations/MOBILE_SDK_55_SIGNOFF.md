# Mobile SDK 55 Signoff Runbook

This runbook is the operational follow-through for the Expo SDK 55 upgrade. Keep this scoped to SDK 55 release validation and deferred cleanup only. Do not mix SDK 56 or unrelated dependency upgrades into this workflow.

## Preconditions

- [ ] `Mobile Validate / Validate Mobile SDK 55` is green on the candidate branch.
- [ ] `Mobile Preview / Publish Mobile Preview` is green on the latest `main` deployment candidate.
- [ ] [`docs/features/MOBILE_REGRESSION_CHECKLIST.md`](../features/MOBILE_REGRESSION_CHECKLIST.md) `Expo SDK 55 Signoff` automated checks have been completed.
- [ ] No additional mobile dependency upgrades are queued for the same release window.

## GitHub Guardrail

This step is not repo-automatable from the checked-in code. Apply it directly in GitHub branch protection for `main`.

- Require status check: `Mobile Validate / Validate Mobile SDK 55`
- Do not require status check: `Mobile Preview / Publish Mobile Preview`

Record completion here when the branch protection rule is updated:

- [ ] Branch protection updated in GitHub
- Updated by:
- Date:

## Release-Path Drills

Run both drills through the `Mobile Preview` workflow with `workflow_dispatch`.

### Drill 1: OTA Verification

Use these inputs:

- `deploy_target`: `beta`
- `force_preview_build`: `false`
- `build_platform`: `ios`

Expected results:

- The job resolves `publish_mode=ota`
- The workflow runs `pnpm --dir apps/mobile exec eas update ...`
- The job summary says the run published a manual OTA update to the preview channel

Record evidence:

- [ ] OTA drill completed
- Workflow run URL:
- EAS update ID:

### Drill 2: Native Preview Build Verification

Use these inputs:

- `deploy_target`: `beta`
- `force_preview_build`: `true`
- `build_platform`: `all`

Expected results:

- The job resolves `publish_mode=build`
- The workflow runs `pnpm --dir apps/mobile exec eas build ...`
- The workflow triggers preview builds for both iOS and Android

Record evidence:

- [ ] Native preview build drill completed
- Workflow run URL:
- iOS build URL:
- Android build URL:

## Manual SDK 55 Smoke Signoff

Use the preview artifacts from the forced native build drill for both platforms.

### Devices

- [ ] iOS preview artifact installed
- [ ] Android preview artifact installed

### Required Flows

- [ ] Cold launch while already signed in restores the session and lands in the authenticated app
  Recommended path: close the app fully, reopen, confirm Home loads without forcing a fresh login
- [ ] Login succeeds and logout returns to the signed-out experience
  Recommended path: use the normal onboarding -> login flow, then sign out from Settings/Profile
- [ ] One deep link lands on the expected screen
  Recommended signed-out deep link: `yummyrecs://login`
  Recommended signed-in deep link: `yummyrecs://friends`
- [ ] Camera capture works end to end
  Recommended path: `ProcessPhotos`, `QuickTrack`, or `CreateVisit` camera entry
- [ ] Gallery import works end to end
  Recommended path: `ProcessPhotos`, `QuickTrack`, `NoteEditor`, or `CreateVisit` library picker
- [ ] Location permission flow behaves correctly
  Recommended path: `CreateVisit` or `PhotoProcessing` -> `Use current location`
- [ ] Cached data still renders while offline on a core browse surface
  Recommended path: load `Home` or `Notes` online, kill network access, reopen the screen, confirm cached data remains visible
- [ ] One offline-capable write queues offline and replays after reconnect
  Recommended path: create a `QuickTrack`, `Visit`, or `Note` while offline, confirm queued/offline messaging, reconnect, and confirm replay completion plus refreshed data

### Evidence

- [ ] iOS smoke signoff completed
- [ ] Android smoke signoff completed
- Signoff owner:
- Signoff date:

## Monitoring Window

Use the existing PostHog/error tracking integration in [`apps/mobile/src/observability/index.ts`](../../apps/mobile/src/observability/index.ts). Review the first 3 to 7 days after the first SDK 55 release candidate is exercised by testers or internal users.

### Event Families To Watch

- `AUTH_SESSION_RESTORE_STARTED`
- `AUTH_SESSION_RESTORE_SUCCEEDED`
- `AUTH_SESSION_RESTORE_FAILED`
- `LOGIN_SUCCESS`
- `LOGIN_FAILED`
- `SYNC_REPLAY_STARTED`
- `SYNC_REPLAY_COMPLETED`
- `SYNC_MUTATION_SUCCEEDED`
- `FEATURE_MUTATION_FAILED`
- `PHOTO_PROCESSING_*`
- `QR_SCAN_*`
- exception events captured through `captureObservabilityError`

### Review Method

- Compare the SDK 55 monitoring window against the previous 7-day beta baseline when possible.
- Investigate any new exception signature that references auth restore, offline replay, camera, image picker, or location permissions.
- Treat cleanup work as blocked if auth restore failures, replay failures, or photo-permission failures show a clear increase relative to the recent beta baseline.

### Monitoring Evidence

- [ ] Monitoring window completed
- Monitoring window dates:
- Reviewer:
- Notes:

## Deferred Cleanup Backlog

Keep these items out of the release signoff itself. Revisit them only after the monitoring window is clean.

- [ ] Cleanup 1: evaluate whether `expo.install.exclude` for `react-native-reanimated` in [`apps/mobile/package.json`](../../apps/mobile/package.json) can be removed safely
- [ ] Cleanup 2: re-check whether root `pnpm.overrides` entries for `eas-cli>ajv` and `eas-cli>minimatch` in [`package.json`](../../package.json) are still required
- [ ] Cleanup 3: convert the current SDK 55 smoke subset into the default recurring Expo release checklist once the monitoring window stays clean
