#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_NAME="${RUN_NAME:-$(date +%Y%m%d-%H%M%S)}"
OUTPUT_DIR="$ROOT_DIR/apps/mobile/e2e/artifacts/$RUN_NAME"
ENV_FILE="${SCREENSHOT_ENV_FILE:-$ROOT_DIR/apps/mobile/e2e/.env.local}"

FLOW_KEYS=("core-review" "lists-review" "bills-review" "friends-review")
declare -a SELECTED_FLOW_KEYS=()
declare -a SELECTED_FLOW_PATHS=()

resolve_flow_path() {
  case "$1" in
    core-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/core-review.yaml"
      ;;
    lists-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/lists-review-part-1.yaml"
      ;;
    bills-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/bills-review.yaml"
      ;;
    friends-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/friends-review.yaml"
      ;;
    *)
      return 1
      ;;
  esac
}

print_flow_selection_help() {
  cat <<'EOF'
Available screenshot flows:
  - all
  - core-review
  - lists-review
  - bills-review
  - friends-review

You can select multiple flows by separating values with commas or spaces.
Examples:
  pnpm mobile:screenshots -- all
  pnpm mobile:screenshots -- core-review lists-review bills-review friends-review
  pnpm mobile:screenshots -- core-review,lists-review
EOF
}

normalize_selection_tokens() {
  local raw_value
  for raw_value in "$@"; do
    raw_value="${raw_value//,/ }"
    # shellcheck disable=SC2086
    for token in $raw_value; do
      token="$(printf '%s' "$token" | tr '[:upper:]' '[:lower:]')"
      if [ "$token" = "--" ]; then
        continue
      fi
      if [ -n "$token" ]; then
        printf '%s\n' "$token"
      fi
    done
  done
}

flow_key_selected() {
  local target="$1"
  local existing
  if [ "${#SELECTED_FLOW_KEYS[@]}" -eq 0 ]; then
    return 1
  fi

  for existing in "${SELECTED_FLOW_KEYS[@]}"; do
    if [ "$existing" = "$target" ]; then
      return 0
    fi
  done

  return 1
}

prompt_for_flow_selection() {
  local prompt_input="/dev/stdin"
  if [ -r /dev/tty ]; then
    prompt_input="/dev/tty"
  fi

  echo "Select screenshot flow(s):" >&2
  echo "  1. all" >&2
  echo "  2. core-review" >&2
  echo "  3. lists-review" >&2
  echo "  4. bills-review" >&2
  echo "  5. friends-review" >&2
  printf "Enter selection [core-review]: " >&2

  local response
  IFS= read -r response < "$prompt_input"
  if [ -z "${response// }" ]; then
    printf '%s\n' "core-review"
    return
  fi

  case "$(printf '%s' "$response" | tr '[:upper:]' '[:lower:]')" in
    1)
      printf '%s\n' "all"
      ;;
    2)
      printf '%s\n' "core-review"
      ;;
    3)
      printf '%s\n' "lists-review"
      ;;
    4)
      printf '%s\n' "bills-review"
      ;;
    5)
      printf '%s\n' "friends-review"
      ;;
    *)
      printf '%s\n' "$response"
      ;;
  esac
}

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  echo "Loaded screenshot env file: $ENV_FILE"
fi

SCREENSHOT_LOGIN_EMAIL="${SCREENSHOT_LOGIN_EMAIL:-${MAESTRO_LOGIN_EMAIL:-${LOGIN_EMAIL:-}}}"
SCREENSHOT_LOGIN_PASSWORD="${SCREENSHOT_LOGIN_PASSWORD:-${MAESTRO_LOGIN_PASSWORD:-${LOGIN_PASSWORD:-}}}"

RAW_SELECTIONS=("$@")
if [ "${#RAW_SELECTIONS[@]}" -eq 0 ]; then
  if [ -t 0 ] || [ -r /dev/tty ]; then
    RAW_SELECTIONS=("$(prompt_for_flow_selection)")
  else
    RAW_SELECTIONS=("core-review")
  fi
fi

declare -a NORMALIZED_SELECTIONS=()
while IFS= read -r normalized_token; do
  NORMALIZED_SELECTIONS+=("$normalized_token")
done < <(normalize_selection_tokens "${RAW_SELECTIONS[@]}")

if [ "${#NORMALIZED_SELECTIONS[@]}" -eq 0 ]; then
  NORMALIZED_SELECTIONS=("core-review")
fi

EXPAND_ALL=false

for selection in "${NORMALIZED_SELECTIONS[@]}"; do
  if [ "$selection" = "help" ] || [ "$selection" = "--help" ] || [ "$selection" = "-h" ]; then
    print_flow_selection_help
    exit 0
  fi

  if [ "$selection" = "all" ]; then
    EXPAND_ALL=true
    continue
  fi

  if ! flow_path="$(resolve_flow_path "$selection")"; then
    echo "Unknown screenshot flow selection: $selection" >&2
    print_flow_selection_help >&2
    exit 1
  fi

  if flow_key_selected "$selection"; then
    continue
  fi

  SELECTED_FLOW_KEYS+=("$selection")
  SELECTED_FLOW_PATHS+=("$flow_path")
