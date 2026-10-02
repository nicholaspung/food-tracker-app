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

if [ "$ENVIRONMENT" = "production" ]; then
    umask 077
fi

APP_DIR="${FOOD_TRACKER_APP_DIR:-/opt/food-tracker-app}"
MARKETING_SOURCE_DIR="$APP_DIR/apps/marketing/dist"
APP_WEB_SOURCE_DIR="$APP_DIR/apps/mobile/web-dist"
ADMIN_SOURCE_DIR="$APP_DIR/apps/admin/dist"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="${LOG_DIR}/deploy-${ENVIRONMENT}.log"
LOCK_FILE="/tmp/food-tracker-deploy-${ENVIRONMENT}.lock"
BACKUP_DIR="/opt/food-tracker-backups/${ENVIRONMENT}"
PROVENANCE_FILE="$BACKUP_DIR/current-provenance.env"
PRIVILEGED_HELPER="/usr/local/sbin/food-tracker-deploy-privileged"
MAX_BACKUPS=5
DEFAULT_PNPM_PACKAGE_MANAGER="pnpm@11.1.2"
PNPM_PACKAGE_MANAGER=""
PNPM_CMD=()
APPROVED_SHA="${FOOD_TRACKER_DEPLOY_SHA:-}"
DEPLOYMENT_DIGEST=""
BACKEND_MOUNT_STAGING="${FOOD_TRACKER_BACKEND_MOUNT_STAGING:-}"
STAGED_BACKEND_MOUNT_DIGEST="${FOOD_TRACKER_STAGED_BACKEND_MOUNT_DIGEST:-}"

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
    sudo -n "$@"
}

