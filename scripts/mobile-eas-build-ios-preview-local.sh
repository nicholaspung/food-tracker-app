#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_DIR="${EAS_LOCAL_BUILD_ARTIFACTS_DIR:-$ROOT_DIR/.eas-artifacts/ios-preview-local}"

case "$ARTIFACTS_DIR" in
  /*) ;;
  *) ARTIFACTS_DIR="$ROOT_DIR/$ARTIFACTS_DIR" ;;
esac

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is not available. Install Xcode and the iOS command line tools before running local iOS builds."
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods is not available. Install it first, for example: brew install cocoapods"
  exit 1
fi

if ! command -v fastlane >/dev/null 2>&1; then
  echo "fastlane is not available. Install it first, for example: brew install fastlane"
  echo "Expo local iOS builds require fastlane: https://docs.expo.dev/build-reference/local-builds/"
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"
export EAS_LOCAL_BUILD_ARTIFACTS_DIR="$ARTIFACTS_DIR"

echo "Using xcodebuild: $(xcodebuild -version | tr '\n' ' ' | sed 's/  */ /g')"
echo "Using CocoaPods: $(pod --version)"
echo "Using fastlane: $(fastlane --version | head -n 1)"
echo "Local EAS artifacts directory: $EAS_LOCAL_BUILD_ARTIFACTS_DIR"

set +e
(
  cd "$ROOT_DIR/apps/mobile"
  pnpm exec eas build --platform ios --profile preview --local --clear-cache
)
build_status=$?
set -e

echo
echo "Local build artifacts are stored in: $EAS_LOCAL_BUILD_ARTIFACTS_DIR"
echo "To clean app-specific local iOS build residue:"
echo "  rm -rf \"$EAS_LOCAL_BUILD_ARTIFACTS_DIR\" ~/Library/Developer/Xcode/DerivedData/YummyRecs-*"

exit "$build_status"
