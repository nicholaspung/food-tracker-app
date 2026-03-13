#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/app-env.sh"

TARGET_ENV="$(normalize_food_tracker_env "${1:-local}")"
shift || true

load_food_tracker_env "$TARGET_ENV"

export EXPO_NO_DOTENV=1

cd "$ROOT_DIR/apps/mobile"
exec npx expo start "$@"
