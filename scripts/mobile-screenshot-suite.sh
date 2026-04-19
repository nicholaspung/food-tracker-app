#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_NAME="${RUN_NAME:-$(date +%Y%m%d-%H%M%S)}"
OUTPUT_DIR="$ROOT_DIR/apps/mobile/e2e/artifacts/$RUN_NAME"
DEBUG_OUTPUT_DIR="$OUTPUT_DIR/debug"
ENV_FILE="${SCREENSHOT_ENV_FILE:-$ROOT_DIR/apps/mobile/e2e/.env.local}"

# Reuse the app environment defaults so screenshot metadata matches the selected target.
# This only fills unset endpoint variables; explicit overrides still win.
source "$ROOT_DIR/scripts/app-env.sh"

FLOW_KEYS=("sign-in-review" "profile-review" "lists-review" "bills-review" "friends-review" "add-visit-review" "add-food-product-review" "notes-review" "sign-out-review")
declare -a SELECTED_FLOW_KEYS=()
declare -a SELECTED_FLOW_PATHS=()
declare -a RAW_SELECTIONS=()

normalize_optional_app_env() {
  local raw_value="${1:-}"
  local normalized_value

  normalized_value="$(printf '%s' "$raw_value" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

  case "$normalized_value" in
    "")
      return 1
      ;;
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
      return 1
      ;;
  esac
}

populate_environment_defaults() {
  local target_env="${1:-}"
  if [ -z "$target_env" ]; then
    return
  fi

  local custom_api_base_url="${EXPO_PUBLIC_API_BASE_URL:-}"
  local custom_pocketbase_url="${EXPO_PUBLIC_POCKETBASE_URL:-}"
  local custom_app_web_url="${EXPO_PUBLIC_APP_WEB_URL:-}"
  local custom_admin_url="${EXPO_PUBLIC_ADMIN_URL:-}"
  local custom_marketing_url="${EXPO_PUBLIC_MARKETING_URL:-}"
  local custom_posthog_host="${EXPO_PUBLIC_POSTHOG_HOST:-}"

  load_food_tracker_env "$target_env"

  if [ -n "$custom_api_base_url" ]; then
    export EXPO_PUBLIC_API_BASE_URL="$custom_api_base_url"
  fi
  if [ -n "$custom_pocketbase_url" ]; then
    export EXPO_PUBLIC_POCKETBASE_URL="$custom_pocketbase_url"
  fi
  if [ -n "$custom_app_web_url" ]; then
    export EXPO_PUBLIC_APP_WEB_URL="$custom_app_web_url"
  fi
  if [ -n "$custom_admin_url" ]; then
    export EXPO_PUBLIC_ADMIN_URL="$custom_admin_url"
  fi
  if [ -n "$custom_marketing_url" ]; then
    export EXPO_PUBLIC_MARKETING_URL="$custom_marketing_url"
  fi
  if [ -n "$custom_posthog_host" ]; then
    export EXPO_PUBLIC_POSTHOG_HOST="$custom_posthog_host"
  fi
}

resolve_flow_path() {
  case "$1" in
    sign-in-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/sign-in-review.yaml"
      ;;
    profile-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/profile-review.yaml"
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
    add-visit-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/add-visit-review.yaml"
      ;;
    add-food-product-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/add-food-product-review.yaml"
      ;;
    notes-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/notes-review.yaml"
      ;;
    sign-out-review)
      printf '%s\n' "apps/mobile/e2e/maestro/flows/sign-out-review.yaml"
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
  - sign-in-review
  - profile-review
  - lists-review
  - bills-review
  - friends-review
  - add-visit-review
  - add-food-product-review
  - notes-review
  - sign-out-review

You can select multiple flows by separating values with commas or spaces.
Examples:
  pnpm mobile:screenshots --env beta -- all
  pnpm mobile:screenshots -- all
  pnpm mobile:screenshots -- sign-in-review profile-review lists-review bills-review friends-review add-visit-review add-food-product-review notes-review sign-out-review
  pnpm mobile:screenshots -- sign-in-review,profile-review

