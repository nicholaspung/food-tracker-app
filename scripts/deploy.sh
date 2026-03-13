#!/bin/bash
# Deployment script for Yummy Recs
# Supports beta and production environments with separate marketing, app, admin, and PocketBase surfaces.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/app-env.sh"
ENVIRONMENT="$(normalize_food_tracker_env "${1:-production}")"
if [[ "$ENVIRONMENT" != "beta" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}ERROR: Invalid environment. Use 'beta' or 'production'${NC}"
    echo "Usage: $0 [beta|production]"
    exit 1
fi
load_food_tracker_env "$ENVIRONMENT"

APP_DIR="/opt/food-tracker-app"
MARKETING_SOURCE_DIR="$APP_DIR/apps/marketing/dist"
APP_WEB_SOURCE_DIR="$APP_DIR/apps/mobile/web-dist"
ADMIN_SOURCE_DIR="$APP_DIR/apps/admin/dist"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="${LOG_DIR}/deploy-${ENVIRONMENT}.log"
LOCK_FILE="/tmp/food-tracker-deploy-${ENVIRONMENT}.lock"
BACKUP_DIR="/opt/food-tracker-backups/${ENVIRONMENT}"
MAX_BACKUPS=5
DEFAULT_PNPM_PACKAGE_MANAGER="pnpm@10.32.1"
PNPM_PACKAGE_MANAGER=""
PNPM_CMD=()

if [[ "$ENVIRONMENT" == "beta" ]]; then
    POCKETBASE_PORT="$FOOD_TRACKER_POCKETBASE_PORT"
    POCKETBASE_CONTAINER="pocketbase_beta"
    POCKETBASE_SERVICE="pocketbase_beta"
    COMPOSE_FILE="docker-compose.beta.yml"
    POCKETBASE_DOMAIN="${FOOD_TRACKER_APP_URL#https://}"
    MARKETING_DOMAIN="${FOOD_TRACKER_MARKETING_URL#https://}"
    APP_DOMAIN="${FOOD_TRACKER_APP_URL#https://}"
    ADMIN_DOMAIN="${FOOD_TRACKER_ADMIN_URL#https://}"
    MARKETING_BUILD_DIR="marketing_build_beta"
    APP_BUILD_DIR="app_build_beta"
    ADMIN_BUILD_DIR="admin_build_beta"
else
    POCKETBASE_PORT="$FOOD_TRACKER_POCKETBASE_PORT"
    POCKETBASE_CONTAINER="pocketbase"
    POCKETBASE_SERVICE="pocketbase"
    COMPOSE_FILE="docker-compose.yml"
    POCKETBASE_DOMAIN="${FOOD_TRACKER_APP_URL#https://}"
    MARKETING_DOMAIN="${FOOD_TRACKER_MARKETING_URL#https://}"
    APP_DOMAIN="${FOOD_TRACKER_APP_URL#https://}"
    ADMIN_DOMAIN="${FOOD_TRACKER_ADMIN_URL#https://}"
    MARKETING_BUILD_DIR="marketing_build"
    APP_BUILD_DIR="app_build"
    ADMIN_BUILD_DIR="admin_build"
fi

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $*" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE" >&2
}

step() {
    echo ""
    echo -e "${BLUE}==>${NC} $*"
}

run_sudo() {
    local sudo_output
    local exit_code

    if sudo_output=$(sudo -n "$@" 2>&1); then
        if [ -n "$sudo_output" ]; then
            printf '%s\n' "$sudo_output"
        fi
        return 0
    fi

    exit_code=$?

    if printf '%s\n' "$sudo_output" | grep -qiE 'a password is required|authentication failed|incorrect authentication attempts|sorry, try again'; then
        if [ -n "${SUDO_PASSWORD:-}" ]; then
            printf '%s\n' "$SUDO_PASSWORD" | sudo -S -p '' "$@"
            return $?
        fi

        error "This deployment requires sudo for: $*"
        error "Run 'sudo bash $APP_DIR/scripts/setup-deploy-sudo.sh $USER' on the VPS, or add SUDO_PASSWORD to the GitHub environment secrets."
        exit 1
    fi

    if [ -n "$sudo_output" ]; then
        printf '%s\n' "$sudo_output" >&2
    fi

    return $exit_code
}

