#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

declare -a BG_PIDS=()

ensure_workspace_deps() {
  if [ -x "apps/admin/node_modules/.bin/vite" ] && [ -x "apps/mobile/node_modules/.bin/expo" ]; then
    return
  fi

  echo "Workspace dependencies are missing. Installing with pnpm..."
  pnpm install
}

cleanup() {
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

start_service "ADMIN" pnpm dev:admin
start_service "API" pnpm dev:api
start_service "MARKETING" pnpm dev:marketing

echo ""
echo "Development services are running:"
echo "  - App (web):    http://localhost:8081"
echo "  - Admin:        http://localhost:5173"
echo "  - API:          http://localhost:8090"
echo "  - Marketing:    http://localhost:4173"
echo ""
echo "Starting Expo iOS dev client (interactive mode)..."
echo "Use Expo terminal shortcuts: r (reload), d (dev menu), j (debugger), ? (help)."
echo ""

pnpm dev:app-ios
