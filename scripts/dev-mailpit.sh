#!/usr/bin/env bash

set -euo pipefail

normalize_food_tracker_env() {
  local raw_value="${1:-local}"
  local normalized_value
  normalized_value="$(printf '%s' "$raw_value" | tr '[:upper:]' '[:lower:]')"

  case "$normalized_value" in
    local|dev|development)
      printf 'local\n'
      ;;
    beta|preview)
      printf 'beta\n'
      ;;
    prod|production)
      printf 'production\n'
      ;;
    *)
      printf 'local\n'
      ;;
  esac
}

ensure_loopback_host() {
  local host="$1"
  local name="$2"

  case "$host" in
    127.0.0.1|localhost|::1)
      ;;
    *)
      echo "Mailpit ${name} must bind to a loopback host for local-only email testing." >&2
      echo "Use 127.0.0.1, localhost, or ::1; got: ${host}" >&2
      exit 1
      ;;
  esac
}

RUNTIME_ENV="$(normalize_food_tracker_env "${FOOD_TRACKER_ENV:-local}")"
if [ "$RUNTIME_ENV" != "local" ]; then
  echo "Mailpit is only allowed for local development; FOOD_TRACKER_ENV is ${RUNTIME_ENV}." >&2
  exit 1
fi

SMTP_HOST="${FOOD_TRACKER_MAILPIT_SMTP_HOST:-127.0.0.1}"
SMTP_PORT="${FOOD_TRACKER_MAILPIT_SMTP_PORT:-1025}"
UI_HOST="${FOOD_TRACKER_MAILPIT_UI_HOST:-127.0.0.1}"
UI_PORT="${FOOD_TRACKER_MAILPIT_UI_PORT:-8025}"

ensure_loopback_host "$SMTP_HOST" "SMTP host"
ensure_loopback_host "$UI_HOST" "UI host"

if ! command -v mailpit >/dev/null 2>&1; then
  echo "Mailpit is required for local email testing but was not found." >&2
  echo "Install it with: brew install mailpit" >&2
  exit 1
fi

exec mailpit \
  --disable-version-check \
  --smtp "${SMTP_HOST}:${SMTP_PORT}" \
  --listen "${UI_HOST}:${UI_PORT}"