verify_approved_source() {
    if [ "$ENVIRONMENT" != "production" ]; then
        APPROVED_SHA=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)
        return
    fi

    if [[ ! "$APPROVED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
        echo -e "${RED}ERROR: Production deploy requires FOOD_TRACKER_DEPLOY_SHA to be a full commit SHA${NC}" >&2
        exit 1
    fi

    local actual_sha
    actual_sha=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)
    if [ "$actual_sha" != "$APPROVED_SHA" ]; then
        echo -e "${RED}ERROR: Production checkout mismatch: approved $APPROVED_SHA, found ${actual_sha:-unavailable}${NC}" >&2
        exit 1
    fi

    if ! git -C "$APP_DIR" diff --quiet HEAD -- . \
        ':(exclude)backend/pb_migrations' ':(exclude)backend/pb_migrations/**' \
        ':(exclude)backend/pb_hooks' ':(exclude)backend/pb_hooks/**' \
        ':(exclude)backend/pb_public' ':(exclude)backend/pb_public/**'; then
        echo -e "${RED}ERROR: Production checkout contains source changes outside approved commit $APPROVED_SHA${NC}" >&2
        exit 1
    fi

    local untracked_path
    while IFS= read -r untracked_path; do
        case "$untracked_path" in
            backend/pb_migrations/*|backend/pb_hooks/*|backend/pb_public/*) ;;
            *)
                echo -e "${RED}ERROR: Production checkout contains untracked source outside approved commit $APPROVED_SHA: $untracked_path${NC}" >&2
                exit 1
                ;;
        esac
    done < <(git -C "$APP_DIR" ls-files --others --exclude-standard)

    case "$BACKEND_MOUNT_STAGING" in
        "$BACKUP_DIR"/.backend-mount-staging.*) ;;
        *)
            echo -e "${RED}ERROR: Production deploy requires root-owned backend mount staging under $BACKUP_DIR${NC}" >&2
            exit 1
            ;;
    esac
    if [ ! -d "$BACKEND_MOUNT_STAGING/live/backend" ] || \
        [[ ! "$STAGED_BACKEND_MOUNT_DIGEST" =~ ^[0-9a-f]{64}$ ]]; then
        echo -e "${RED}ERROR: Production backend mount staging is incomplete${NC}" >&2
        exit 1
    fi

    local staged_live_digest
    local actual_live_digest
    staged_live_digest=$(compute_backend_mount_digest "$BACKEND_MOUNT_STAGING/live/backend")
    actual_live_digest=$(compute_backend_mount_digest "$APP_DIR/backend")
    if [ "$staged_live_digest" != "$STAGED_BACKEND_MOUNT_DIGEST" ] || \
        [ "$actual_live_digest" != "$STAGED_BACKEND_MOUNT_DIGEST" ]; then
        echo -e "${RED}ERROR: Production backend runtime mounts changed during approved source selection${NC}" >&2
        exit 1
    fi
}

verify_rollback_baseline() {
    if [ "$ENVIRONMENT" != "production" ]; then
        return
    fi

    for cmd in docker find sha256sum; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            error "Required rollback-provenance command not found: $cmd"
            exit 1
        fi
    done

    if [ ! -f "$PROVENANCE_FILE" ]; then
        error "Production deploy requires rollback baseline provenance: $PROVENANCE_FILE"
        exit 1
    fi

    local baseline_sha
    local baseline_digest
    local baseline_static_digest
    local baseline_backend_mount_digest
    local baseline_backend_image
    baseline_sha=$(awk -F= '$1 == "approved_sha" { print $2; exit }' "$PROVENANCE_FILE")
    baseline_digest=$(awk -F= '$1 == "deployment_digest" { print $2; exit }' "$PROVENANCE_FILE")
    baseline_static_digest=$(awk -F= '$1 == "static_digest" { print $2; exit }' "$PROVENANCE_FILE")
    baseline_backend_mount_digest=$(awk -F= '$1 == "backend_mount_digest" { print $2; exit }' "$PROVENANCE_FILE")
    baseline_backend_image=$(awk -F= '$1 == "backend_image" { print $2; exit }' "$PROVENANCE_FILE")

    if [[ ! "$baseline_sha" =~ ^[0-9a-f]{40}$ ]] || \
        [[ ! "$baseline_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || \
        [[ ! "$baseline_static_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || \
        [[ ! "$baseline_backend_mount_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || \
        [[ ! "$baseline_backend_image" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        error "Production rollback baseline is incomplete or malformed: $PROVENANCE_FILE"
        exit 1
    fi

    local recomputed_digest
    recomputed_digest=$(printf 'approved_sha=%s\nstatic_sha256=%s\nbackend_mount_sha256=%s\nbackend_image=%s\n' \
        "$baseline_sha" "${baseline_static_digest#sha256:}" "${baseline_backend_mount_digest#sha256:}" \
        "$baseline_backend_image" | sha256sum | awk '{print $1}')
    if [ "sha256:$recomputed_digest" != "$baseline_digest" ]; then
        error "Production rollback baseline component digest is invalid: $PROVENANCE_FILE"
        exit 1
    fi

    local actual_static_digest
    local actual_backend_mount_digest
    local actual_backend_image
    actual_static_digest="sha256:$(compute_static_artifact_digest)"
    actual_backend_mount_digest="sha256:$(compute_backend_mount_digest "$APP_DIR/backend")"
    actual_backend_image=$(docker inspect --format '{{.Image}}' "$POCKETBASE_CONTAINER")
    if [ "$actual_static_digest" != "$baseline_static_digest" ] || \
        [ "$actual_backend_mount_digest" != "$baseline_backend_mount_digest" ] || \
        [ "$actual_backend_image" != "$baseline_backend_image" ]; then
        error "Production rollback baseline does not match the currently deployed artifacts"
        exit 1
    fi

    log "Rollback baseline verified: commit $baseline_sha, artifact $baseline_digest"
}

ensure_privileged_helper() {
    local helper_mode
    local helper_permissions

    if [ -x "$PRIVILEGED_HELPER" ] && [ "$(stat -c '%u' "$PRIVILEGED_HELPER")" = "0" ]; then
        helper_mode=$(stat -c '%a' "$PRIVILEGED_HELPER")
        helper_permissions=$((8#$helper_mode))
        if (( (helper_permissions & 18) == 0 )); then
            return
        fi
    fi

    error "Privileged deployment helper is missing or not root-owned and non-writable: $PRIVILEGED_HELPER"
    error "Run 'sudo bash $APP_DIR/scripts/setup-deploy-sudo.sh $USER $ENVIRONMENT' on the VPS before deploying."
    exit 1
}

caddy_config_has_domain() {
    local caddy_config="$1"
    local domain="$2"

    awk -v domain="$domain" '$1 == domain && $2 == "{" { found = 1 } END { exit(found ? 0 : 1) }' "$caddy_config"
}

validate_caddy_config() {
    local config_path="$1"
    local validation_output
    local helper_command

    case "$config_path" in
        "$APP_DIR/Caddyfile") helper_command="caddy-validate-repo-${ENVIRONMENT}" ;;
        "/etc/caddy/Caddyfile") helper_command="caddy-validate-live" ;;
        *)
            error "Refusing to validate unexpected Caddy config: $config_path"
            return 1
            ;;
    esac

    validation_output=$(mktemp)

    if run_sudo "$PRIVILEGED_HELPER" "$helper_command" >"$validation_output" 2>&1; then
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

    if [ "$ENVIRONMENT" = "production" ]; then
        if ! validate_caddy_config "$repo_caddy_config"; then
            error "Repo Caddyfile failed validation: $repo_caddy_config"
            error "Fix the checked-in Caddyfile before deploying."
            exit 1
        fi
        return
    fi

    if [ ! -r "$caddy_config" ]; then
        error "Live Caddy config is not readable; Beta cannot verify the shared config."
        exit 1
    fi

    for domain in "$MARKETING_DOMAIN" "$APP_DOMAIN" "$ADMIN_DOMAIN"; do
        if ! caddy_config_has_domain "$caddy_config" "$domain"; then
            missing_domains+=("$domain")
        fi
    done

    if [ "${#missing_domains[@]}" -gt 0 ]; then
        warn "Live Caddy config is missing environment domains: ${missing_domains[*]}"
        error "Beta is not allowed to replace the shared Caddy config."
        error "Have the Production operator install the reviewed Caddyfile, then retry Beta."
        exit 1
    fi

    log "Live Caddy config verified ✓"
}

sync_production_caddy_config() {
    if [ "$ENVIRONMENT" != "production" ]; then
        return
    fi

    local site_key
    local build_dir
    for site_key in $(site_keys); do
        build_dir=$(site_build_dir "$site_key")
        if [ ! -f "$APP_DIR/$build_dir/index.html" ]; then
            error "Refusing Production Caddy cutover without staged $build_dir/index.html"
            exit 1
        fi
    done

    step "Installing reviewed Production Caddy config..."
    run_sudo "$PRIVILEGED_HELPER" caddy-backup-live
    CADDY_ROLLBACK_STAGED=true
    run_sudo "$PRIVILEGED_HELPER" caddy-install-production
    log "Reviewed Production Caddy config installed ✓"
}

prepare_production_caddy_assets() {
    if [ "$ENVIRONMENT" != "production" ]; then
        return
    fi

    step "Granting Caddy read access to Production static assets..."
    run_sudo "$PRIVILEGED_HELPER" prepare-caddy-assets-production
    log "Production static assets are readable by Caddy ✓"
}

recover_interrupted_caddy_cutover() {
    if [ "$ENVIRONMENT" != "production" ]; then
        return
    fi

    if ! run_sudo "$PRIVILEGED_HELPER" caddy-backup-exists; then
        return
    fi

    warn "Found an unfinished Production Caddy cutover; restoring the last live config"
    run_sudo "$PRIVILEGED_HELPER" caddy-restore-live
    if ! validate_caddy_config "/etc/caddy/Caddyfile"; then
        error "Restored Caddy config failed validation; rollback snapshot was preserved"
        exit 1
    fi
    run_sudo "$PRIVILEGED_HELPER" caddy-reload
    run_sudo "$PRIVILEGED_HELPER" caddy-clear-backup
    log "Interrupted Caddy cutover recovered ✓"
}

clear_caddy_rollback() {
    if [ "$CADDY_ROLLBACK_STAGED" != true ]; then
        return
    fi

    run_sudo "$PRIVILEGED_HELPER" caddy-clear-backup
    CADDY_ROLLBACK_STAGED=false
}

configure_package_manager() {
    local detected_package_manager=""
    local package_manager_version="${DEFAULT_PNPM_PACKAGE_MANAGER#pnpm@}"
    local installed_pnpm_version=""

    if [ -f "$APP_DIR/package.json" ]; then
        detected_package_manager=$(node -p "require('$APP_DIR/package.json').packageManager || ''" 2>/dev/null || true)
    fi

    if [ -n "$detected_package_manager" ]; then
        PNPM_PACKAGE_MANAGER="$detected_package_manager"
    else
        PNPM_PACKAGE_MANAGER="$DEFAULT_PNPM_PACKAGE_MANAGER"
    fi

    if [[ "$PNPM_PACKAGE_MANAGER" == pnpm@* ]]; then
        package_manager_version="${PNPM_PACKAGE_MANAGER#pnpm@}"
    fi

    if command -v pnpm &> /dev/null; then
        installed_pnpm_version=$(pnpm --version 2>/dev/null || true)
        if [ "$installed_pnpm_version" = "$package_manager_version" ]; then
            PNPM_CMD=(pnpm)
            return
        fi

        warn "Found pnpm $installed_pnpm_version, but this deploy requires $package_manager_version"
    fi

    if ! command -v corepack &> /dev/null; then
        error "pnpm $package_manager_version is required, but Corepack is not installed"
        error "Install a Node.js build that includes Corepack, then run: corepack enable && corepack prepare $PNPM_PACKAGE_MANAGER --activate"
        exit 1
    fi

    if ! corepack enable > /dev/null 2>&1; then
        warn "Could not enable Corepack globally; attempting pnpm activation anyway"
    fi

    if corepack prepare "$PNPM_PACKAGE_MANAGER" --activate > /dev/null 2>&1; then
        PNPM_CMD=(pnpm)
        return
    fi

    error "Failed to activate $PNPM_PACKAGE_MANAGER via Corepack"
    error "Run this on the VPS, then rerun deploy: corepack enable && corepack prepare $PNPM_PACKAGE_MANAGER --activate"
    exit 1
}

run_pnpm() {
    if [ "${#PNPM_CMD[@]}" -eq 0 ]; then
        configure_package_manager
    fi

    "${PNPM_CMD[@]}" "$@"
}

LOCK_ACQUIRED=false
ROLLBACK_REQUIRED=false
ROLLBACK_COMPLETED=false
CADDY_ROLLBACK_STAGED=false

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

create_directory_snapshot_archive() {
    local source_dir="$1"
    local archive_path="$2"
    local source_name
    local archive_dir
    local snapshot_root
    local snapshot_dir
    local rsync_output
    local rsync_exit_code

    source_name=$(basename "$source_dir")
    archive_dir=$(dirname "$archive_path")
    mkdir -p "$archive_dir"
    snapshot_root=$(mktemp -d "$archive_dir/.snapshot-${source_name}.XXXXXX")
    snapshot_dir="$snapshot_root/$source_name"
    mkdir -p "$snapshot_dir"

    if command -v rsync &> /dev/null; then
        if rsync_output=$(rsync -a "$source_dir/" "$snapshot_dir/" 2>&1); then
            :
        else
            rsync_exit_code=$?
            if [ "$rsync_exit_code" -eq 24 ]; then
                warn "Live files changed while snapshotting $source_name; continuing with the captured snapshot"
                if [ -n "$rsync_output" ]; then
                    printf '%s\n' "$rsync_output" | tee -a "$LOG_FILE"
                fi
            else
                if [ -n "$rsync_output" ]; then
                    printf '%s\n' "$rsync_output" | tee -a "$LOG_FILE" >&2
                fi
                rm -rf "$snapshot_root"
                error "Failed to snapshot $source_name before archiving"
                exit 1
            fi
        fi
    else
        warn "rsync is unavailable; falling back to cp -a for $source_name backup"
        if ! cp -a "$source_dir/." "$snapshot_dir/"; then
            rm -rf "$snapshot_root"
            error "Failed to snapshot $source_name before archiving"
            exit 1
        fi
    fi

    if ! tar -czf "$archive_path" -C "$snapshot_root" "$source_name"; then
        rm -rf "$snapshot_root"
        error "Failed to archive $source_name snapshot"
        exit 1
    fi

    rm -rf "$snapshot_root"
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

    echo -n "Do you want to rollback the deployment? (y/N): "
    read -t 10 -r response || response="n"

    if [[ "$response" =~ ^[Yy]$ ]]; then
        warn "User requested rollback..."
        rollback
        ROLLBACK_COMPLETED=true
        exit 130
    else
        warn "Skipping rollback. Cleaning up and exiting..."
        error "Deployment cancelled by user. System may be in an inconsistent state."
        exit 130
    fi
}

handle_signal() {
    local signal_name="$1"
    local exit_code="$2"

    echo ""
    warn "Deployment interrupted by $signal_name"
    exit "$exit_code"
}

cleanup_lock() {
    if [ "$LOCK_ACQUIRED" != true ]; then
        return
    fi

    if [ -f "$LOCK_FILE" ] && [ "$(cat "$LOCK_FILE" 2>/dev/null || true)" = "$$" ]; then
        rm -f "$LOCK_FILE"
    else
        warn "Lock file was changed by another process; leaving it in place: $LOCK_FILE"
    fi
}

cleanup_backend_mount_staging() {
    if [ -z "$BACKEND_MOUNT_STAGING" ] || [ ! -d "$BACKEND_MOUNT_STAGING" ]; then
        return
    fi

    case "$BACKEND_MOUNT_STAGING" in
        "$BACKUP_DIR"/.backend-mount-staging.*)
            rm -rf "$BACKEND_MOUNT_STAGING"
            ;;
        *)
            warn "Refusing to remove unexpected backend staging path: $BACKEND_MOUNT_STAGING"
            ;;
    esac
}

acquire_lock() {
    local existing_pid=""

    if [ "$LOCK_ACQUIRED" = true ]; then
        return
    fi

    if [ "${FOOD_TRACKER_DEPLOY_LOCK_OWNER:-}" = "$$" ] && \
        [ -f "$LOCK_FILE" ] && \
        [ "$(cat "$LOCK_FILE" 2>/dev/null || true)" = "$$" ]; then
        LOCK_ACQUIRED=true
        return
    fi

    if [ -f "$LOCK_FILE" ]; then
        existing_pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
        if [[ "$existing_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$existing_pid" 2>/dev/null; then
            warn "Removing stale deployment lock for exited process $existing_pid: $LOCK_FILE"
            rm -f "$LOCK_FILE"
        fi
    fi

    if (set -o noclobber; echo $$ > "$LOCK_FILE") 2>/dev/null; then
        LOCK_ACQUIRED=true
        return
    fi

    error "Deployment already in progress (lock file exists: $LOCK_FILE)"
    error "If no deployment is running, remove the lock file manually"
    exit 1
}

cleanup() {
    local exit_code=$?

    trap - EXIT INT TERM HUP QUIT

    if [ $exit_code -ne 0 ]; then
        error "Deployment failed with exit code $exit_code"
        if [ "$ROLLBACK_REQUIRED" = true ] && [ "$ROLLBACK_COMPLETED" != true ]; then
            rollback
        else
            warn "Skipping rollback because no deploy mutations were applied yet"
        fi
    fi

    cleanup_backend_mount_staging
    cleanup_lock
    exit $exit_code
}

rollback() {
    warn "Initiating rollback for $ENVIRONMENT environment..."

    cd "$APP_DIR"

    local rollback_provenance="$BACKUP_DIR/latest/deployment-provenance.env"
    local rollback_static_digest=""
    local rollback_backend_mount_digest=""
    local rollback_backend_image=""
    local rollback_compose_image=""
    if [ -f "$rollback_provenance" ]; then
        local rollback_sha
        local rollback_digest
        rollback_sha=$(awk -F= '$1 == "approved_sha" { print $2; exit }' "$rollback_provenance")
        rollback_digest=$(awk -F= '$1 == "deployment_digest" { print $2; exit }' "$rollback_provenance")
        rollback_static_digest=$(awk -F= '$1 == "static_digest" { print $2; exit }' "$rollback_provenance")
        rollback_backend_mount_digest=$(awk -F= '$1 == "backend_mount_digest" { print $2; exit }' "$rollback_provenance")
        rollback_backend_image=$(awk -F= '$1 == "backend_image" { print $2; exit }' "$rollback_provenance")

        if [[ ! "$rollback_sha" =~ ^[0-9a-f]{40}$ ]] || \
            [[ ! "$rollback_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || \
            [[ ! "$rollback_static_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || \
            [[ ! "$rollback_backend_mount_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || \
            [[ ! "$rollback_backend_image" =~ ^sha256:[0-9a-f]{64}$ ]]; then
            error "Rollback provenance is incomplete or malformed: $rollback_provenance"
            return 1
        fi

        local recomputed_deployment_digest
        recomputed_deployment_digest=$(printf 'approved_sha=%s\nstatic_sha256=%s\nbackend_mount_sha256=%s\nbackend_image=%s\n' \
            "$rollback_sha" "${rollback_static_digest#sha256:}" "${rollback_backend_mount_digest#sha256:}" \
            "$rollback_backend_image" | sha256sum | awk '{print $1}')
        if [ "sha256:$recomputed_deployment_digest" != "$rollback_digest" ]; then
            error "Rollback deployment digest does not match its recorded components"
            return 1
        fi

        if [ ! -f "$BACKUP_DIR/latest/$COMPOSE_FILE" ]; then
            error "Rollback Compose metadata is missing for recorded artifact $rollback_digest"
            return 1
        fi

        local rollback_backend_mount_source="$BACKUP_DIR/latest/backend-runtime"
        local rollback_backend_mount_source_digest
        rollback_backend_mount_source_digest="sha256:$(compute_backend_mount_digest "$rollback_backend_mount_source")"
        if [ "$rollback_backend_mount_source_digest" != "$rollback_backend_mount_digest" ]; then
            error "Rollback backend mount artifact mismatch: expected $rollback_backend_mount_digest, found $rollback_backend_mount_source_digest"
            return 1
        fi

        if ! docker image inspect "$rollback_backend_image" >/dev/null 2>&1; then
            error "Rollback image is no longer available locally: $rollback_backend_image"
            return 1
        fi

        rollback_compose_image=$(docker compose -f "$BACKUP_DIR/latest/$COMPOSE_FILE" config --images | head -n 1)
        if [ -z "$rollback_compose_image" ]; then
            error "Could not resolve the PocketBase image name from rollback Compose metadata"
            return 1
        fi

        log "Rollback target: commit ${rollback_sha:-unknown}, artifact ${rollback_digest:-unknown}"
    else
        if [ "$ENVIRONMENT" = "production" ]; then
            error "Production rollback requires verified baseline provenance: $rollback_provenance"
            return 1
        fi
        warn "Rollback target predates deployment provenance metadata"
    fi

    if [ -n "$rollback_static_digest" ]; then
        local rollback_source_digest
        rollback_source_digest="sha256:$(compute_static_artifact_digest "$BACKUP_DIR/latest")"
        if [ "$rollback_source_digest" != "$rollback_static_digest" ]; then
            error "Rollback source artifact mismatch: expected $rollback_static_digest, found $rollback_source_digest"
            return 1
        fi
        log "Rollback source artifact verified: $rollback_source_digest"
    fi

    local had_static_rollback=false
    local site_key
    for site_key in $(site_keys); do
        local build_dir
        build_dir=$(site_build_dir "$site_key")
        if [ -n "$rollback_static_digest" ]; then
            log "Rolling back $(site_label "$site_key") from the verified backup..."
            rm -rf "${build_dir}_new" 2>/dev/null || true
            rm -rf "$build_dir" 2>/dev/null || true
            cp -a "$BACKUP_DIR/latest/$build_dir" "$build_dir"
            had_static_rollback=true
        elif [ -d "${build_dir}_old" ]; then
            log "Rolling back $(site_label "$site_key")..."
            rm -rf "${build_dir}_new" 2>/dev/null || true
            rm -rf "$build_dir" 2>/dev/null || true
            mv "${build_dir}_old" "$build_dir"
            had_static_rollback=true
        fi
    done

    if [ -n "$rollback_static_digest" ]; then
        local actual_static_digest
        actual_static_digest="sha256:$(compute_static_artifact_digest)"
        if [ "$actual_static_digest" != "$rollback_static_digest" ]; then
            error "Rolled-back static artifact mismatch: expected $rollback_static_digest, found $actual_static_digest"
            return 1
        fi
        log "Static rollback artifact verified: $actual_static_digest"
    fi

    if [ "$CADDY_ROLLBACK_STAGED" = true ]; then
        run_sudo "$PRIVILEGED_HELPER" caddy-restore-live
        run_sudo "$PRIVILEGED_HELPER" caddy-reload
        run_sudo "$PRIVILEGED_HELPER" caddy-clear-backup
        CADDY_ROLLBACK_STAGED=false
        log "Live Caddy config rolled back successfully"
    elif [ "$had_static_rollback" = true ]; then
        run_sudo "$PRIVILEGED_HELPER" caddy-reload
    fi

    if [ "$had_static_rollback" = true ]; then
        log "Static sites rolled back successfully"
    fi

    if [ -f "$BACKUP_DIR/latest/$COMPOSE_FILE" ]; then
        log "Rolling back PocketBase container..."
        if [ -n "$rollback_backend_image" ]; then
            docker image tag "$rollback_backend_image" "$rollback_compose_image"
        fi

        docker compose --project-directory "$APP_DIR" -f "$BACKUP_DIR/latest/$COMPOSE_FILE" down "$POCKETBASE_SERVICE"
        cp "$BACKUP_DIR/latest/$COMPOSE_FILE" "$APP_DIR/$COMPOSE_FILE"
        if [ -n "$rollback_backend_mount_digest" ]; then
            for mount_dir in pb_migrations pb_hooks pb_public; do
                rm -rf "$APP_DIR/backend/$mount_dir"
                if [ -d "$BACKUP_DIR/latest/backend-runtime/$mount_dir" ]; then
                    cp -a "$BACKUP_DIR/latest/backend-runtime/$mount_dir" "$APP_DIR/backend/$mount_dir"
                fi
            done

            local actual_backend_mount_digest
            actual_backend_mount_digest="sha256:$(compute_backend_mount_digest "$APP_DIR/backend")"
            if [ "$actual_backend_mount_digest" != "$rollback_backend_mount_digest" ]; then
                error "Restored backend mount artifact mismatch: expected $rollback_backend_mount_digest, found $actual_backend_mount_digest"
                return 1
            fi
            log "Backend mount rollback artifact verified: $actual_backend_mount_digest"
        fi

        if [ -n "$rollback_backend_image" ]; then
            docker compose -f "$COMPOSE_FILE" up -d --no-build "$POCKETBASE_SERVICE"
            local actual_backend_image
            actual_backend_image=$(docker inspect --format '{{.Image}}' "$POCKETBASE_CONTAINER")
            if [ "$actual_backend_image" != "$rollback_backend_image" ]; then
                error "Rolled-back PocketBase image mismatch: expected $rollback_backend_image, found $actual_backend_image"
                return 1
            fi
            log "PocketBase rollback image verified: $actual_backend_image"
        else
            docker compose -f "$COMPOSE_FILE" up -d "$POCKETBASE_SERVICE"
        fi
        log "PocketBase rolled back successfully"
    fi

    if [ -f "$rollback_provenance" ]; then
        cp "$rollback_provenance" "$PROVENANCE_FILE"
    else
        rm -f "$PROVENANCE_FILE"
    fi

    error "Rollback complete. System restored to previous state."
}

preflight_checks() {
    step "Running pre-flight checks..."

    acquire_lock

    for cmd in git docker curl systemctl node corepack sha256sum; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done

    configure_package_manager
    local pnpm_version
    if ! pnpm_version=$(run_pnpm --version 2>/dev/null); then
        error "Failed to initialize $PNPM_PACKAGE_MANAGER"
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

    recover_interrupted_caddy_cutover
    ensure_live_caddy_config

    local container_running
    container_running=$(docker inspect --format '{{.State.Running}}' "$POCKETBASE_CONTAINER" 2>/dev/null || true)
    if [ "$container_running" != "true" ]; then
        if [ "$ENVIRONMENT" = "production" ]; then
            error "Production PocketBase must be running before deployment so the verified baseline remains active"
            exit 1
        fi
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
        run_sudo "$PRIVILEGED_HELPER" "prepare-backups-${ENVIRONMENT}"
    fi

    # Older deploys/backups may have been created by root or copied with
    # root-owned files from containers. Normalize ownership before pruning so
    # retention cleanup doesn't fail the deployment before any app mutation.
    if ! [ -w "$BACKUP_DIR" ] || find "$BACKUP_DIR" -mindepth 1 -maxdepth 2 ! -user "$USER" -print -quit | grep -q .; then
        if ! run_sudo "$PRIVILEGED_HELPER" "repair-backups-${ENVIRONMENT}"; then
            warn "Could not normalize backup ownership; old backup cleanup will be best-effort"
        fi
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

    if [ "$ENVIRONMENT" = "production" ] && [ -f "$BACKEND_MOUNT_STAGING/live/$COMPOSE_FILE" ]; then
        cp "$BACKEND_MOUNT_STAGING/live/$COMPOSE_FILE" "$backup_path/$COMPOSE_FILE"
    elif [ -f "$APP_DIR/$COMPOSE_FILE" ]; then
        cp "$APP_DIR/$COMPOSE_FILE" "$backup_path/"
    fi

    if [ -f "$PROVENANCE_FILE" ]; then
        cp "$PROVENANCE_FILE" "$backup_path/deployment-provenance.env"
    fi

    mkdir -p "$backup_path/backend-runtime"
    for mount_dir in pb_migrations pb_hooks pb_public; do
        if [ -d "$APP_DIR/backend/$mount_dir" ]; then
            cp -a "$APP_DIR/backend/$mount_dir" "$backup_path/backend-runtime/$mount_dir"
        fi
    done

    local pb_data_dir="backend/pb_data_${ENVIRONMENT}"
    if [ -d "$APP_DIR/$pb_data_dir" ]; then
        create_directory_snapshot_archive "$APP_DIR/$pb_data_dir" "$backup_path/pb_data_backup.tar.gz"
        log "PocketBase data backed up to $backup_path/pb_data_backup.tar.gz"
    fi

    rm -f "$BACKUP_DIR/latest"
    ln -s "$backup_path" "$BACKUP_DIR/latest"

    local backup_count
    backup_count=$(ls -1t "$BACKUP_DIR" | grep -E '^[0-9]{8}_[0-9]{6}$' | wc -l)
    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        log "Cleaning up old backups (keeping latest $MAX_BACKUPS)..."
        ls -1t "$BACKUP_DIR" | grep -E '^[0-9]{8}_[0-9]{6}$' | tail -n +$((MAX_BACKUPS + 1)) | while read -r old_backup; do
            local cleanup_error
            cleanup_error=$(mktemp)
            if rm -rf "$BACKUP_DIR/$old_backup" 2>"$cleanup_error"; then
                log "Removed old backup: $old_backup"
                rm -f "$cleanup_error"
                continue
            fi

            warn "Could not remove old backup $old_backup as $USER; retrying after ownership repair"
            if run_sudo "$PRIVILEGED_HELPER" "repair-backups-${ENVIRONMENT}"; then
                if rm -rf "$BACKUP_DIR/$old_backup" 2>"$cleanup_error"; then
                    log "Removed old backup: $old_backup"
                    rm -f "$cleanup_error"
                    continue
                fi
            fi

            warn "Skipping old backup $old_backup because it is not removable by this deploy user"
            sed 's/^/  /' "$cleanup_error" | while read -r line; do warn "$line"; done
            rm -f "$cleanup_error"
        done
    fi

    log "Backup created successfully ✓"
}

install_workspace_dependencies() {
    step "Installing workspace dependencies..."

    cd "$APP_DIR"
    CI=true run_pnpm install --frozen-lockfile

    log "Workspace dependencies installed ✓"
}

bundle_contains_fragment() {
    local fragment="$1"
    local build_dir="$2"

    if command -v rg > /dev/null 2>&1; then
        rg -Fq -- "$fragment" "$build_dir"
        return $?
    fi

    grep -R -Fq -- "$fragment" "$build_dir"
}

verify_mobile_web_bundle_environment() {
    step "Verifying mobile web bundle environment ($ENVIRONMENT)..."

    local build_dir="$APP_WEB_SOURCE_DIR"
    if [ ! -d "$build_dir" ]; then
        error "Mobile web build directory is missing: $build_dir"
        exit 1
    fi

    local -a expected_fragments=(
        "EXPO_PUBLIC_APP_ENV:\"$FOOD_TRACKER_ENV\""
        "EXPO_PUBLIC_API_BASE_URL:\"$FOOD_TRACKER_API_BASE_URL\""
        "EXPO_PUBLIC_POCKETBASE_URL:\"$FOOD_TRACKER_POCKETBASE_URL\""
        "EXPO_PUBLIC_APP_WEB_URL:\"$FOOD_TRACKER_APP_URL\""
        "EXPO_PUBLIC_ADMIN_URL:\"$FOOD_TRACKER_ADMIN_URL\""
        "EXPO_PUBLIC_IOS_APP_STORE_URL:\"$FOOD_TRACKER_IOS_APP_STORE_URL\""
    )

    local fragment
    for fragment in "${expected_fragments[@]}"; do
        if ! bundle_contains_fragment "$fragment" "$build_dir"; then
            error "Mobile web build is missing expected environment fragment: $fragment"
            error "Expo may have picked up the wrong environment before exporting the web bundle."
            exit 1
        fi
    done

    log "Mobile web bundle environment verified ✓"
}

build_web_surfaces() {
    step "Building web surfaces..."

    cd "$APP_DIR"

    CI=true NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}" \
        run_pnpm --filter @food-tracker/admin build 2>&1 | tee -a "$LOG_FILE"
    (
        export CI=true
        export EXPO_NO_DOTENV=1
        export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"
        run_pnpm --filter @food-tracker/mobile exec expo export \
            --platform web --output-dir web-dist --clear --max-workers 1
    ) 2>&1 | tee -a "$LOG_FILE"
    verify_mobile_web_bundle_environment

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
            APP_OPEN_URL="$APP_OPEN_URL" \
                IOS_APP_STORE_URL="$FOOD_TRACKER_IOS_APP_STORE_URL" \
                bash "$APP_DIR/scripts/prepare-marketing.sh" "$source_dir" "${build_dir}_new"
        else
            cp -r "$source_dir" "${build_dir}_new"
        fi

        if [ "$site_key" = "app" ]; then
            node "$APP_DIR/scripts/write-app-link-associations.mjs" "${build_dir}_new" "$ENVIRONMENT"
            validate_app_link_associations "${build_dir}_new"
        fi

        if [ ! -d "${build_dir}_new" ] || [ ! -f "${build_dir}_new/index.html" ]; then
            error "Failed to copy the ${site_name} build to ${build_dir}_new"
            exit 1
        fi

        prepare_production_caddy_assets

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
            run_sudo "$PRIVILEGED_HELPER" "prepare-secrets-${ENVIRONMENT}"
            log "Created secrets directory with sudo"
        fi
    fi

    local gemini_key="${GEMINI_API_KEY:-}"
    local places_key="${GOOGLE_PLACES_API_KEY:-}"
    local posthog_api_key="${POSTHOG_API_KEY:-}"
    local posthog_host="${POSTHOG_HOST:-https://us.i.posthog.com}"
    local expo_push_access_token="${EXPO_PUSH_ACCESS_TOKEN:-}"

    if [ -z "$gemini_key" ] && [ -f "$env_file_storage" ]; then
        gemini_key=$(grep "^GEMINI_API_KEY=" "$env_file_storage" | cut -d '=' -f 2)
    fi

    if [ -z "$places_key" ] && [ -f "$env_file_storage" ]; then
        places_key=$(grep "^GOOGLE_PLACES_API_KEY=" "$env_file_storage" | cut -d '=' -f 2)
    fi

    if [ -z "$posthog_api_key" ] && [ -f "$env_file_storage" ]; then
        posthog_api_key=$(grep "^POSTHOG_API_KEY=" "$env_file_storage" | cut -d '=' -f 2)
    fi

    if [ -z "$expo_push_access_token" ] && [ -f "$env_file_storage" ]; then
        expo_push_access_token=$(grep "^EXPO_PUSH_ACCESS_TOKEN=" "$env_file_storage" | cut -d '=' -f 2)
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

    if [ -z "$expo_push_access_token" ]; then
        warn "EXPO_PUSH_ACCESS_TOKEN not set. Expo push sends will remain unauthenticated; do not enable Expo push security until this secret is configured."
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
FOOD_TRACKER_IOS_APP_STORE_URL=${FOOD_TRACKER_IOS_APP_STORE_URL}
FOOD_TRACKER_APP_SCHEME=${FOOD_TRACKER_APP_SCHEME}
TRUST_PROXY_HEADERS=true
GEMINI_API_KEY=${gemini_key}
GOOGLE_PLACES_API_KEY=${places_key}
POSTHOG_API_KEY=${posthog_api_key}
POSTHOG_HOST=${posthog_host}
EXPO_PUSH_ACCESS_TOKEN=${expo_push_access_token}
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
    export FOOD_TRACKER_IOS_APP_STORE_URL="$FOOD_TRACKER_IOS_APP_STORE_URL"
    export FOOD_TRACKER_APP_SCHEME="$FOOD_TRACKER_APP_SCHEME"
    export FOOD_TRACKER_BACKEND_ENV_FILE="$env_file_storage"
    export GEMINI_API_KEY="$gemini_key"
    export GOOGLE_PLACES_API_KEY="$places_key"
    export POSTHOG_API_KEY="$posthog_api_key"
    export POSTHOG_HOST="$posthog_host"
    export EXPO_PUSH_ACCESS_TOKEN="$expo_push_access_token"

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

pocketbase_domain_health_check() {
    local domain="$1"
    local max_attempts="${2:-15}"
    local attempt=0
    local status_code="000"

    while [ $attempt -lt $max_attempts ]; do
        status_code=$(curl -k -s -o /dev/null -w "%{http_code}" \
            --connect-timeout 3 \
            --max-time 10 \
            --resolve "$domain:443:127.0.0.1" \
            "https://$domain/api/health" || true)

        if [ "$status_code" = "200" ]; then
            log "PocketBase API is reachable via $domain ✓"
            return 0
        fi

        attempt=$((attempt + 1))
        log "Waiting for PocketBase API via $domain (attempt $attempt/$max_attempts, status=$status_code)..."
        sleep 2
    done

    error "Smoke test failed: PocketBase API is not reachable through https://$domain/api/health (last status: $status_code)"
    return 1
}

probe_static_site_root() {
    local domain="$1"
    local headers_file="$2"
    local body_file="$3"
    local error_file="$4"

    curl -k -f -s -S -L \
        --connect-timeout 3 \
        --max-time 10 \
        --dump-header "$headers_file" \
        --output "$body_file" \
        --resolve "$domain:80:127.0.0.1" \
        --resolve "$domain:443:127.0.0.1" \
        "http://$domain/" > /dev/null 2>"$error_file"
}

response_content_type() {
    local headers_file="$1"

    grep -i '^content-type:' "$headers_file" | tail -n 1 | cut -d ':' -f 2- | sed 's/^[[:space:]]*//; s/\r$//' | tr '[:upper:]' '[:lower:]'
}