caddy_config_has_domain() {
    local caddy_config="$1"
    local domain="$2"

    awk -v domain="$domain" '$1 == domain && $2 == "{" { found = 1 } END { exit(found ? 0 : 1) }' "$caddy_config"
}

validate_caddy_config() {
    local config_path="$1"
    local validation_output
    validation_output=$(mktemp)

    if run_sudo caddy validate --config "$config_path" --adapter caddyfile >"$validation_output" 2>&1; then
        rm -f "$validation_output"
        return 0
    fi

    cat "$validation_output" | tee -a "$LOG_FILE" >&2
    rm -f "$validation_output"
    return 1
}

ensure_live_caddy_config() {
    local caddy_config="/etc/caddy/Caddyfile"
    local repo_caddy_config="$APP_DIR/Caddyfile"
    local missing_domains=()
    local domain

    if [ ! -r "$caddy_config" ]; then
        warn "Cannot read $caddy_config. Skipping domain presence checks."
        return
    fi

    for domain in "$MARKETING_DOMAIN" "$APP_DOMAIN" "$ADMIN_DOMAIN"; do
        if ! caddy_config_has_domain "$caddy_config" "$domain"; then
            missing_domains+=("$domain")
        fi
    done

    if [ "${#missing_domains[@]}" -eq 0 ]; then
        return
    fi

    warn "Live Caddy config is missing environment domains: ${missing_domains[*]}"

    if [ ! -r "$repo_caddy_config" ]; then
        error "Repo Caddyfile is not readable: $repo_caddy_config"
        exit 1
    fi

    for domain in "$MARKETING_DOMAIN" "$APP_DOMAIN" "$ADMIN_DOMAIN"; do
        if ! caddy_config_has_domain "$repo_caddy_config" "$domain"; then
            error "Repo Caddyfile is also missing domain '$domain': $repo_caddy_config"
            error "Update $repo_caddy_config before deploying this environment."
            exit 1
        fi
    done

    step "Syncing live Caddy config..."

    if ! validate_caddy_config "$repo_caddy_config"; then
        error "Repo Caddyfile failed validation: $repo_caddy_config"
        error "Fix the checked-in Caddyfile before deploying."
        exit 1
    fi

    run_sudo cp "$repo_caddy_config" "$caddy_config"

    if ! run_sudo systemctl reload caddy; then
        error "Failed to reload Caddy after updating $caddy_config"
        error "Check logs: sudo journalctl -u caddy -n 50"
        exit 1
    fi

    for domain in "$MARKETING_DOMAIN" "$APP_DOMAIN" "$ADMIN_DOMAIN"; do
        if ! caddy_config_has_domain "$caddy_config" "$domain"; then
            error "Domain '$domain' is still missing from $caddy_config after sync"
            exit 1
        fi
    done

    log "Live Caddy config synchronized ✓"
}

configure_package_manager() {
    local detected_package_manager=""

    if [ -f "$APP_DIR/package.json" ]; then
        detected_package_manager=$(node -p "require('$APP_DIR/package.json').packageManager || ''" 2>/dev/null || true)
    fi

    if [ -n "$detected_package_manager" ]; then
        PNPM_PACKAGE_MANAGER="$detected_package_manager"
    else
        PNPM_PACKAGE_MANAGER="$DEFAULT_PNPM_PACKAGE_MANAGER"
    fi

    if command -v pnpm &> /dev/null; then
        PNPM_CMD=(pnpm)
        return
    fi

    if ! command -v corepack &> /dev/null; then
        error "pnpm is unavailable and Corepack is not installed"
        exit 1
    fi

    if ! corepack prepare "$PNPM_PACKAGE_MANAGER" --activate > /dev/null 2>&1; then
        warn "Could not activate $PNPM_PACKAGE_MANAGER globally; using Corepack shim for this deploy"
    fi

    PNPM_CMD=(corepack pnpm)
}

