#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/app-env.sh"
load_food_tracker_env local

workspace_bin_exists() {
  local bin_name="$1"
  local workspace_dir="${2:-}"

  if [ -x "$ROOT_DIR/node_modules/.bin/$bin_name" ]; then
    return 0
  fi

  if [ -n "$workspace_dir" ] && [ -x "$ROOT_DIR/$workspace_dir/node_modules/.bin/$bin_name" ]; then
    return 0
  fi

  return 1
}

ensure_workspace_deps() {
  if \
    workspace_bin_exists "turbo" && \
    workspace_bin_exists "vite" "apps/admin" && \
    workspace_bin_exists "expo" "apps/mobile"; then
    return
  fi

  echo "Workspace dependencies are missing. Installing with pnpm..."
  pnpm install
}

ensure_port_available() {
  local port="$1"
  local name="$2"
  local process_details=""

  if command -v lsof >/dev/null 2>&1; then
    process_details="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)"
  fi

  if [ -n "$process_details" ]; then
    echo "Cannot start ${name}: port ${port} is already in use." >&2
    echo "$process_details" >&2
    echo "Stop the existing process or free port ${port}, then rerun pnpm dev." >&2
    return 1
  fi
}

ensure_workspace_deps
ensure_port_available 5173 "ADMIN"
ensure_port_available "${FOOD_TRACKER_POCKETBASE_PORT:-8090}" "API"
ensure_port_available "${MARKETING_DEV_PORT:-4173}" "MARKETING"

echo ""
echo "Development services are starting with Turbo ${FOOD_TRACKER_DEV_UI:-tui} UI:"
echo "  - App URL:      ${FOOD_TRACKER_APP_URL} (press w in Expo to open web)"
echo "  - Admin:        ${FOOD_TRACKER_ADMIN_URL}"
echo "  - API:          ${FOOD_TRACKER_API_BASE_URL}"
echo "  - Marketing:    ${FOOD_TRACKER_MARKETING_URL}"
echo ""
echo "Turbo TUI shortcuts include task selection, log scrolling, and interact mode for Expo."
echo "Use pnpm dev:stream for normal terminal text selection/copying."
echo ""

pnpm exec turbo run dev \
  --ui="${FOOD_TRACKER_DEV_UI:-tui}" \
  --parallel \
  --filter=@food-tracker/mobile \
  --filter=@food-tracker/admin \
  --filter=@food-tracker/api \
  --filter=@food-tracker/marketing \
  "$@"
