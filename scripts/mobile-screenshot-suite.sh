#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLOW_PATH="${1:-apps/mobile/e2e/maestro/flows/core-review.yaml}"
RUN_NAME="${RUN_NAME:-$(date +%Y%m%d-%H%M%S)}"
OUTPUT_DIR="$ROOT_DIR/apps/mobile/e2e/artifacts/$RUN_NAME"
ENV_FILE="${SCREENSHOT_ENV_FILE:-$ROOT_DIR/apps/mobile/e2e/.env.local}"

if ! command -v java >/dev/null 2>&1; then
  echo "Java 17+ is required to run Maestro, but 'java' was not found in PATH." >&2
  echo "Install it first, then re-run the screenshot suite." >&2
  echo "Maestro docs: https://docs.maestro.dev/getting-started/installing-maestro/macos" >&2
  echo "One macOS option: brew install openjdk@17" >&2
  exit 1
fi

JAVA_VERSION_OUTPUT="$(java -version 2>&1 || true)"
JAVA_MAJOR_VERSION="$(
  printf '%s\n' "$JAVA_VERSION_OUTPUT" \
    | sed -nE '1s/.*version "([0-9]+)(\.[0-9]+)?(\.[0-9]+)?".*/\1/p'
)"

if [ -z "$JAVA_MAJOR_VERSION" ] || [ "$JAVA_MAJOR_VERSION" -lt 17 ]; then
  echo "Java 17+ is required to run Maestro." >&2
  echo "Current 'java -version' output:" >&2
  echo "$JAVA_VERSION_OUTPUT" >&2
  echo "Maestro docs: https://docs.maestro.dev/getting-started/installing-maestro/macos" >&2
  exit 1
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI is required but was not found in PATH." >&2
  echo "Install it first: https://docs.maestro.dev/getting-started/installing-maestro" >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/$FLOW_PATH" ]; then
  echo "Flow file not found: $FLOW_PATH" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  echo "Loaded screenshot env file: $ENV_FILE"
fi

SCREENSHOT_LOGIN_EMAIL="${SCREENSHOT_LOGIN_EMAIL:-${MAESTRO_LOGIN_EMAIL:-${LOGIN_EMAIL:-}}}"
SCREENSHOT_LOGIN_PASSWORD="${SCREENSHOT_LOGIN_PASSWORD:-${MAESTRO_LOGIN_PASSWORD:-${LOGIN_PASSWORD:-}}}"

if [[ "$FLOW_PATH" == *"login"* || "$FLOW_PATH" == *"onboarding"* ]]; then
  if [ -z "${SCREENSHOT_LOGIN_EMAIL:-}" ] || [ -z "${SCREENSHOT_LOGIN_PASSWORD:-}" ]; then
    echo "Login flows require credentials." >&2
    echo "Set SCREENSHOT_LOGIN_EMAIL and SCREENSHOT_LOGIN_PASSWORD in $ENV_FILE" >&2
    echo "or export them in your shell before running the script." >&2
    exit 1
  fi
fi

mkdir -p "$OUTPUT_DIR"

echo "Running mobile screenshot review flow"
echo "Flow:   $FLOW_PATH"
echo "Output: $OUTPUT_DIR"
echo "Assumes your normal dev build is already open in the simulator."

cd "$ROOT_DIR"
MAESTRO_ARGS=(test --test-output-dir "$OUTPUT_DIR")

if [ -n "${SCREENSHOT_LOGIN_EMAIL:-}" ]; then
  MAESTRO_ARGS+=(-e "LOGIN_EMAIL=$SCREENSHOT_LOGIN_EMAIL")
fi

if [ -n "${SCREENSHOT_LOGIN_PASSWORD:-}" ]; then
  MAESTRO_ARGS+=(-e "LOGIN_PASSWORD=$SCREENSHOT_LOGIN_PASSWORD")
fi

maestro "${MAESTRO_ARGS[@]}" "$FLOW_PATH"

echo "Saved screenshots to $OUTPUT_DIR"
