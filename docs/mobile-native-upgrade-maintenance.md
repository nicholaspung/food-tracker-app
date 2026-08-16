# Mobile Native Upgrade Maintenance

Use this note when upgrading Expo, React Native, Xcode, CocoaPods, or native Expo modules for `apps/mobile`.

## Maintenance Rule

Keep native upgrade work visible in one of these places:

- `apps/mobile/ios/Podfile` for active CocoaPods or Xcode build-setting workarounds.
- `patches/` plus the root `pnpm-lock.yaml` `patchedDependencies` section for active package patches.
- This document for upgrade decisions, verification commands, and retired workarounds.

Do not split one workaround across the Podfile, package patch metadata, and undocumented generated files. If a workaround is still required, the active file must explain the exact native failure it prevents and the verification needed before removal.

Generated native files under `apps/mobile/ios/Pods/` and Xcode derived data are not maintenance records. Recreate them with `pod install`, Expo prebuild, or a clean native build instead of preserving hidden state there.

## Native Sync Validation

The repo checks in `apps/mobile/ios`, keeps a custom `ReleasePreview` iOS build configuration, and intentionally carries Podfile build settings that Expo Doctor's broad non-CNG sync check cannot model precisely. `apps/mobile/package.json` disables only that broad Expo Doctor check.

The replacement guardrail is `scripts/verify-mobile-native-sync.mjs`, and `pnpm mobile:doctor` runs it before `expo-doctor`. It validates the resolved production and preview Expo config against the checked-in iOS bundle identifiers, app-link hosts, runtime/version values, deployment target, permission strings, and `ReleasePreview` suffix settings. Update this script when app identity, versioning, deployment target, permissions, or preview-native behavior changes.

## Live Expo Doctor Advisory Policy

`pnpm mobile:doctor` intentionally runs `expo-doctor@latest` as a live Expo advisory gate after native sync validation. Expo Doctor is not pinned in the mobile dependency graph, so its findings can change without a repository or lockfile change.

Release tooling intentionally pins `eas-cli` in the mobile development dependencies so local and CI releases use the lockfile version. Expo Doctor categorically rejects a project-local EAS CLI, so the Doctor wrapper suppresses only its `npm explain eas-cli` probe. The wrapper still downloads `expo-doctor@latest` and runs every other live Doctor check against the actual app config, native projects, dependencies, and lockfile.

A new Expo Doctor release may legitimately fail local, CI, or release validation after earlier runs passed. Treat that as updated compatibility guidance: resolve the reported finding, rerun the full mobile checks, and retry the push or release only after the gate passes. Do not dismiss changed findings as nondeterministic CI failures or pin Expo Doctor solely to preserve an earlier result.

## Expo SDK 57 Hermes Regression Upgrade

Decision: upgrade from Expo SDK 56 / React Native 0.85.3 to Expo SDK 57 / React Native 0.86.2.

Why:

- Expo Doctor reports that SDK 56's Hermes V1 `250829098.0.10` has a known memory regression. React Native 0.86.2 includes the first fixed Hermes release, `250829098.0.16`.
- Expo dependencies and development tooling are aligned with the versions selected by `expo install --fix` for `expo@57.0.13`.
- The checked-in Podfile enables Expo's SDK 57 precompiled-module default while preserving the source-build escape hatch and custom `ReleasePreview` configuration.
- The SDK 56 package release-age exceptions were removed because the SDK 57 dependency set installs without bypassing the repository's supply-chain age policy.

The SDK 57 config plugin list includes `expo-status-bar`, and the checked-in CocoaPods lockfile and Xcode project are regenerated with React Native 0.86.2.

## ExpoSQLite Xcode 26 Decision

Decision: remove the ExpoSQLite/Xcode 26 workaround after the Expo SDK 56 native refresh.

Why:

- The stale SDK 55 `expo-sqlite@55.0.16` patched dependency metadata has been removed from `pnpm-lock.yaml`.
- `expo-sqlite@56.0.4` builds cleanly on Xcode 26.4.1 without the Podfile hook that wrote `ExpoSQLitePrivate.modulemap`, injected it into `OTHER_SWIFT_FLAGS`, and disabled explicit modules for the `ExpoSQLite` pod target.
- No SDK 56 package patch is needed for ExpoSQLite.

Verification performed on 2026-05-31:

```sh
(cd apps/mobile/ios && pod install)
rg -n "ExpoSQLitePrivate|fmodule-map-file" apps/mobile/ios/Podfile apps/mobile/ios/Pods/Pods.xcodeproj apps/mobile/ios/Pods/Headers/Public/ExpoSQLite
EXPO_NO_DOTENV=1 pnpm --filter @food-tracker/mobile exec expo run:ios --no-build-cache --device "iPhone 17"
xcrun simctl launch --terminate-running-process booted com.yummyrecs.mobile
xcrun simctl spawn booted log show --style compact --last 2m --predicate 'process == "YummyRecs" OR eventMessage CONTAINS[c] "sqlite" OR eventMessage CONTAINS[c] "offline"'
```

Result:

- Xcode completed a clean native build and installed the app.
- The regenerated Pods project had no `ExpoSQLitePrivate` modulemap or injected `fmodule-map-file` reference.
- Expo's wrapper still exited after install/open on the known simulator activation check: `osascript -e tell app "System Events" to count processes whose name is "Simulator"`.
- Manual `simctl launch` succeeded.
- Simulator logs showed the JavaScript bundle loading and no native SQLite/offline queue initialization errors.

## Retired Expo Notifications Push Token Cancellation Patch

Decision: retire the `expo-notifications@56.0.22` patch during the Expo SDK 57 upgrade.

Why:

- `expo-notifications@57.0.11` checks `signal.aborted` as well as `AbortError` before logging or retrying an aborted device-token update.
- Equivalent handling is present in both the published TypeScript source and built JavaScript output.
- The version-specific patch and `patchedDependencies` registration are therefore no longer needed.

Verification performed on 2026-08-16:

```sh
npm pack expo-notifications@57.0.11
rg -n "signal\\.aborted|AbortError" package/src/utils/updateDevicePushTokenAsync.ts package/build/utils/updateDevicePushTokenAsync.js
pnpm --filter @food-tracker/mobile test -- notificationInteraction
pnpm --filter @food-tracker/mobile exec expo install --check
pnpm mobile:doctor
```

The `notificationInteraction` test suite covers app-level notification device registration and retry behavior around Expo push-token failures. During native smoke testing, also verify that backgrounding, foregrounding, or signing out during registration does not log or retry the superseded request.

## When Adding A Native Workaround

1. Reproduce the native failure with the smallest command possible.
2. Prefer upgrading the package or regenerating native projects before patching vendored code.
3. If a patch is required, patch the smallest package file that fixes the verified failure and keep the patch name version-specific.
4. If the workaround belongs in the Podfile, keep it target-scoped and document the compiler/linker/runtime failure inline.
5. Record the verification command and removal condition in this document.
6. Run the mobile checks relevant to the change:

```sh
pnpm mobile:lint
pnpm mobile:typecheck
pnpm mobile:unused-exports
pnpm mobile:doctor
```