run_pnpm() {
    if [ "${#PNPM_CMD[@]}" -eq 0 ]; then
        configure_package_manager
    fi

    "${PNPM_CMD[@]}" "$@"
}

USER_CANCELLED=false
ROLLBACK_REQUIRED=false

site_keys() {
    echo "marketing app admin"
}

site_label() {
    case "$1" in
        marketing) echo "marketing site" ;;
        app) echo "app web" ;;
        admin) echo "admin site" ;;
        *)
            error "Unknown site key: $1"
            exit 1
            ;;
    esac
}

site_source_dir() {
    case "$1" in
        marketing) echo "$MARKETING_SOURCE_DIR" ;;
        app) echo "$APP_WEB_SOURCE_DIR" ;;
        admin) echo "$ADMIN_SOURCE_DIR" ;;
        *)
            error "Unknown site key: $1"
            exit 1
            ;;
    esac
}

site_build_dir() {
    case "$1" in
        marketing) echo "$MARKETING_BUILD_DIR" ;;
        app) echo "$APP_BUILD_DIR" ;;
        admin) echo "$ADMIN_BUILD_DIR" ;;
        *)
            error "Unknown site key: $1"
            exit 1
            ;;
    esac
}

site_domain() {
    case "$1" in
        marketing) echo "$MARKETING_DOMAIN" ;;
        app) echo "$APP_DOMAIN" ;;
        admin) echo "$ADMIN_DOMAIN" ;;
        *)
            error "Unknown site key: $1"
            exit 1
            ;;
    esac
}

validate_site_source() {
    local site_key="$1"
    local source_dir
    local site_name

    source_dir=$(site_source_dir "$site_key")
    site_name=$(site_label "$site_key")

    if [ ! -d "$source_dir" ]; then
        error "The ${site_name} source directory is missing: $source_dir"
        exit 1
    fi

    case "$site_key" in
        marketing)
            for required_file in index.html privacy.html terms.html contact.html styles.css; do
                if [ ! -f "$source_dir/$required_file" ]; then
                    error "The ${site_name} asset is missing: $source_dir/$required_file"
                    exit 1
                fi
            done
            ;;
        app|admin)
            if [ ! -f "$source_dir/index.html" ]; then
                error "The ${site_name} build is missing index.html: $source_dir/index.html"
                exit 1
            fi
            ;;
    esac

    log "$(tr '[:lower:]' '[:upper:]' <<< "${site_name:0:1}")${site_name:1} assets verified ✓ ($(du -sh "$source_dir" | cut -f1))"
}

handle_interrupt() {
    echo ""
    warn "Deployment interrupted by user (CTRL+C)"
    USER_CANCELLED=true

    echo -n "Do you want to rollback the deployment? (y/N): "
    read -t 10 -r response || response="n"

    if [[ "$response" =~ ^[Yy]$ ]]; then
        warn "User requested rollback..."
        rollback
    else
        warn "Skipping rollback. Cleaning up and exiting..."
        rm -f "$LOCK_FILE"
        error "Deployment cancelled by user. System may be in an inconsistent state."
        exit 130
    fi
}

cleanup() {
    local exit_code=$?

    if [ "$USER_CANCELLED" = true ]; then
        return
    fi

    if [ $exit_code -ne 0 ]; then
        error "Deployment failed with exit code $exit_code"
        if [ "$ROLLBACK_REQUIRED" = true ]; then
            rollback
        else
            warn "Skipping rollback because no deploy mutations were applied yet"
        fi
    fi

    rm -f "$LOCK_FILE"
    exit $exit_code
}

