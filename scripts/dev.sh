#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/app-env.sh"
load_food_tracker_env local

declare -a BG_PIDS=()
cleanup_ran=0

ensure_workspace_deps() {
  if workspace_bin_exists "vite" "apps/admin" && workspace_bin_exists "expo" "apps/mobile"; then
    return
  fi

  echo "Workspace dependencies are missing. Installing with pnpm..."
  pnpm install
}

workspace_bin_exists() {
  local bin_name="$1"
  local workspace_dir="$2"

  if [ -x "$ROOT_DIR/node_modules/.bin/$bin_name" ]; then
    return 0
  fi

  if [ -x "$ROOT_DIR/$workspace_dir/node_modules/.bin/$bin_name" ]; then
    return 0
  fi

  return 1
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
  if [ "$cleanup_ran" -eq 1 ]; then
    return
  fi

  cleanup_ran=1

  if [ "${#BG_PIDS[@]}" -eq 0 ]; then
    return
  fi

  for pid in "${BG_PIDS[@]}"; do
    terminate_process_tree "$pid" TERM
  done

  sleep 1

  for pid in "${BG_PIDS[@]}"; do
    terminate_process_tree "$pid" KILL
  done
}

terminate_process_tree() {
  local pid="$1"
  local signal="${2:-TERM}"
  local -a children=()
  local child=""

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return
  fi

  if command -v pgrep >/dev/null 2>&1; then
    while IFS= read -r child; do
      if [ -n "$child" ]; then
        children+=("$child")
      fi
    done < <(pgrep -P "$pid" || true)
  fi

  for child in "${children[@]-}"; do
    if [ -z "$child" ]; then
      continue
    fi

    terminate_process_tree "$child" "$signal"
  done

  kill "-${signal}" "$pid" >/dev/null 2>&1 || true
}

start_service() {
  local name="$1"
  shift

  "$@" \
    > >(sed -u "s/^/[${name}] /") \
    2> >(sed -u "s/^/[${name}] /" >&2) &

  BG_PIDS+=("$!")
}

trap cleanup EXIT INT TERM HUP

ensure_workspace_deps
ensure_port_available 4173 "MARKETING"

start_service "ADMIN" pnpm dev:admin
start_service "API" pnpm dev:api
start_service "MARKETING" pnpm dev:marketing

echo ""
echo "Development services are running:"
echo "  - App URL:      ${FOOD_TRACKER_APP_URL} (press w in Expo to open web)"
echo "  - Admin:        ${FOOD_TRACKER_ADMIN_URL}"
echo "  - API:          ${FOOD_TRACKER_API_BASE_URL}"
echo "  - Marketing:    ${FOOD_TRACKER_MARKETING_URL}"
echo ""
echo "Starting Expo dev server (interactive mode)..."
echo "Use Expo terminal shortcuts: r (reload), d (dev menu), i (open iOS), w (open web), j (debugger), ? (help)."
echo ""

pnpm dev:app
