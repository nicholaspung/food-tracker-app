# Mobile Native Upgrade Maintenance

Use this note when upgrading Expo, React Native, Xcode, CocoaPods, or native Expo modules for `apps/mobile`.

## Maintenance Rule

Keep native upgrade work visible in one of these places:

- `apps/mobile/ios/Podfile` for active CocoaPods or Xcode build-setting workarounds.
- `patches/` plus the root `pnpm-lock.yaml` `patchedDependencies` section for active package patches.
- This document for upgrade decisions, verification commands, and retired workarounds.

Do not split one workaround across the Podfile, package patch metadata, and undocumented generated files. If a workaround is still required, the active file must explain the exact native failure it prevents and the verification needed before removal.

Generated native files under `apps/mobile/ios/Pods/` and Xcode derived data are not maintenance records. Recreate them with `pod install`, Expo prebuild, or a clean native build instead of preserving hidden state there.

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