rollback() {
    warn "Initiating rollback for $ENVIRONMENT environment..."

    cd "$APP_DIR"

    local had_static_rollback=false
    local site_key
    for site_key in $(site_keys); do
        local build_dir
        build_dir=$(site_build_dir "$site_key")
        if [ -d "${build_dir}_old" ]; then
            log "Rolling back $(site_label "$site_key")..."
            rm -rf "${build_dir}_new" 2>/dev/null || true
            rm -rf "$build_dir" 2>/dev/null || true
            mv "${build_dir}_old" "$build_dir"
            had_static_rollback=true
        fi
    done

    if [ "$had_static_rollback" = true ]; then
        run_sudo systemctl reload caddy
        log "Static sites rolled back successfully"
    fi

    if [ -f "$BACKUP_DIR/latest/$COMPOSE_FILE" ]; then
        log "Rolling back PocketBase container..."
        docker compose -f "$COMPOSE_FILE" down "$POCKETBASE_SERVICE"
        cp "$BACKUP_DIR/latest/$COMPOSE_FILE" "$APP_DIR/$COMPOSE_FILE"
        docker compose -f "$COMPOSE_FILE" up -d "$POCKETBASE_SERVICE"
        log "PocketBase rolled back successfully"
    fi

    error "Rollback complete. System restored to previous state."
}

trap cleanup EXIT TERM
trap handle_interrupt INT

preflight_checks() {
    step "Running pre-flight checks..."

    if [ -f "$LOCK_FILE" ]; then
        error "Deployment already in progress (lock file exists: $LOCK_FILE)"
        error "If no deployment is running, remove the lock file manually"
        exit 1
    fi

    echo $$ > "$LOCK_FILE"

    for cmd in git docker curl systemctl node corepack; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done

    configure_package_manager
    local pnpm_version
    if ! pnpm_version=$(run_pnpm --version 2>/dev/null); then
        error "Failed to initialize $PNPM_PACKAGE_MANAGER via Corepack"
        exit 1
    fi
    log "Package manager ready ✓ ($pnpm_version)"

    if ! docker compose version &> /dev/null; then
        error "Docker Compose not found (requires Docker Compose V2)"
        exit 1
    fi

    if [ ! -d "$APP_DIR" ]; then
        error "App directory does not exist: $APP_DIR"
        exit 1
    fi

    local available_space_kb
    local available_space_mb
    available_space_kb=$(df "$APP_DIR" | awk 'NR==2 {print $4}')
    available_space_mb=$((available_space_kb / 1024))
    if [ "$available_space_mb" -lt 1000 ]; then
        error "Insufficient disk space. Required: 1GB, Available: ${available_space_mb}MB"
        exit 1
    fi

    if ! systemctl is-active --quiet caddy; then
        error "Caddy is not running"
        exit 1
    fi

    ensure_live_caddy_config

    if ! docker ps | grep -q "$POCKETBASE_CONTAINER"; then
        warn "PocketBase container ($POCKETBASE_CONTAINER) is not running"
        log "Attempting to start PocketBase container..."

        cd "$APP_DIR"
        if docker compose -f "$COMPOSE_FILE" up -d "$POCKETBASE_SERVICE"; then
            log "PocketBase container started successfully"
            sleep 3
        else
            error "Failed to start PocketBase container"
            exit 1
        fi
    fi

    log "Pre-flight checks passed for $ENVIRONMENT environment ✓"
}

create_backup() {
    step "Creating backup before deployment ($ENVIRONMENT)..."

    local backup_timestamp
    local backup_path
    backup_timestamp=$(date +'%Y%m%d_%H%M%S')
    backup_path="$BACKUP_DIR/$backup_timestamp"

    if [ ! -d "$BACKUP_DIR" ]; then
        run_sudo mkdir -p "$BACKUP_DIR"
        run_sudo chown -R "$USER:$USER" /opt/food-tracker-backups
        run_sudo chmod 755 /opt/food-tracker-backups
    fi

    mkdir -p "$backup_path"

    local site_key
    for site_key in $(site_keys); do
        local build_dir
        build_dir=$(site_build_dir "$site_key")
        if [ -d "$APP_DIR/$build_dir" ]; then
            cp -r "$APP_DIR/$build_dir" "$backup_path/"
            log "Backed up $(site_label "$site_key") to $backup_path/$build_dir"
        fi
    done

    if [ -f "$APP_DIR/$COMPOSE_FILE" ]; then
        cp "$APP_DIR/$COMPOSE_FILE" "$backup_path/"
    fi

    local pb_data_dir="backend/pb_data_${ENVIRONMENT}"
    if [ -d "$APP_DIR/$pb_data_dir" ]; then
        tar -czf "$backup_path/pb_data_backup.tar.gz" -C "$APP_DIR/backend" "pb_data_${ENVIRONMENT}"
        log "PocketBase data backed up to $backup_path/pb_data_backup.tar.gz"
    fi

    rm -f "$BACKUP_DIR/latest"
    ln -s "$backup_path" "$BACKUP_DIR/latest"

    local backup_count
    backup_count=$(ls -1t "$BACKUP_DIR" | grep -E '^[0-9]{8}_[0-9]{6}$' | wc -l)
    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        log "Cleaning up old backups (keeping latest $MAX_BACKUPS)..."
        ls -1t "$BACKUP_DIR" | grep -E '^[0-9]{8}_[0-9]{6}$' | tail -n +$((MAX_BACKUPS + 1)) | while read -r old_backup; do
            rm -rf "$BACKUP_DIR/$old_backup"
            log "Removed old backup: $old_backup"
        done
    fi

    log "Backup created successfully ✓"
}