done

if [ "$EXPAND_ALL" = true ]; then
  for flow_key in "${FLOW_KEYS[@]}"; do
    if flow_key_selected "$flow_key"; then
      continue
    fi

    flow_path="$(resolve_flow_path "$flow_key")"
    SELECTED_FLOW_KEYS+=("$flow_key")
    SELECTED_FLOW_PATHS+=("$flow_path")
  done
fi

if [ "${#SELECTED_FLOW_PATHS[@]}" -eq 0 ]; then
  echo "No screenshot flows selected." >&2
  print_flow_selection_help >&2
  exit 1
fi

for flow_path in "${SELECTED_FLOW_PATHS[@]}"; do
  if [ ! -f "$ROOT_DIR/$flow_path" ]; then
    echo "Flow file not found: $flow_path" >&2
    exit 1
  fi
done

declare -a EXPECTED_SCREENSHOTS=()
REQUIRES_LOGIN=false

for flow_path in "${SELECTED_FLOW_PATHS[@]}"; do
  if grep -Eq '\$\{LOGIN_EMAIL\}|\$\{LOGIN_PASSWORD\}' "$ROOT_DIR/$flow_path"; then
    REQUIRES_LOGIN=true
  fi

  while IFS= read -r screenshot_name; do
    screenshot_name="$(printf '%s' "$screenshot_name" | sed -E "s/^[[:space:]]*//; s/[[:space:]]*$//; s/^[\"']|[\"']$//g")"
    case "$screenshot_name" in
      *.*)
        ;;
      *)
        screenshot_name="${screenshot_name}.png"
        ;;
    esac
    EXPECTED_SCREENSHOTS+=("$screenshot_name")
  done < <(
    sed -nE 's/^[[:space:]]*-[[:space:]]*takeScreenshot:[[:space:]]*(.+)[[:space:]]*$/\1/p' "$ROOT_DIR/$flow_path"
  )
done

EXPECTED_SCREENSHOTS_JSON="$(
  node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)));' "${EXPECTED_SCREENSHOTS[@]}"
)"

if [ "$REQUIRES_LOGIN" = "true" ]; then
  if [ -z "${SCREENSHOT_LOGIN_EMAIL:-}" ] || [ -z "${SCREENSHOT_LOGIN_PASSWORD:-}" ]; then
    echo "The selected screenshot flow(s) require credentials." >&2
    echo "Set SCREENSHOT_LOGIN_EMAIL and SCREENSHOT_LOGIN_PASSWORD in $ENV_FILE" >&2
    echo "or export them in your shell before running the script." >&2
    exit 1
  fi
fi

mkdir -p "$OUTPUT_DIR"

FLOW_KEYS_JSON="$(
  node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)));' "${SELECTED_FLOW_KEYS[@]}"
)"
FLOW_PATHS_JSON="$(
  node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)));' "${SELECTED_FLOW_PATHS[@]}"
)"

node -e '
const fs = require("node:fs");
const path = require("node:path");
const outputDir = process.argv[1];
const runName = process.argv[2];
const flowPaths = JSON.parse(process.argv[3]);
const flowKeys = JSON.parse(process.argv[4]);
const expectedScreenshots = JSON.parse(process.argv[5]);
const payload = {
  createdAt: new Date().toISOString(),
  expectedScreenshots,
  flowKey: flowKeys.length === 1 ? flowKeys[0] : null,
  flowKeys,
  flowPath: flowPaths.length === 1 ? flowPaths[0] : null,
  flowPaths,
  runName,
};

fs.writeFileSync(path.join(outputDir, "run.json"), `${JSON.stringify(payload, null, 2)}\n`);
' "$OUTPUT_DIR" "$RUN_NAME" "$FLOW_PATHS_JSON" "$FLOW_KEYS_JSON" "$EXPECTED_SCREENSHOTS_JSON"

echo "Running mobile screenshot review flow(s)"
echo "Output: $OUTPUT_DIR"
echo "Assumes your normal dev build is already open in the simulator."
for index in "${!SELECTED_FLOW_PATHS[@]}"; do
  echo "  - ${SELECTED_FLOW_KEYS[$index]} -> ${SELECTED_FLOW_PATHS[$index]}"
done

if [ "${SCREENSHOT_DRY_RUN:-0}" = "1" ]; then
  echo "Dry run enabled. Skipping Maestro execution."
  exit 0
fi

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

cd "$ROOT_DIR"
MAESTRO_ARGS=(test --test-output-dir "$OUTPUT_DIR")

if [ -n "${SCREENSHOT_LOGIN_EMAIL:-}" ]; then
  MAESTRO_ARGS+=(-e "LOGIN_EMAIL=$SCREENSHOT_LOGIN_EMAIL")
fi

if [ -n "${SCREENSHOT_LOGIN_PASSWORD:-}" ]; then
  MAESTRO_ARGS+=(-e "LOGIN_PASSWORD=$SCREENSHOT_LOGIN_PASSWORD")
fi

for flow_path in "${SELECTED_FLOW_PATHS[@]}"; do
  maestro "${MAESTRO_ARGS[@]}" "$flow_path"
done

echo "Saved screenshots to $OUTPUT_DIR"