body_looks_like_html() {
    local body_file="$1"

    grep -qiE '<!doctype html>|<html[[:space:]>]' "$body_file"
}

body_looks_like_json() {
    local body_file="$1"

    grep -qE '^[[:space:]]*[\[{]' "$body_file"
}

android_app_link_association_enabled() {
    [ -n "${FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS:-}" ]
}

response_preview() {
    local body_file="$1"

    LC_ALL=C head -c 200 "$body_file" | tr '\r\n' '  '
}

validate_app_link_association_file() {
    local build_dir="$1"
    local relative_path="$2"
    local file_path="$build_dir/$relative_path"

    if [ ! -f "$file_path" ]; then
        error "Missing app-link association file: $file_path"
        error "Set the required app-link association secret for the $ENVIRONMENT environment before deploying."
        return 1
    fi

    if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$file_path" >/dev/null 2>&1; then
        error "Invalid JSON in app-link association file: $file_path"
        return 1
    fi
}

validate_app_link_associations() {
    local build_dir="$1"

    validate_app_link_association_file "$build_dir" ".well-known/apple-app-site-association" || return 1

    if android_app_link_association_enabled; then
        validate_app_link_association_file "$build_dir" ".well-known/assetlinks.json" || return 1
    else
        log "Skipping Android app-link association validation; FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS is not set."
    fi
}