Optional environment metadata:
  --env <local|beta|production>

Environment can also be provided by:
  SCREENSHOT_APP_ENV
  EXPO_PUBLIC_APP_ENV
  FOOD_TRACKER_ENV
EOF
}

normalize_selection_tokens() {
  local normalized_token
  local raw_value
  for raw_value in "$@"; do
    raw_value="${raw_value//,/ }"
    # shellcheck disable=SC2086
    for normalized_token in $raw_value; do
      normalized_token="$(printf '%s' "$normalized_token" | tr '[:upper:]' '[:lower:]')"
      case "$normalized_token" in
        --)
          continue
          ;;
        1)
          normalized_token="all"
          ;;
        2)
          normalized_token="sign-in-review"
          ;;
        3)
          normalized_token="profile-review"
          ;;
        4)
          normalized_token="lists-review"
          ;;
        5)
          normalized_token="bills-review"
          ;;
        6)
          normalized_token="friends-review"
          ;;
        7)
          normalized_token="add-visit-review"
          ;;
        8)
          normalized_token="add-food-product-review"
          ;;
        9)
          normalized_token="notes-review"
          ;;
        10)
          normalized_token="sign-out-review"
          ;;
      esac
      if [ -n "$normalized_token" ]; then
        printf '%s\n' "$normalized_token"
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
  echo "  2. sign-in-review" >&2
  echo "  3. profile-review" >&2
  echo "  4. lists-review" >&2
  echo "  5. bills-review" >&2
  echo "  6. friends-review" >&2
  echo "  7. add-visit-review" >&2
  echo "  8. add-food-product-review" >&2
  echo "  9. notes-review" >&2
  echo "  10. sign-out-review" >&2
  printf "Enter selection [all]: " >&2

  local response
  IFS= read -r response < "$prompt_input"
  if [ -z "${response// }" ]; then
    printf '%s\n' "all"
    return
  fi

  printf '%s\n' "$response"
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
REQUESTED_SCREENSHOT_ENV_RAW=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --env. Use local, beta, or production." >&2
        exit 1
      fi
      REQUESTED_SCREENSHOT_ENV_RAW="$2"
      shift 2
      ;;
    --env=*)
      REQUESTED_SCREENSHOT_ENV_RAW="${1#*=}"
      shift
      ;;
    *)
      RAW_SELECTIONS+=("$1")
      shift
      ;;
  esac
done

SCREENSHOT_APP_ENV_SOURCE="unknown"
SCREENSHOT_APP_ENV_RAW=""

if [ -n "$REQUESTED_SCREENSHOT_ENV_RAW" ]; then
  SCREENSHOT_APP_ENV_RAW="$REQUESTED_SCREENSHOT_ENV_RAW"
  SCREENSHOT_APP_ENV_SOURCE="cli"
elif [ -n "${SCREENSHOT_APP_ENV:-}" ]; then
  SCREENSHOT_APP_ENV_RAW="$SCREENSHOT_APP_ENV"
  SCREENSHOT_APP_ENV_SOURCE="SCREENSHOT_APP_ENV"
elif [ -n "${EXPO_PUBLIC_APP_ENV:-}" ]; then
  SCREENSHOT_APP_ENV_RAW="$EXPO_PUBLIC_APP_ENV"
  SCREENSHOT_APP_ENV_SOURCE="EXPO_PUBLIC_APP_ENV"
elif [ -n "${FOOD_TRACKER_ENV:-}" ]; then
  SCREENSHOT_APP_ENV_RAW="$FOOD_TRACKER_ENV"
  SCREENSHOT_APP_ENV_SOURCE="FOOD_TRACKER_ENV"
fi