update_source_code() {
    step "Updating source code from Git..."

    cd "$APP_DIR"
    git fetch origin

    local current_branch
    local old_commit
    local new_commit
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    old_commit=$(git rev-parse HEAD)
    log "Current branch: $current_branch"

    if ! git diff-index --quiet HEAD --; then
        warn "Local changes detected on server. Discarding them..."
        git reset --hard HEAD
        git clean -fd
        log "Local changes discarded"
    fi

    if ! git reset --hard "origin/$current_branch"; then
        error "Git reset failed. Check network or branch existence."
        exit 1
    fi

    new_commit=$(git rev-parse HEAD)
    if [ "$old_commit" = "$new_commit" ]; then
        warn "No new commits. Source code is already up to date."
    else
        log "Updated from $old_commit to $new_commit"
    fi

    log "Source code updated ✓"
}

install_workspace_dependencies() {
    step "Installing workspace dependencies..."

    cd "$APP_DIR"
    run_pnpm install --frozen-lockfile

    log "Workspace dependencies installed ✓"
}

build_web_surfaces() {
    step "Building web surfaces..."

    cd "$APP_DIR"

    run_pnpm --filter @food-tracker/admin build
    run_pnpm --filter @food-tracker/mobile web:build

    log "Web surfaces built ✓"
}

prepare_static_sites() {
    step "Preparing static site assets..."

    local site_key
    for site_key in $(site_keys); do
        validate_site_source "$site_key"
    done
}

deploy_static_sites() {
    step "Deploying static sites with blue-green strategy ($ENVIRONMENT)..."

    cd "$APP_DIR"
    ROLLBACK_REQUIRED=true

    local site_key
    for site_key in $(site_keys); do
        local source_dir
        local build_dir
        local site_name

        source_dir=$(site_source_dir "$site_key")
        build_dir=$(site_build_dir "$site_key")
        site_name=$(site_label "$site_key")

        rm -rf "${build_dir}_new"
        if [ "$site_key" = "marketing" ]; then
            APP_OPEN_URL="$APP_OPEN_URL" bash "$APP_DIR/scripts/prepare-marketing.sh" "$source_dir" "${build_dir}_new"
        else
            cp -r "$source_dir" "${build_dir}_new"
        fi

        if [ ! -d "${build_dir}_new" ] || [ ! -f "${build_dir}_new/index.html" ]; then
            error "Failed to copy the ${site_name} build to ${build_dir}_new"
            exit 1
        fi

        if [ -d "$build_dir" ]; then
            rm -rf "${build_dir}_old"
            mv "$build_dir" "${build_dir}_old"
            log "Current ${site_name} build moved to ${build_dir}_old"
        fi

        mv "${build_dir}_new" "$build_dir"
        log "New ${site_name} build moved to $build_dir"
    done

    log "Static sites deployed ✓"
}

