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

## Expo Notifications Push Token Cancellation Patch

Decision: keep the `expo-notifications@56.0.20` patch until upstream treats React Native canceled fetches as non-failures in `updateDevicePushTokenAsync`.

Why:

- The active patch is registered in `pnpm-workspace.yaml` and `pnpm-lock.yaml` as `patches/expo-notifications@56.0.20.patch`.
- The patch only changes `updateDevicePushTokenAsync` to stop retrying when the caller's `AbortSignal` is already aborted or React Native throws `"Fetch request has been canceled"` instead of an `AbortError`.
- Without the patch, aborting an in-flight server registration update can be logged as a warning and scheduled for retry even though a newer registration request is expected to replace it.
- As of 2026-07-10, the published `expo-notifications@56.0.20` tarball still only checks `error?.name === "AbortError"` in its clean `src/utils/updateDevicePushTokenAsync.ts` and `build/utils/updateDevicePushTokenAsync.js`. The cancellation patch was therefore ported unchanged during the SDK 56 patch refresh.

Verification before removal:

```sh
pnpm view expo-notifications version dist-tags --json
tmpdir=$(mktemp -d)
(cd "$tmpdir" && npm pack expo-notifications@<candidate-version> --silent && tar -xzf expo-notifications-*.tgz)
rg -n "signal\\.aborted|Fetch request has been canceled|AbortError" "$tmpdir/package/src/utils/updateDevicePushTokenAsync.ts" "$tmpdir/package/build/utils/updateDevicePushTokenAsync.js"
pnpm --filter @food-tracker/mobile test -- notificationInteraction
pnpm --filter @food-tracker/mobile exec expo install --check
pnpm mobile:doctor
```

The `notificationInteraction` test suite covers app-level notification device registration and retry behavior around Expo push-token failures. For a candidate package removal, also verify the native registration path in a development build with notification permission granted by signing in, forcing a push-token registration refresh, then backgrounding/foregrounding or signing out during the request so the stale registration update is aborted. The app should complete the replacement registration path without logging `Fetch request has been canceled` as a warning or retrying the aborted update.

Removal condition:

- Remove `patches/expo-notifications@56.0.20.patch` and the matching `patchedDependencies` entries only after a compatible Expo SDK notification package includes equivalent cancellation handling in both TypeScript source and built JavaScript output, and the verification commands above pass.

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
