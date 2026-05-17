#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${1:-apps/marketing/dist}"
TARGET_DIR="${2:-apps/marketing/.prepared-dist}"
APP_OPEN_URL="${APP_OPEN_URL:-http://localhost:8081/}"
IOS_APP_STORE_URL="${IOS_APP_STORE_URL:-https://apps.apple.com/us/app/yummy-recs/id6761597807}"
APP_OPEN_TOKEN="__APP_OPEN_URL__"
IOS_APP_STORE_TOKEN="__IOS_APP_STORE_URL__"
MOBILE_LOGO_SOURCE="$REPO_DIR/apps/mobile/assets/brand-logo.svg"
MOBILE_LOGO_PNG_SOURCE="$REPO_DIR/apps/mobile/assets/brand-logo.png"
IONICONS_FONT_SOURCE="$(
    node -e "
const path = require('node:path');
const repoDir = process.argv[1];
const packageJsonPath = require.resolve('@expo/vector-icons/package.json', {
  paths: [repoDir, path.join(repoDir, 'apps/mobile')],
});
process.stdout.write(
  path.join(
    path.dirname(packageJsonPath),
    'build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
  ),
);
" "$REPO_DIR"
)"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Source directory not found: $SOURCE_DIR" >&2
    exit 1
fi

if [ ! -f "$MOBILE_LOGO_SOURCE" ]; then
    echo "Mobile brand logo not found: $MOBILE_LOGO_SOURCE" >&2
    exit 1
fi

if [ ! -f "$MOBILE_LOGO_PNG_SOURCE" ]; then
    echo "Mobile brand PNG logo not found: $MOBILE_LOGO_PNG_SOURCE" >&2
    exit 1
fi

if [ ! -f "$IONICONS_FONT_SOURCE" ]; then
    echo "Ionicons font not found: $IONICONS_FONT_SOURCE" >&2
    exit 1
fi

rm -rf "$TARGET_DIR"
cp -r "$SOURCE_DIR" "$TARGET_DIR"
cp "$MOBILE_LOGO_SOURCE" "$TARGET_DIR/brand-logo.svg"
cp "$MOBILE_LOGO_PNG_SOURCE" "$TARGET_DIR/brand-logo.png"
cp "$IONICONS_FONT_SOURCE" "$TARGET_DIR/ionicons.ttf"

find "$TARGET_DIR" -type f -name '*.html' -exec perl -0pi -e "s|$APP_OPEN_TOKEN|$APP_OPEN_URL|g; s|$IOS_APP_STORE_TOKEN|$IOS_APP_STORE_URL|g" {} +