configure_backend() {
    step "Configuring backend environment variables ($ENVIRONMENT)..."

    cd "$APP_DIR/backend"

    local env_file_storage="/opt/food-tracker-secrets/${ENVIRONMENT}/.env"
    if [ ! -d "/opt/food-tracker-secrets/${ENVIRONMENT}" ]; then
        if mkdir -p "/opt/food-tracker-secrets/${ENVIRONMENT}" 2>/dev/null; then
            chmod 700 /opt/food-tracker-secrets
            chmod 700 "/opt/food-tracker-secrets/${ENVIRONMENT}"
            log "Created secrets directory without sudo"
        else
            run_sudo mkdir -p "/opt/food-tracker-secrets/${ENVIRONMENT}"
            run_sudo chown -R "$USER:$USER" /opt/food-tracker-secrets
            run_sudo chmod 700 /opt/food-tracker-secrets
            run_sudo chmod 700 "/opt/food-tracker-secrets/${ENVIRONMENT}"
            log "Created secrets directory with sudo"
        fi
    fi

    local gemini_key="${GEMINI_API_KEY:-}"
    local places_key="${GOOGLE_PLACES_API_KEY:-}"
    local posthog_api_key="${POSTHOG_API_KEY:-}"
    local posthog_host="${POSTHOG_HOST:-https://us.i.posthog.com}"

    if [ -z "$gemini_key" ] && [ -f "$env_file_storage" ]; then
        gemini_key=$(grep "^GEMINI_API_KEY=" "$env_file_storage" | cut -d '=' -f 2)
    fi

    if [ -z "$places_key" ] && [ -f "$env_file_storage" ]; then
        places_key=$(grep "^GOOGLE_PLACES_API_KEY=" "$env_file_storage" | cut -d '=' -f 2)
    fi

    if [ -z "$posthog_api_key" ] && [ -f "$env_file_storage" ]; then
        posthog_api_key=$(grep "^POSTHOG_API_KEY=" "$env_file_storage" | cut -d '=' -f 2)
    fi

    if [ -z "$posthog_host" ] && [ -f "$env_file_storage" ]; then
        posthog_host=$(grep "^POSTHOG_HOST=" "$env_file_storage" | cut -d '=' -f 2)
    fi

    if [ -z "$gemini_key" ]; then
        warn "GEMINI_API_KEY not set. Menu OCR features will not work."
    fi

    if [ -z "$places_key" ]; then
        warn "GOOGLE_PLACES_API_KEY not set. Restaurant search features will not work."
    fi

    if [ -z "$posthog_api_key" ]; then
        warn "POSTHOG_API_KEY not set. Backend analytics will be disabled."
    fi

    cat > "$env_file_storage" <<EOF
# Backend Environment Variables - $ENVIRONMENT
# Generated on $(date)
FOOD_TRACKER_ENV=${FOOD_TRACKER_ENV}
FOOD_TRACKER_MARKETING_URL=${FOOD_TRACKER_MARKETING_URL}
FOOD_TRACKER_APP_URL=${FOOD_TRACKER_APP_URL}
FOOD_TRACKER_ADMIN_URL=${FOOD_TRACKER_ADMIN_URL}
FOOD_TRACKER_API_BASE_URL=${FOOD_TRACKER_API_BASE_URL}
FOOD_TRACKER_POCKETBASE_URL=${FOOD_TRACKER_POCKETBASE_URL}
FOOD_TRACKER_POSTHOG_HOST=${FOOD_TRACKER_POSTHOG_HOST}
GEMINI_API_KEY=${gemini_key}
GOOGLE_PLACES_API_KEY=${places_key}
POSTHOG_API_KEY=${posthog_api_key}
POSTHOG_HOST=${posthog_host}
EOF

    chmod 600 "$env_file_storage"
    ln -sf "$env_file_storage" "$APP_DIR/backend/.env"

    export FOOD_TRACKER_ENV="$FOOD_TRACKER_ENV"
    export FOOD_TRACKER_MARKETING_URL="$FOOD_TRACKER_MARKETING_URL"
    export FOOD_TRACKER_APP_URL="$FOOD_TRACKER_APP_URL"
    export FOOD_TRACKER_ADMIN_URL="$FOOD_TRACKER_ADMIN_URL"
    export FOOD_TRACKER_API_BASE_URL="$FOOD_TRACKER_API_BASE_URL"
    export FOOD_TRACKER_POCKETBASE_URL="$FOOD_TRACKER_POCKETBASE_URL"
    export FOOD_TRACKER_POSTHOG_HOST="$FOOD_TRACKER_POSTHOG_HOST"
    export GEMINI_API_KEY="$gemini_key"
    export GOOGLE_PLACES_API_KEY="$places_key"
    export POSTHOG_API_KEY="$posthog_api_key"
    export POSTHOG_HOST="$posthog_host"

    log "Backend .env configured at $env_file_storage (symlinked to backend/.env)"
}