probe_app_link_association() {
    local domain="$1"
    local path="$2"
    local headers_file="$3"
    local body_file="$4"
    local error_file="$5"

    curl -k -f -s -S -L \
        --connect-timeout 3 \
        --max-time 10 \
        --dump-header "$headers_file" \
        --output "$body_file" \
        --resolve "$domain:80:127.0.0.1" \
        --resolve "$domain:443:127.0.0.1" \
        "http://$domain$path" > /dev/null 2>"$error_file"
}

smoke_test_app_link_associations() {
    local domain="$1"
    local path
    local paths=("/.well-known/apple-app-site-association")

    if android_app_link_association_enabled; then
        paths+=("/.well-known/assetlinks.json")
    else
        log "Skipping Android app-link association smoke test; FOOD_TRACKER_ANDROID_SHA256_CERT_FINGERPRINTS is not set."
    fi

    for path in "${paths[@]}"; do
        local headers_file
        local body_file
        local error_file
        local content_type
        local preview

        headers_file=$(mktemp)
        body_file=$(mktemp)
        error_file=$(mktemp)

        if ! probe_app_link_association "$domain" "$path" "$headers_file" "$body_file" "$error_file"; then
            local curl_error
            curl_error=$(tr '\r\n' ' ' < "$error_file" | sed 's/[[:space:]]\+/ /g')
            rm -f "$headers_file" "$body_file" "$error_file"
            error "Smoke test failed: app-link association path is not reachable for $domain$path"
            if [ -n "$curl_error" ]; then
                error "curl: $curl_error"
            fi
            return 1
        fi

        content_type=$(response_content_type "$headers_file")
        if body_looks_like_html "$body_file" || ! body_looks_like_json "$body_file"; then
            preview=$(response_preview "$body_file")
            rm -f "$headers_file" "$body_file" "$error_file"
            error "Smoke test failed: $domain$path did not serve association JSON (content-type: ${content_type:-unknown})"
            if [ -n "$preview" ]; then
                error "Response preview: $preview"
            fi
            return 1
        fi

        if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$body_file" >/dev/null 2>&1; then
            preview=$(response_preview "$body_file")
            rm -f "$headers_file" "$body_file" "$error_file"
            error "Smoke test failed: $domain$path returned invalid JSON"
            if [ -n "$preview" ]; then
                error "Response preview: $preview"
            fi
            return 1
        fi

        rm -f "$headers_file" "$body_file" "$error_file"
    done

    log "App-link association files are reachable via $domain ✓"
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

    if ! run_sudo "$PRIVILEGED_HELPER" caddy-reload; then
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
        local headers_file
        local body_file
        local error_file
        local content_type
        local preview
        domain=$(site_domain "$site_key")
        headers_file=$(mktemp)
        body_file=$(mktemp)
        error_file=$(mktemp)

        if ! probe_static_site_root "$domain" "$headers_file" "$body_file" "$error_file"; then
            local curl_error
            curl_error=$(tr '\r\n' ' ' < "$error_file" | sed 's/[[:space:]]\+/ /g')
            rm -f "$headers_file" "$body_file" "$error_file"
            error "Smoke test failed: $(site_label "$site_key") is not reachable for $domain"
            if [ -n "$curl_error" ]; then
                error "curl: $curl_error"
            fi
            return 1
        fi

        content_type=$(response_content_type "$headers_file")
        if ! body_looks_like_html "$body_file" && [[ "$content_type" != text/html* && "$content_type" != application/xhtml+xml* ]]; then
            preview=$(response_preview "$body_file")
            rm -f "$headers_file" "$body_file" "$error_file"
            error "Smoke test failed: $(site_label "$site_key") is not serving HTML for $domain (content-type: ${content_type:-unknown})"
            if [ -n "$preview" ]; then
                error "Response preview: $preview"
            fi
            return 1
        fi

        rm -f "$headers_file" "$body_file" "$error_file"
    done

    if ! pocketbase_domain_health_check "$POCKETBASE_DOMAIN"; then
        return 1
    fi

    if ! smoke_test_app_link_associations "$APP_DOMAIN"; then
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

compute_static_artifact_digest() {
    local artifact_root="${1:-$APP_DIR}"
    local artifact_manifest
    local artifact_paths
    local site_key
    artifact_manifest=$(mktemp)
    artifact_paths=$(mktemp)

    for site_key in $(site_keys); do
        local build_dir
        local source_dir
        build_dir=$(site_build_dir "$site_key")
        source_dir="$artifact_root/$build_dir"
        if [ ! -d "$source_dir" ]; then
            rm -f "$artifact_manifest" "$artifact_paths"
            error "Static artifact directory is missing: $source_dir"
            return 1
        fi
        find "$source_dir" -type f -print | while IFS= read -r artifact_path; do
            printf '%s\t%s\n' "$build_dir/${artifact_path#"$source_dir"/}" "$artifact_path"
        done
    done > "$artifact_paths"

    LC_ALL=C sort "$artifact_paths" | while IFS=$'\t' read -r relative_path artifact_path; do
        printf '%s  %s\n' "$(sha256sum "$artifact_path" | awk '{print $1}')" "$relative_path"
    done > "$artifact_manifest"

    local digest
    digest=$(sha256sum "$artifact_manifest" | awk '{print $1}')
    rm -f "$artifact_manifest" "$artifact_paths"
    printf '%s\n' "$digest"
}

compute_backend_mount_digest() {
    local source_root="$1"
    local artifact_manifest
    artifact_manifest=$(mktemp)

    for mount_dir in pb_migrations pb_hooks pb_public; do
        local source_dir="$source_root/$mount_dir"
        if [ ! -d "$source_dir" ]; then
            continue
        fi
        if find "$source_dir" -type l -print -quit | grep -q .; then
            rm -f "$artifact_manifest"
            error "Backend mount artifact contains a symbolic link: $source_dir"
            return 1
        fi
        find "$source_dir" -type f -print
    done | LC_ALL=C sort | while IFS= read -r artifact_path; do
        local relative_path="${artifact_path#"$source_root"/}"
        printf '%s  %s\n' "$(sha256sum "$artifact_path" | awk '{print $1}')" "$relative_path"
    done > "$artifact_manifest"

    local digest
    digest=$(sha256sum "$artifact_manifest" | awk '{print $1}')
    rm -f "$artifact_manifest"
    printf '%s\n' "$digest"
}

record_deployment_provenance() {
    step "Recording deployment provenance ($ENVIRONMENT)..."

    local static_digest
    local backend_mount_digest
    local backend_image
    local provenance_tmp
    static_digest=$(compute_static_artifact_digest)
    backend_mount_digest=$(compute_backend_mount_digest "$APP_DIR/backend")

    backend_image=$(docker inspect --format '{{.Image}}' "$POCKETBASE_CONTAINER")
    if [[ ! "$backend_image" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        error "Could not resolve an immutable PocketBase image digest (found: ${backend_image:-none})"
        exit 1
    fi

    DEPLOYMENT_DIGEST=$(printf 'approved_sha=%s\nstatic_sha256=%s\nbackend_mount_sha256=%s\nbackend_image=%s\n' \
        "$APPROVED_SHA" "$static_digest" "$backend_mount_digest" "$backend_image" | sha256sum | awk '{print $1}')

    provenance_tmp=$(mktemp "$BACKUP_DIR/.current-provenance.XXXXXX")
    {
        printf 'approved_sha=%s\n' "$APPROVED_SHA"
        printf 'deployment_digest=sha256:%s\n' "$DEPLOYMENT_DIGEST"
        printf 'static_digest=sha256:%s\n' "$static_digest"
        printf 'backend_mount_digest=sha256:%s\n' "$backend_mount_digest"
        printf 'backend_image=%s\n' "$backend_image"
        printf 'deployed_at=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    } > "$provenance_tmp"
    chmod 600 "$provenance_tmp"
    mv "$provenance_tmp" "$PROVENANCE_FILE"

    log "Approved commit: $APPROVED_SHA"
    log "Deployment artifact: sha256:$DEPLOYMENT_DIGEST"
}

print_summary() {
    local db_size
    local git_commit
    local backup_location
    db_size=$(du -sh "$APP_DIR/backend/pb_data_${ENVIRONMENT}/" 2>/dev/null | cut -f1 || echo 'N/A')
    git_commit=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo 'N/A')
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
    echo "  - Approved commit: ${APPROVED_SHA:-N/A}"
    echo "  - Deployment artifact: ${DEPLOYMENT_DIGEST:+sha256:$DEPLOYMENT_DIGEST}"
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
    trap cleanup EXIT
    trap handle_interrupt INT
    trap 'handle_signal TERM 143' TERM
    trap 'handle_signal HUP 129' HUP
    trap 'handle_signal QUIT 131' QUIT

    acquire_lock
    verify_approved_source

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

    ensure_privileged_helper
    verify_rollback_baseline
    preflight_checks
    create_backup
    install_workspace_dependencies
    build_web_surfaces
    prepare_static_sites
    deploy_static_sites
    sync_production_caddy_config
    reload_caddy

    local site_key
    for site_key in $(site_keys); do
        health_check_static_site "$site_key"
    done

    configure_backend
    deploy_pocketbase
    health_check_pocketbase
    smoke_test
    record_deployment_provenance
    cleanup_old_builds
    clear_caddy_rollback
    print_summary
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
