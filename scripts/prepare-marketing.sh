#!/bin/bash

set -euo pipefail

SOURCE_DIR="${1:-apps/marketing/dist}"
TARGET_DIR="${2:-apps/marketing/.prepared-dist}"
APP_OPEN_URL="${APP_OPEN_URL:-http://localhost:8081/}"
TOKEN="__APP_OPEN_URL__"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Source directory not found: $SOURCE_DIR" >&2
    exit 1
fi

rm -rf "$TARGET_DIR"
cp -r "$SOURCE_DIR" "$TARGET_DIR"

find "$TARGET_DIR" -type f -name '*.html' -exec perl -0pi -e "s|$TOKEN|$APP_OPEN_URL|g" {} +