deploy_pocketbase() {
    step "Updating PocketBase container ($ENVIRONMENT)..."

    cd "$APP_DIR"

    log "Building PocketBase image..."
    if ! docker compose -f "$COMPOSE_FILE" build "$POCKETBASE_SERVICE" 2>&1 | tee -a "$LOG_FILE"; then
        error "Failed to build PocketBase image"
        exit 1
    fi

    local old_container
    local new_container
    old_container=$(docker ps -qf "name=$POCKETBASE_CONTAINER")

    if ! docker compose -f "$COMPOSE_FILE" up -d "$POCKETBASE_SERVICE"; then
        error "Failed to start PocketBase container"
        exit 1
    fi

    new_container=$(docker ps -qf "name=$POCKETBASE_CONTAINER")

    if [ "$old_container" != "$new_container" ]; then
        log "PocketBase container recreated (new container ID: $new_container)"
    else
        log "PocketBase container unchanged"
    fi

    log "PocketBase updated ✓"
}

health_check_pocketbase() {
    step "Performing PocketBase health check ($ENVIRONMENT)..."

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker compose -f "$COMPOSE_FILE" exec -T "$POCKETBASE_SERVICE" wget --spider -q "http://localhost:$POCKETBASE_PORT/api/health" 2>/dev/null; then
            log "PocketBase is healthy ✓"
            return 0
        fi

        attempt=$((attempt + 1))
        log "Waiting for PocketBase to be healthy (attempt $attempt/$max_attempts)..."
        sleep 2
    done

    error "PocketBase health check failed after $max_attempts attempts"
    return 1
}

caddy_site_status_code() {
    local domain="$1"
    local path="${2:-/}"
    local status_code

    status_code=$(curl -k -s -o /dev/null -w "%{http_code}" -L \
        --connect-timeout 3 \
        --max-time 10 \
        --resolve "$domain:80:127.0.0.1" \
        --resolve "$domain:443:127.0.0.1" \
        "http://$domain$path" || true)

    if [ -z "$status_code" ]; then
        echo "000"
    else
        echo "$status_code"
    fi
}

health_check_static_site() {
    local site_key="$1"
    local domain
    local build_dir
    local site_name
    local max_attempts=10
    local attempt=0
    local status_code="000"

    domain=$(site_domain "$site_key")
    build_dir=$(site_build_dir "$site_key")
    site_name=$(site_label "$site_key")

    if [ ! -d "$APP_DIR/$build_dir" ]; then
        error "$build_dir directory does not exist"
        return 1
    fi

    if [ ! -f "$APP_DIR/$build_dir/index.html" ]; then
        error "index.html not found in $build_dir"
        return 1
    fi

    while [ $attempt -lt $max_attempts ]; do
        status_code=$(caddy_site_status_code "$domain")
        if [ "$status_code" = "200" ]; then
            log "${site_name} is accessible via Caddy ✓"
            return 0
        fi

        attempt=$((attempt + 1))
        log "Waiting for ${site_name} to be accessible (attempt $attempt/$max_attempts, status=$status_code)..."
        sleep 1
    done

    error "${site_name} health check failed via Caddy (last status: $status_code)"
    return 1
}

