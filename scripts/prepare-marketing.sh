#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${1:-apps/marketing/dist}"
TARGET_DIR="${2:-apps/marketing/.prepared-dist}"
APP_OPEN_URL="${APP_OPEN_URL:-http://localhost:8081/}"
TOKEN="__APP_OPEN_URL__"
MOBILE_LOGO_SOURCE="$REPO_DIR/apps/mobile/assets/brand-logo.svg"
MOBILE_LOGO_PNG_SOURCE="$REPO_DIR/apps/mobile/assets/brand-logo.png"
IONICONS_FONT_SOURCE="$REPO_DIR/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"

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

find "$TARGET_DIR" -type f -name '*.html' -exec perl -0pi -e "s|$TOKEN|$APP_OPEN_URL|g" {} +
