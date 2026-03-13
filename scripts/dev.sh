#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/app-env.sh"
load_food_tracker_env local

declare -a BG_PIDS=()

ensure_workspace_deps() {
  if [ -x "apps/admin/node_modules/.bin/vite" ] && [ -x "apps/mobile/node_modules/.bin/expo" ]; then
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

cleanup() {
  if [ "${#BG_PIDS[@]}" -eq 0 ]; then
    return
  fi

  for pid in "${BG_PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      pkill -TERM -P "$pid" >/dev/null 2>&1 || true
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}

start_service() {
  local name="$1"
  shift

  (
    "$@" 2>&1 | sed -u "s/^/[${name}] /"
  ) &

  BG_PIDS+=("$!")
}

trap cleanup EXIT INT TERM

ensure_workspace_deps
ensure_port_available 4173 "MARKETING"

start_service "ADMIN" pnpm dev:admin
start_service "API" pnpm dev:api
start_service "MARKETING" pnpm dev:marketing

echo ""
echo "Development services are running:"
echo "  - App (web):    ${FOOD_TRACKER_APP_URL}"
echo "  - Admin:        ${FOOD_TRACKER_ADMIN_URL}"
echo "  - API:          ${FOOD_TRACKER_API_BASE_URL}"
echo "  - Marketing:    ${FOOD_TRACKER_MARKETING_URL}"
echo ""
echo "Starting Expo iOS dev client (interactive mode)..."
echo "Use Expo terminal shortcuts: r (reload), d (dev menu), j (debugger), ? (help)."
echo ""

pnpm dev:app-ios