reload_caddy() {
    step "Reloading Caddy..."

    if ! validate_caddy_config /etc/caddy/Caddyfile; then
        warn "Caddy configuration validation failed, but continuing..."
    fi

    if ! run_sudo systemctl reload caddy; then
        error "Failed to reload Caddy"
        exit 1
    fi

    sleep 2
    if ! systemctl is-active --quiet caddy; then
        error "Caddy is not running after reload"
        exit 1
    fi

    log "Caddy reloaded ✓"
}

smoke_test() {
    step "Running smoke tests ($ENVIRONMENT)..."

    if ! curl -f -s "http://localhost:$POCKETBASE_PORT/api/health" > /dev/null; then
        error "PocketBase API not responding on port $POCKETBASE_PORT"
        return 1
    fi

    local site_key
    for site_key in $(site_keys); do
        local domain
        local html_response
        domain=$(site_domain "$site_key")

        if ! html_response=$(curl -k -f -s -L \
            --resolve "$domain:80:127.0.0.1" \
            --resolve "$domain:443:127.0.0.1" \
            "http://$domain/"); then
            error "Smoke test failed: $(site_label "$site_key") is not reachable for $domain"
            return 1
        fi

        if ! printf '%s' "$html_response" | grep -qi "<!doctype html>"; then
            error "Smoke test failed: $(site_label "$site_key") is not serving HTML for $domain"
            return 1
        fi
    done

    if ! curl -k -f -s -L \
        --resolve "$POCKETBASE_DOMAIN:80:127.0.0.1" \
        --resolve "$POCKETBASE_DOMAIN:443:127.0.0.1" \
        "http://$POCKETBASE_DOMAIN/api/health" > /dev/null; then
        error "Smoke test failed: PocketBase API is not reachable through $POCKETBASE_DOMAIN/api/health"
        return 1
    fi

    log "Smoke tests passed ✓"
}

cleanup_old_builds() {
    step "Cleaning up old static site builds ($ENVIRONMENT)..."

    cd "$APP_DIR"

    local site_key
    for site_key in $(site_keys); do
        local build_dir
        build_dir=$(site_build_dir "$site_key")
        if [ -d "${build_dir}_old" ]; then
            nohup bash -c "sleep 300 && rm -rf '${build_dir}_old'" > /dev/null 2>&1 &
            disown
            log "Old $(site_label "$site_key") build will be deleted in 5 minutes"
        fi
    done
}

print_summary() {
    local db_size
    local git_commit
    local backup_location
    db_size=$(du -sh "$APP_DIR/backend/pb_data_${ENVIRONMENT}/" 2>/dev/null | cut -f1 || echo 'N/A')
    git_commit=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo 'N/A')
    backup_location=$(readlink -f "$BACKUP_DIR/latest" 2>/dev/null || echo 'N/A')

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Deployment Summary (${ENVIRONMENT}):${NC}"
    echo "  - Environment: $ENVIRONMENT"
    echo "  - Database size: $db_size"
    echo "  - Backup location: $backup_location"
    echo "  - Git commit: $git_commit"
    echo "  - PocketBase port: $POCKETBASE_PORT"
    echo "  - Marketing URL: https://$MARKETING_DOMAIN"
    echo "  - App URL: https://$APP_DOMAIN"
    echo "  - Admin URL: https://$ADMIN_DOMAIN"
    echo "  - PocketBase Admin URL: https://$APP_DOMAIN/_/"
    echo ""
    echo -e "${YELLOW}Deployment log saved to:${NC} $LOG_FILE"
    echo ""
}

main() {
    mkdir -p "$LOG_DIR"
    chmod 755 "$LOG_DIR"

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Deploying Yummy Recs${NC}"
    echo -e "${BLUE}  Environment: ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    log "Environment: $ENVIRONMENT"
    log "Logging to: $LOG_FILE"
    log "Started at $(date)"
    echo ""

    preflight_checks
    create_backup
    update_source_code
    install_workspace_dependencies
    build_web_surfaces
    prepare_static_sites
    deploy_static_sites
    reload_caddy

    local site_key
    for site_key in $(site_keys); do
        health_check_static_site "$site_key"
    done

    configure_backend
    deploy_pocketbase
    health_check_pocketbase
    smoke_test
    cleanup_old_builds
    print_summary
}

main "$@"
