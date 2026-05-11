#!/usr/bin/env bash

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

load_mobile_local_dotenv() {
    local root_dir
    root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local dotenv_file="$root_dir/apps/mobile/.env"

    if [[ ! -f "$dotenv_file" ]]; then
        return
    fi

    set -a
    # shellcheck disable=SC1090
    source "$dotenv_file"
    set +a
}

load_food_tracker_env() {
    local requested_env="${1:-local}"
    local normalized_env
    normalized_env="$(normalize_food_tracker_env "$requested_env")"

    export FOOD_TRACKER_ENV="$normalized_env"

    if [[ "$normalized_env" == "local" ]]; then
        load_mobile_local_dotenv
    fi

    case "$normalized_env" in
        local)
            export FOOD_TRACKER_MARKETING_URL="${FOOD_TRACKER_MARKETING_URL:-${EXPO_PUBLIC_MARKETING_URL:-http://localhost:4173}}"
            export FOOD_TRACKER_APP_URL="${FOOD_TRACKER_APP_URL:-${EXPO_PUBLIC_APP_WEB_URL:-http://localhost:8081}}"
            export FOOD_TRACKER_ADMIN_URL="${FOOD_TRACKER_ADMIN_URL:-${EXPO_PUBLIC_ADMIN_URL:-http://localhost:5173}}"
            export FOOD_TRACKER_API_BASE_URL="${FOOD_TRACKER_API_BASE_URL:-${EXPO_PUBLIC_API_BASE_URL:-http://127.0.0.1:8090}}"
            export FOOD_TRACKER_POCKETBASE_URL="${FOOD_TRACKER_POCKETBASE_URL:-${EXPO_PUBLIC_POCKETBASE_URL:-http://127.0.0.1:8090}}"
            export FOOD_TRACKER_POSTHOG_HOST="${FOOD_TRACKER_POSTHOG_HOST:-${EXPO_PUBLIC_POSTHOG_HOST:-http://127.0.0.1:8090/api/analytics}}"
            export FOOD_TRACKER_IOS_APP_STORE_URL="${FOOD_TRACKER_IOS_APP_STORE_URL:-${EXPO_PUBLIC_IOS_APP_STORE_URL:-https://apps.apple.com/us/app/yummy-recs/id6761597807}}"
            export FOOD_TRACKER_APP_SCHEME="${FOOD_TRACKER_APP_SCHEME:-yummyrecs}"
            export FOOD_TRACKER_POCKETBASE_PORT="${FOOD_TRACKER_POCKETBASE_PORT:-8090}"
            export EXPO_PUBLIC_APP_ENV="${EXPO_PUBLIC_APP_ENV:-local}"
            export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-$FOOD_TRACKER_API_BASE_URL}"
            export EXPO_PUBLIC_POCKETBASE_URL="${EXPO_PUBLIC_POCKETBASE_URL:-$FOOD_TRACKER_POCKETBASE_URL}"
            export EXPO_PUBLIC_APP_WEB_URL="${EXPO_PUBLIC_APP_WEB_URL:-$FOOD_TRACKER_APP_URL}"
            export EXPO_PUBLIC_ADMIN_URL="${EXPO_PUBLIC_ADMIN_URL:-$FOOD_TRACKER_ADMIN_URL}"
            export EXPO_PUBLIC_IOS_APP_STORE_URL="${EXPO_PUBLIC_IOS_APP_STORE_URL:-$FOOD_TRACKER_IOS_APP_STORE_URL}"
            export EXPO_PUBLIC_POSTHOG_HOST="${EXPO_PUBLIC_POSTHOG_HOST:-$FOOD_TRACKER_POSTHOG_HOST}"
            export EXPO_PUBLIC_WEB_DISABLE_VISIT_MUTATIONS="${EXPO_PUBLIC_WEB_DISABLE_VISIT_MUTATIONS:-false}"
            export EXPO_PUBLIC_WEB_DISABLE_QUICKTRACK_MUTATIONS="${EXPO_PUBLIC_WEB_DISABLE_QUICKTRACK_MUTATIONS:-false}"
            export EXPO_PUBLIC_BETA_ADMIN_ONLY="${EXPO_PUBLIC_BETA_ADMIN_ONLY:-false}"
            export VITE_APP_ENV="${VITE_APP_ENV:-local}"
            export VITE_API_URL="${VITE_API_URL:-$FOOD_TRACKER_API_BASE_URL}"
            export APP_OPEN_URL="${FOOD_TRACKER_APP_URL}/"
            export IOS_APP_STORE_URL="$FOOD_TRACKER_IOS_APP_STORE_URL"
            ;;
        beta)
            export FOOD_TRACKER_MARKETING_URL="https://beta.yummyrecs.com"
            export FOOD_TRACKER_APP_URL="https://beta.app.yummyrecs.com"
            export FOOD_TRACKER_ADMIN_URL="https://beta.admin.yummyrecs.com"
            export FOOD_TRACKER_API_BASE_URL="$FOOD_TRACKER_APP_URL"
            export FOOD_TRACKER_POCKETBASE_URL="$FOOD_TRACKER_APP_URL"
            export FOOD_TRACKER_POSTHOG_HOST="${FOOD_TRACKER_APP_URL}/api/analytics"
            export FOOD_TRACKER_IOS_APP_STORE_URL="https://apps.apple.com/us/app/yummy-recs/id6761597807"
            export FOOD_TRACKER_APP_SCHEME="yummyrecs-preview"
            export FOOD_TRACKER_POCKETBASE_PORT="8091"
            export EXPO_PUBLIC_APP_ENV="beta"
            export EXPO_PUBLIC_API_BASE_URL="$FOOD_TRACKER_API_BASE_URL"
            export EXPO_PUBLIC_POCKETBASE_URL="$FOOD_TRACKER_POCKETBASE_URL"
            export EXPO_PUBLIC_APP_WEB_URL="$FOOD_TRACKER_APP_URL"
            export EXPO_PUBLIC_ADMIN_URL="$FOOD_TRACKER_ADMIN_URL"
            export EXPO_PUBLIC_IOS_APP_STORE_URL="$FOOD_TRACKER_IOS_APP_STORE_URL"
            export EXPO_PUBLIC_WEB_DISABLE_VISIT_MUTATIONS="true"
            export EXPO_PUBLIC_WEB_DISABLE_QUICKTRACK_MUTATIONS="true"
            export EXPO_PUBLIC_BETA_ADMIN_ONLY="true"
            export VITE_APP_ENV="beta"
            export VITE_API_URL="$FOOD_TRACKER_ADMIN_URL"
            export APP_OPEN_URL="${FOOD_TRACKER_APP_URL}/"
            export IOS_APP_STORE_URL="$FOOD_TRACKER_IOS_APP_STORE_URL"
            ;;
        production)
            export FOOD_TRACKER_MARKETING_URL="https://yummyrecs.com"
            export FOOD_TRACKER_APP_URL="https://app.yummyrecs.com"
            export FOOD_TRACKER_ADMIN_URL="https://admin.yummyrecs.com"
            export FOOD_TRACKER_API_BASE_URL="$FOOD_TRACKER_APP_URL"
            export FOOD_TRACKER_POCKETBASE_URL="$FOOD_TRACKER_APP_URL"
            export FOOD_TRACKER_POSTHOG_HOST="${FOOD_TRACKER_APP_URL}/api/analytics"
            export FOOD_TRACKER_IOS_APP_STORE_URL="https://apps.apple.com/us/app/yummy-recs/id6761597807"
            export FOOD_TRACKER_APP_SCHEME="yummyrecs"
            export FOOD_TRACKER_POCKETBASE_PORT="8090"
            export EXPO_PUBLIC_APP_ENV="production"
            export EXPO_PUBLIC_API_BASE_URL="$FOOD_TRACKER_API_BASE_URL"
            export EXPO_PUBLIC_POCKETBASE_URL="$FOOD_TRACKER_POCKETBASE_URL"
            export EXPO_PUBLIC_APP_WEB_URL="$FOOD_TRACKER_APP_URL"
            export EXPO_PUBLIC_ADMIN_URL="$FOOD_TRACKER_ADMIN_URL"
            export EXPO_PUBLIC_IOS_APP_STORE_URL="$FOOD_TRACKER_IOS_APP_STORE_URL"
            export EXPO_PUBLIC_WEB_DISABLE_VISIT_MUTATIONS="true"
            export EXPO_PUBLIC_WEB_DISABLE_QUICKTRACK_MUTATIONS="true"
            export EXPO_PUBLIC_BETA_ADMIN_ONLY="false"
            export VITE_APP_ENV="production"
            export VITE_API_URL="$FOOD_TRACKER_ADMIN_URL"
            export APP_OPEN_URL="${FOOD_TRACKER_APP_URL}/"
            export IOS_APP_STORE_URL="$FOOD_TRACKER_IOS_APP_STORE_URL"
            ;;
    esac
}
