# Mobile Production Release Checklist

Use this checklist when shipping a production mobile app update that depends on backend or web deployment changes.

The release rule is: production backend must stay compatible with the currently live App Store and Play Store builds, plus the new build being submitted. Backend deploys are immediate; app store releases are reviewed, staggered, and can be delayed.

## Release Record

- Release name/version:
- Mobile commit:
- Backend commit:
- iOS build number:
- Android version code:
- EAS build links:
- App Store Connect link:
- Play Console release link:
- Release owner:
- Planned release date:

## 1. Compatibility Check

- Confirm backend changes are backward-compatible with the currently live mobile app versions.
- Confirm any schema migrations are safe to run before the new mobile app is released.
- Confirm removed or renamed API fields are still tolerated by old app versions.
- Confirm new mobile behavior is protected by feature flags when backend/app timing is risky.
- Confirm production defaults keep unfinished or unreleased features disabled.
- Confirm rollback plan for backend deploy is known before release starts.

## 2. Pre-Release Validation

Run from the repo root:

```sh
pnpm mobile:lint
pnpm mobile:typecheck
pnpm mobile:doctor
pnpm mobile:unused-exports
(cd backend && govulncheck ./...)
```

- Confirm staging/beta backend has been deployed and smoke tested.
- Confirm login, signup, core browse screens, core writes, and offline-sensitive flows work against staging/beta.
- Confirm the app handles offline/refetch failures with cached data where expected.
- Confirm destructive actions still show confirmation modals before deletion.
- Confirm online-only actions are disabled or clearly labeled while offline.
- Review `docs/mobile-store-readiness.md` for store metadata, privacy, credentials, and policy checks.
- Review `docs/mobile-local-persistence.md` when release changes touch offline browsing, queued writes, auth storage, redirects, or analytics first-use markers.
- Review `docs/mobile-native-upgrade-maintenance.md` when release changes touch Expo, React Native, CocoaPods, Xcode, native projects, or package patches.

## 3. Backend Production Deploy

- Deploy backend/web production changes.
- Confirm migrations completed successfully.
- Confirm PocketBase health check passes.
- Smoke test production API with the currently live app version if practical.
- Smoke test production API with the release candidate build.
- Confirm monitoring/logs do not show new errors after deploy.

Reference:

```sh
bash scripts/deploy.sh production
```

## 4. Mobile Release Candidate

- Confirm the release candidate commit is final.
- Bump the mobile app version for the release before creating store builds:
  - For standard patch releases, the production build scripts run `mobile:version:bump:patch` automatically.
  - That script syncs `apps/mobile/app.json`, `apps/mobile/ios/YummyRecs/Info.plist`, `apps/mobile/ios/YummyRecs/Supporting/Expo.plist`, and iOS `MARKETING_VERSION` settings before EAS archives the native project.
  - Use the manual version steps below for non-patch releases or runtime changes that need review before the EAS build starts.
  - Update `expo.version` in `apps/mobile/app.json`.
  - Update `expo.ios.runtimeVersion` in `apps/mobile/app.json` when the release should use a new iOS OTA runtime.
  - Update preview runtime expectations in `scripts/assert-mobile-preview-config.mjs` when the release should use a new preview OTA runtime.
  - Update `EXUpdatesRuntimeVersion` in `apps/mobile/ios/YummyRecs/Supporting/Expo.plist` when the embedded preview runtime changes.
  - Update `CFBundleShortVersionString` in `apps/mobile/ios/YummyRecs/Info.plist` to match the intended iOS marketing version.
  - Leave native build numbers/version codes to EAS `autoIncrement` unless the release explicitly needs manual values.
- Confirm mobile version/build numbers are correct.
- Confirm production environment variables/config point at production services.
- Confirm EAS production profile is being used.
- Build both platforms from the same commit unless a split release is intentional.
- Choose one iOS production path:
  - `pnpm run mobile:build:ios:production` bumps the patch version and creates a production iOS build.
  - `pnpm run mobile:build:ios:production:submit` bumps the patch version, creates a production iOS build, and submits it through the `production` submit profile after the build completes.
  - Do not run both for the same release unless you intentionally want another patch version bump.
- After running either production build script, review the version changes before committing the release.

Version verification:

```sh
APP_VARIANT=production EXPO_PUBLIC_APP_ENV=production EAS_BUILD_PROFILE=production node -e "const appJson=require('./apps/mobile/app.json').expo; const resolve=require('./apps/mobile/app.config.js'); const c=resolve({config: appJson}); console.log(JSON.stringify({version:c.version,runtimeVersion:c.runtimeVersion,iosRuntimeVersion:c.ios.runtimeVersion,iosBundleIdentifier:c.ios.bundleIdentifier}, null, 2));"
plutil -p apps/mobile/ios/YummyRecs/Info.plist | rg "CFBundleShortVersionString|CFBundleVersion" -A1
```

Production iOS build only:

```sh
pnpm run mobile:build:ios:production
```

Production iOS build and submit:

```sh
pnpm run mobile:build:ios:production:submit
```

- Record the EAS build links in the release record.
- Install or distribute the builds for final smoke testing.
- If you used `mobile:build:ios:production:submit`, confirm the submission started and skip the iOS submit command in the next section.

## 5. Store Submission

- Submit iOS production build to App Store Connect.
- Submit Android production build to the intended Play Console track.
- Confirm release notes match the shipped behavior.
- Confirm store review answers, privacy details, and data safety details are still accurate.
- Add or update App Review notes for any new permissions, notification behavior, login/setup requirements, or reviewer-visible feature changes.
- Record App Store Connect and Play Console links in the release record.

### App Review Notes Template

Use this release-specific summary for version `1.1.0` submissions:

```text
Yummy Recs 1.1.0 updates the mobile runtime to Expo SDK 56 / React Native 0.85 and includes user-facing improvements for notifications, Want to Try lists, bills, tasting sessions, onboarding tutorials, offline/local persistence, and photo handling.

Reviewer-visible changes:
- Push notifications are now supported for visit reminders, bill reminders, and monthly friend activity. Notification preferences are available from Settings > Notifications and are opt-in based on system permission.
- The default saved list is now presented as Want to Try. Users can save restaurants and menu items, see friend overlap, filter friend matches, and remove Want to Try bookmarks.
- Bills now refresh more reliably after notification taps, focus changes, reconnects, and detail navigation.
- Tasting sessions include improved reminder/deep-link behavior, an exit flow, and clearer delete/trash confirmations.
- Onboarding/tutorial media has been refreshed and converted to GIF assets.
- Photo intake and uploads were updated for Expo SDK 56 file-system behavior.

Existing review context:
- Camera is used for QR scanning and food/receipt photo capture.
- Photo library access is used to select food photos.
- Location is used to find nearby restaurants during restaurant search.
- Account deletion remains available from the profile/account flow.
```

One-step build and submit path:

```sh
pnpm run mobile:build:ios:production:submit
```

Use the one-step path instead of the build-only command in section 4. If the production build already exists and was not auto-submitted, submit the existing build without bumping the version:

```sh
pnpm --filter @food-tracker/mobile exec eas submit --platform ios --profile production --latest
```

## 6. Final Production Smoke Test

Test the submitted/release-candidate app against production:

- Authentication: login, logout, signup or account entry path.
- Home/feed browse path.
- Notes, lists, bills, friends, feedback, or any touched release area.
- Create/update/delete for touched user-authored flows.
- Offline launch with cached data for core browse surfaces.
- Reconnect/sync behavior for queued writes.
- Deep links or auth links if touched.
- Account/profile basics.

Do not proceed with rollout if a production-only issue requires a backend or mobile rebuild and affects core usage.

## 7. Rollout

- Release iOS after App Store approval.
- Release Android to the intended track.
- Prefer staged rollout for risky changes.
- Enable feature flags only after the approved build is available to users.
- Monitor crash rate, backend errors, sync failures, auth failures, and support reports.
- Keep the backend compatible with older app versions during the rollout window.

## 8. Post-Release

- Confirm the released store versions match the intended build numbers.
- Confirm production metrics look healthy after rollout starts.
- Confirm no backend rollback is needed.
- Update any release notes, issue tracker items, or changelog entries.
- Keep this release record attached to the relevant issue, PRD, or release notes.

## Emergency Notes

- If backend breaks old app versions, roll back or hotfix backend first.
- If the mobile app build is bad but backend is compatible, stop rollout in App Store Connect/Play Console and submit a fixed build.
- If a feature flag caused the issue, disable the flag before rebuilding.
- If offline sync is affected, preserve user data first and avoid destructive cleanup until the queue state is understood.
