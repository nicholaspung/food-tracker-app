# Mobile Store Readiness Checklist

This checklist covers repo-side release readiness plus items that must be verified in App Store Connect, Play Console, or the release environment.

## Repo-Side Checks

- Confirm `apps/mobile/app.json` has the production bundle identifier, Android package name, app name, icon, adaptive icon, splash image, and version values for the intended release.
- Confirm `apps/mobile/eas.json` has build and submit profiles for the intended release track.
- Confirm iOS privacy usage strings in `apps/mobile/ios/YummyRecs/Info.plist` match current feature usage.
- Confirm account deletion remains reachable from the profile/account flow.
- Confirm the in-app privacy policy screen and support contact are current.
- Confirm OTA update/runtime version policy is appropriate for the release channel.

## External Release Checks

- Confirm the public privacy policy URL used in store metadata is live.
- Confirm account deletion instructions or URL used in store metadata are live.
- Confirm App Store Connect and Play Console metadata, screenshots, age rating/content rating, data safety/privacy nutrition answers, and support URLs.
- Confirm Apple and Google policy requirements that are current on the submission date.
- Confirm EAS credentials, Apple team access, Play service account access, and release signing are available in the CI/release environment.
- Confirm `google-service-account.json` or equivalent Play credentials are available to the release job and are not committed.

## Pre-Submission Commands

Run these from the repo root before creating a release build:

```sh
pnpm mobile:lint
pnpm mobile:typecheck
pnpm mobile:doctor
```