SCREENSHOT_APP_ENV=""
if [ -n "$SCREENSHOT_APP_ENV_RAW" ]; then
  if ! SCREENSHOT_APP_ENV="$(normalize_optional_app_env "$SCREENSHOT_APP_ENV_RAW")"; then
    echo "Invalid screenshot environment: $SCREENSHOT_APP_ENV_RAW" >&2
    echo "Use local, beta, or production." >&2
    exit 1
  fi
  populate_environment_defaults "$SCREENSHOT_APP_ENV"
fi
export SCREENSHOT_APP_ENV
export SCREENSHOT_APP_ENV_SOURCE

if [ "${#RAW_SELECTIONS[@]}" -eq 0 ]; then
  if [ -t 0 ] || [ -r /dev/tty ]; then
    RAW_SELECTIONS=("$(prompt_for_flow_selection)")
  else
    RAW_SELECTIONS=("all")
  fi
fi

declare -a NORMALIZED_SELECTIONS=()
while IFS= read -r normalized_token; do
  NORMALIZED_SELECTIONS+=("$normalized_token")
done < <(normalize_selection_tokens "${RAW_SELECTIONS[@]}")

if [ "${#NORMALIZED_SELECTIONS[@]}" -eq 0 ]; then
  NORMALIZED_SELECTIONS=("all")
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
SCREENSHOT_METADATA_JSON="$(
  node -e '
const valueOrNull = (value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
};

process.stdout.write(
  JSON.stringify({
    endpoints: {
      adminUrl: valueOrNull(process.env.EXPO_PUBLIC_ADMIN_URL),
      apiBaseUrl: valueOrNull(process.env.EXPO_PUBLIC_API_BASE_URL),
      appWebUrl: valueOrNull(process.env.EXPO_PUBLIC_APP_WEB_URL),
      marketingUrl: valueOrNull(process.env.EXPO_PUBLIC_MARKETING_URL),
      pocketbaseUrl: valueOrNull(process.env.EXPO_PUBLIC_POCKETBASE_URL),
      posthogHost: valueOrNull(process.env.EXPO_PUBLIC_POSTHOG_HOST),
    },
    environment: valueOrNull(process.env.SCREENSHOT_APP_ENV),
    environmentSource: valueOrNull(process.env.SCREENSHOT_APP_ENV_SOURCE),
  }),
);
'
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
mkdir -p "$DEBUG_OUTPUT_DIR"

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
const screenshotMetadata = JSON.parse(process.argv[6]);
const payload = {
  createdAt: new Date().toISOString(),
  endpoints: screenshotMetadata.endpoints ?? {},
  environment: screenshotMetadata.environment ?? null,
  environmentSource: screenshotMetadata.environmentSource ?? null,
  expectedScreenshots,
  flowKey: flowKeys.length === 1 ? flowKeys[0] : null,
  flowKeys,
  flowPath: flowPaths.length === 1 ? flowPaths[0] : null,
  flowPaths,
  runName,
};

fs.writeFileSync(path.join(outputDir, "run.json"), `${JSON.stringify(payload, null, 2)}\n`);
' "$OUTPUT_DIR" "$RUN_NAME" "$FLOW_PATHS_JSON" "$FLOW_KEYS_JSON" "$EXPECTED_SCREENSHOTS_JSON" "$SCREENSHOT_METADATA_JSON"

echo "Running mobile screenshot review flow(s)"
echo "Output: $OUTPUT_DIR"
echo "Assumes your normal dev build is already open in the simulator."
if [ -n "$SCREENSHOT_APP_ENV" ]; then
  echo "Environment: $SCREENSHOT_APP_ENV ($SCREENSHOT_APP_ENV_SOURCE)"
else
  echo "Environment: unclassified"
fi
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
MAESTRO_ARGS=(test --test-output-dir "$OUTPUT_DIR" --debug-output "$DEBUG_OUTPUT_DIR" --flatten-debug-output)

if [ -n "$SCREENSHOT_APP_ENV" ]; then
  MAESTRO_ARGS+=(-e "SCREENSHOT_APP_ENV=$SCREENSHOT_APP_ENV")
fi

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
