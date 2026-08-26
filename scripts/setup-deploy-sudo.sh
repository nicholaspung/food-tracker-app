#!/bin/bash

#####################################################################
# Setup Passwordless Sudo for Deploy User
#
# This script configures passwordless sudo access for the deploy user
# to run Caddy-related commands and backup operations needed for
# automated GitHub Actions deployments.
#
# IMPORTANT: Run this script on your VPS as root or with sudo access
#
# Usage:
#   sudo bash setup-deploy-sudo.sh [deploy-username] [beta|production]
#
# Example:
#   sudo bash setup-deploy-sudo.sh deploy production
#####################################################################

set -e  # Exit on any error

# Configuration
DEPLOY_USER="${1:-deploy}"
DEPLOY_ENVIRONMENT="${2:-}"
SUDOERS_FILE="/etc/sudoers.d/${DEPLOY_USER}-${DEPLOY_ENVIRONMENT}-deployment"
LEGACY_SUDOERS_FILE="/etc/sudoers.d/${DEPLOY_USER}-deployment"
PRIVILEGED_HELPER="/usr/local/sbin/food-tracker-deploy-privileged"
PRODUCTION_LAUNCHER="/usr/local/sbin/food-tracker-production-deploy"
BACKUP_DIRECTORY="/opt/food-tracker-backups/${DEPLOY_ENVIRONMENT}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root or with sudo"
   echo "Usage: sudo bash $0 [deploy-username] [beta|production]"
   exit 1
fi

if [[ "$DEPLOY_ENVIRONMENT" != "beta" && "$DEPLOY_ENVIRONMENT" != "production" ]]; then
    log_error "Environment must be 'beta' or 'production'"
    echo "Usage: sudo bash $0 [deploy-username] [beta|production]"
    exit 1
fi

# Check if deploy user exists
if ! id "$DEPLOY_USER" &>/dev/null; then
    log_error "User '$DEPLOY_USER' does not exist"
    exit 1
fi

if [ "$DEPLOY_ENVIRONMENT" = "beta" ] && id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
    log_error "Beta deploy user must not belong to the root-equivalent docker group"
    log_error "Configure rootless Docker for $DEPLOY_USER before provisioning Beta grants"
    exit 1
fi

log_info "Setting up passwordless sudo for user: $DEPLOY_USER"

# The Production launcher must persist baseline provenance before repository
# deployment code can call the privileged helper. Provision this directory now
# so fresh hosts and deploy-account migrations can start fail-closed.
mkdir -p "$BACKUP_DIRECTORY"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$BACKUP_DIRECTORY"
chown root:root /opt/food-tracker-backups
chmod 0711 /opt/food-tracker-backups
chmod 0700 "$BACKUP_DIRECTORY"
log_info "Prepared deployment backup directory: $BACKUP_DIRECTORY"

# Install a root-owned, fixed-argument helper so sudoers never needs wildcards.
log_info "Installing privileged deployment helper at: $PRIVILEGED_HELPER"

cat > "$PRIVILEGED_HELPER" << 'EOF'
#!/usr/bin/env bash

set -euo pipefail

readonly DEPLOY_USER="${SUDO_USER:?SUDO_USER is required}"
readonly CADDY_CONFIG="/etc/caddy/Caddyfile"
readonly CADDY_CONFIG_NEW="/etc/caddy/Caddyfile.food-tracker-new"
readonly CADDY_ROLLBACK="/etc/caddy/Caddyfile.food-tracker-rollback"
readonly CADDY_ROLLBACK_NEW="/etc/caddy/Caddyfile.food-tracker-rollback.new"

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <approved-operation>" >&2
    exit 2
fi

case "$1" in
    caddy-validate-repo-beta)
        exec /usr/bin/caddy validate --config /opt/food-tracker-app/Caddyfile --adapter caddyfile
        ;;
    caddy-validate-repo-production)
        exec /usr/bin/caddy validate --config /opt/food-tracker-app-production/Caddyfile --adapter caddyfile
        ;;
    caddy-validate-live)
        exec /usr/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
        ;;
    caddy-install-production)
        /bin/rm -f "$CADDY_CONFIG_NEW"
        /usr/bin/install -o root -g root -m 0644 /opt/food-tracker-app-production/Caddyfile "$CADDY_CONFIG_NEW"
        exec /bin/mv "$CADDY_CONFIG_NEW" "$CADDY_CONFIG"
        ;;
    caddy-backup-live)
        if [ -e "$CADDY_ROLLBACK" ]; then
            echo "Refusing to overwrite an existing Caddy rollback snapshot" >&2
            exit 3
        fi
        /bin/rm -f "$CADDY_ROLLBACK_NEW"
        /usr/bin/install -o root -g root -m 0600 "$CADDY_CONFIG" "$CADDY_ROLLBACK_NEW"
        exec /bin/mv "$CADDY_ROLLBACK_NEW" "$CADDY_ROLLBACK"
        ;;
    caddy-backup-exists)
        exec /usr/bin/test -f "$CADDY_ROLLBACK"
        ;;
    caddy-restore-live)
        /bin/rm -f "$CADDY_CONFIG_NEW"
        /usr/bin/install -o root -g root -m 0644 "$CADDY_ROLLBACK" "$CADDY_CONFIG_NEW"
        exec /bin/mv "$CADDY_CONFIG_NEW" "$CADDY_CONFIG"
        ;;
    caddy-clear-backup)
        exec /bin/rm -f "$CADDY_ROLLBACK" "$CADDY_ROLLBACK_NEW" "$CADDY_CONFIG_NEW"
        ;;
    caddy-reload)
        exec /bin/systemctl reload caddy
        ;;
    prepare-caddy-assets-production)
        readonly production_root="/opt/food-tracker-app-production"

        # Keep source, Git metadata, logs, and data deploy-owner-only. Caddy gets
        # traversal at the root plus read access to the explicit build paths.
        /usr/bin/find "$production_root" -mindepth 1 -maxdepth 1 \
            \( \
                -path "$production_root/marketing_build" -o \
                -path "$production_root/marketing_build_new" -o \
                -path "$production_root/marketing_build_old" -o \
                -path "$production_root/app_build" -o \
                -path "$production_root/app_build_new" -o \
                -path "$production_root/app_build_old" -o \
                -path "$production_root/admin_build" -o \
                -path "$production_root/admin_build_new" -o \
                -path "$production_root/admin_build_old" \
            \) -prune -o \
            -type d -exec /bin/chgrp "$DEPLOY_USER" {} + -exec /bin/chmod o-rwx {} + -o \
            -type f -exec /bin/chgrp "$DEPLOY_USER" {} + -exec /bin/chmod o-rwx {} +

        /bin/chgrp caddy /opt/food-tracker-app-production
        /bin/chmod 0750 /opt/food-tracker-app-production
        for build_dir in marketing_build app_build admin_build; do
            for suffix in "" _new _old; do
                build_path="$production_root/${build_dir}${suffix}"
                if [ ! -e "$build_path" ]; then
                    continue
                fi
                if [ -L "$build_path" ] || [ ! -d "$build_path" ] || [ ! -f "$build_path/index.html" ]; then
                    echo "Production static build is unsafe or incomplete: $build_path" >&2
                    exit 1
                fi
                if /usr/bin/find "$build_path" -type l -print -quit | /usr/bin/grep -q .; then
                    echo "Production static build contains a symbolic link: $build_path" >&2
                    exit 1
                fi
                /usr/bin/find "$build_path" -type d -exec /bin/chgrp caddy {} + -exec /bin/chmod 0750 {} +
                /usr/bin/find "$build_path" -type f -exec /bin/chgrp caddy {} + -exec /bin/chmod 0640 {} +
            done
        done
        ;;
    prepare-backups-beta | repair-backups-beta)
        /bin/mkdir -p /opt/food-tracker-backups/beta
        /bin/chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/food-tracker-backups/beta
        /bin/chown root:root /opt/food-tracker-backups
        /bin/chmod 711 /opt/food-tracker-backups
        exec /bin/chmod 700 /opt/food-tracker-backups/beta
        ;;
    prepare-backups-production | repair-backups-production)
        /bin/mkdir -p /opt/food-tracker-backups/production
        /bin/chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/food-tracker-backups/production
        /bin/chown root:root /opt/food-tracker-backups
        /bin/chmod 711 /opt/food-tracker-backups
        exec /bin/chmod 700 /opt/food-tracker-backups/production
        ;;
    prepare-secrets-beta)
        /bin/mkdir -p /opt/food-tracker-secrets/beta
        /bin/chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/food-tracker-secrets/beta
        /bin/chown root:root /opt/food-tracker-secrets
        /bin/chmod 711 /opt/food-tracker-secrets
        exec /bin/chmod 700 /opt/food-tracker-secrets/beta
        ;;
    prepare-secrets-production)
        /bin/mkdir -p /opt/food-tracker-secrets/production
        /bin/chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/food-tracker-secrets/production
        /bin/chown root:root /opt/food-tracker-secrets
        /bin/chmod 711 /opt/food-tracker-secrets
        exec /bin/chmod 700 /opt/food-tracker-secrets/production
        ;;
    *)
        echo "Unsupported privileged deployment operation: $1" >&2
        exit 2
        ;;
esac
EOF

chown root:root "$PRIVILEGED_HELPER"
chmod 0755 "$PRIVILEGED_HELPER"

cat > "$PRODUCTION_LAUNCHER" << 'EOF'
#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly APP_DIRECTORY="/opt/food-tracker-app-production"
readonly DEPLOY_ENV_FILE="/opt/food-tracker-secrets/production/deploy.env"
readonly LOCK_FILE="/tmp/food-tracker-deploy-production.lock"
readonly PROVENANCE_FILE="/opt/food-tracker-backups/production/current-provenance.env"
BACKEND_MOUNT_STAGING=""

compute_backend_mount_digest() {
    local source_root="$1"
    local artifact_manifest
    artifact_manifest=$(mktemp)

    for mount_dir in pb_migrations pb_hooks pb_public; do
        source_dir="$source_root/$mount_dir"
        if [ ! -d "$source_dir" ]; then
            continue
        fi
        if find "$source_dir" -type l -print -quit | grep -q .; then
            rm -f "$artifact_manifest"
            echo "Backend mount artifact contains a symbolic link: $source_dir" >&2
            return 1
        fi
        find "$source_dir" -type f -print
    done | LC_ALL=C sort | while IFS= read -r artifact_path; do
        relative_path="${artifact_path#"$source_root"/}"
        printf '%s  %s\n' "$(sha256sum "$artifact_path" | awk '{print $1}')" "$relative_path"
    done > "$artifact_manifest"

    local digest
    digest=$(sha256sum "$artifact_manifest" | awk '{print $1}')
    rm -f "$artifact_manifest"
    printf '%s\n' "$digest"
}

copy_backend_mounts() {
    local source_root="$1"
    local destination_root="$2"
    mkdir -p "$destination_root"
    for mount_dir in pb_migrations pb_hooks pb_public; do
        if [ -d "$source_root/$mount_dir" ]; then
            cp -a "$source_root/$mount_dir" "$destination_root/$mount_dir"
        fi
    done
}

cleanup_staging() {
    if [ -n "$BACKEND_MOUNT_STAGING" ] && [ -d "$BACKEND_MOUNT_STAGING" ]; then
        case "$BACKEND_MOUNT_STAGING" in
            "$(dirname "$PROVENANCE_FILE")"/.backend-mount-staging.*)
                rm -rf "$BACKEND_MOUNT_STAGING"
                ;;
            *)
                echo "Refusing to remove unexpected backend staging path: $BACKEND_MOUNT_STAGING" >&2
                ;;
        esac
    fi
}

cleanup_lock() {
    if [ -f "$LOCK_FILE" ] && [ "$(cat "$LOCK_FILE" 2>/dev/null || true)" = "$$" ]; then
        rm -f "$LOCK_FILE"
    fi
}

cleanup_launcher() {
    cleanup_staging
    cleanup_lock
}

seed_current_provenance() {
    if [ -f "$PROVENANCE_FILE" ]; then
        return
    fi

    local current_sha
    local backend_image
    local artifact_manifest
    local static_digest
    local backend_mount_digest
    local deployment_digest
    local provenance_tmp
    current_sha=$(git -C "$APP_DIRECTORY" rev-parse HEAD 2>/dev/null || true)
    backend_image=$(docker inspect --format '{{.Image}}' pocketbase 2>/dev/null || true)

    if [[ ! "$current_sha" =~ ^[0-9a-f]{40}$ ]] || [[ ! "$backend_image" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        echo "Cannot seed Production rollback provenance without a current commit and running immutable image." >&2
        exit 1
    fi

    if [ ! -d "$(dirname "$PROVENANCE_FILE")" ]; then
        echo "Production backup directory is missing: $(dirname "$PROVENANCE_FILE")" >&2
        exit 1
    fi

    artifact_manifest=$(mktemp)
    for build_dir in marketing_build app_build admin_build; do
        if [ ! -f "$APP_DIRECTORY/$build_dir/index.html" ]; then
            rm -f "$artifact_manifest"
            echo "Cannot seed Production rollback provenance without $build_dir/index.html." >&2
            exit 1
        fi
        find "$APP_DIRECTORY/$build_dir" -type f -print
    done | LC_ALL=C sort | while IFS= read -r artifact_path; do
        relative_path="${artifact_path#"$APP_DIRECTORY"/}"
        printf '%s  %s\n' "$(sha256sum "$artifact_path" | awk '{print $1}')" "$relative_path"
    done > "$artifact_manifest"

    static_digest=$(sha256sum "$artifact_manifest" | awk '{print $1}')
    backend_mount_digest=$(compute_backend_mount_digest "$APP_DIRECTORY/backend")
    rm -f "$artifact_manifest"
    deployment_digest=$(printf 'approved_sha=%s\nstatic_sha256=%s\nbackend_mount_sha256=%s\nbackend_image=%s\n' \
        "$current_sha" "$static_digest" "$backend_mount_digest" "$backend_image" | sha256sum | awk '{print $1}')

    provenance_tmp=$(mktemp "$(dirname "$PROVENANCE_FILE")/.current-provenance.XXXXXX")
    {
        printf 'approved_sha=%s\n' "$current_sha"
        printf 'deployment_digest=sha256:%s\n' "$deployment_digest"
        printf 'static_digest=sha256:%s\n' "$static_digest"
        printf 'backend_mount_digest=sha256:%s\n' "$backend_mount_digest"
        printf 'backend_image=%s\n' "$backend_image"
        printf 'deployed_at=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    } > "$provenance_tmp"
    chmod 600 "$provenance_tmp"
    mv "$provenance_tmp" "$PROVENANCE_FILE"
    echo "Seeded Production rollback provenance for commit $current_sha."
}

trap cleanup_launcher EXIT

if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
    echo "Production deploy key does not accept remote commands." >&2
    exit 1
fi

if ! IFS= read -r approved_sha || [[ ! "$approved_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Production deploy requires one full approved commit SHA on stdin." >&2
    exit 1
fi

if IFS= read -r extra_input; then
    echo "Production deploy received unexpected input after the approved SHA." >&2
    exit 1
fi

if [ -f "$LOCK_FILE" ]; then
    existing_pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
    if [[ "$existing_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$existing_pid" 2>/dev/null; then
        rm -f "$LOCK_FILE"
    fi
fi

if ! (set -o noclobber; printf '%s\n' "$$" > "$LOCK_FILE") 2>/dev/null; then
    echo "Production deployment already in progress." >&2
    exit 1
fi

if [ ! -r "$DEPLOY_ENV_FILE" ]; then
    echo "Production deploy environment is not readable: $DEPLOY_ENV_FILE" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090 -- this provisioned path is intentionally fixed.
source "$DEPLOY_ENV_FILE"
set +a

cd "$APP_DIRECTORY"
git fetch --no-tags origin "$approved_sha"
git cat-file -e "${approved_sha}^{commit}"

if ! git diff --quiet HEAD -- . \
    ':(exclude)backend/pb_migrations' ':(exclude)backend/pb_migrations/**' \
    ':(exclude)backend/pb_hooks' ':(exclude)backend/pb_hooks/**' \
    ':(exclude)backend/pb_public' ':(exclude)backend/pb_public/**'; then
    echo "Production checkout contains source changes before approved source selection." >&2
    exit 1
fi
while IFS= read -r untracked_path; do
    case "$untracked_path" in
        backend/pb_migrations/*|backend/pb_hooks/*|backend/pb_public/*) ;;
        *)
            echo "Production checkout contains untracked source before approved source selection: $untracked_path" >&2
            exit 1
            ;;
    esac
done < <(git ls-files --others --exclude-standard)

seed_current_provenance

BACKEND_MOUNT_STAGING=$(mktemp -d "$(dirname "$PROVENANCE_FILE")/.backend-mount-staging.XXXXXX")
mkdir -p "$BACKEND_MOUNT_STAGING/live/backend"
copy_backend_mounts "$APP_DIRECTORY/backend" "$BACKEND_MOUNT_STAGING/live/backend"
live_backend_mount_digest=$(compute_backend_mount_digest "$APP_DIRECTORY/backend")
staged_live_backend_mount_digest=$(compute_backend_mount_digest "$BACKEND_MOUNT_STAGING/live/backend")
if [ "$live_backend_mount_digest" != "$staged_live_backend_mount_digest" ]; then
    echo "Could not preserve the live Production backend mount artifact." >&2
    exit 1
fi
if [ -f "$APP_DIRECTORY/docker-compose.yml" ]; then
    cp "$APP_DIRECTORY/docker-compose.yml" "$BACKEND_MOUNT_STAGING/live/docker-compose.yml"
fi

# Update every approved source path except the live directories currently bind-mounted
# into PocketBase. Moving HEAD and the index separately leaves those mounts untouched.
git restore --source="$approved_sha" --worktree -- . \
    ':(exclude)backend/pb_migrations' ':(exclude)backend/pb_migrations/**' \
    ':(exclude)backend/pb_hooks' ':(exclude)backend/pb_hooks/**' \
    ':(exclude)backend/pb_public' ':(exclude)backend/pb_public/**'
git update-ref --no-deref HEAD "$approved_sha"
git read-tree "$approved_sha"
git clean -fd \
    -e backend/pb_migrations/ \
    -e backend/pb_hooks/ \
    -e backend/pb_public/

actual_sha=$(git rev-parse HEAD)
if [ "$actual_sha" != "$approved_sha" ]; then
    echo "Production checkout mismatch: approved $approved_sha, selected $actual_sha." >&2
    exit 1
fi

export FOOD_TRACKER_DEPLOY_SHA="$approved_sha"
export FOOD_TRACKER_DEPLOY_LOCK_OWNER="$$"
export FOOD_TRACKER_APP_DIR="$APP_DIRECTORY"
export FOOD_TRACKER_BACKEND_MOUNT_STAGING="$BACKEND_MOUNT_STAGING"
export FOOD_TRACKER_STAGED_BACKEND_MOUNT_DIGEST="$staged_live_backend_mount_digest"
exec bash "$APP_DIRECTORY/scripts/deploy.sh" production
EOF

chown root:root "$PRODUCTION_LAUNCHER"
chmod 0755 "$PRODUCTION_LAUNCHER"

# Create sudoers file
log_info "Creating sudoers configuration at: $SUDOERS_FILE"

cat > "$SUDOERS_FILE" << EOF
# Passwordless sudo configuration for automated deployments
# User: $DEPLOY_USER
# Environment: $DEPLOY_ENVIRONMENT
# Created: $(date)

# Fixed privileged deployment operations. Arguments must match exactly.
$DEPLOY_USER ALL=(root) NOPASSWD: $PRIVILEGED_HELPER caddy-validate-repo-$DEPLOY_ENVIRONMENT
$DEPLOY_USER ALL=(root) NOPASSWD: $PRIVILEGED_HELPER caddy-validate-live
$DEPLOY_USER ALL=(root) NOPASSWD: $PRIVILEGED_HELPER caddy-reload
$DEPLOY_USER ALL=(root) NOPASSWD: $PRIVILEGED_HELPER prepare-backups-$DEPLOY_ENVIRONMENT
$DEPLOY_USER ALL=(root) NOPASSWD: $PRIVILEGED_HELPER repair-backups-$DEPLOY_ENVIRONMENT
$DEPLOY_USER ALL=(root) NOPASSWD: $PRIVILEGED_HELPER prepare-secrets-$DEPLOY_ENVIRONMENT

EOF

if [ "$DEPLOY_ENVIRONMENT" = "production" ]; then
    for operation in caddy-install-production caddy-backup-live caddy-backup-exists caddy-restore-live caddy-clear-backup prepare-caddy-assets-production; do
        printf '%s\n' "$DEPLOY_USER ALL=(root) NOPASSWD: $PRIVILEGED_HELPER $operation" >> "$SUDOERS_FILE"
    done
fi

# Set proper permissions (must be 0440 or 0400)
chmod 0440 "$SUDOERS_FILE"
log_info "Set permissions to 0440 on sudoers file"

# Validate sudoers syntax
log_info "Validating sudoers syntax..."
if visudo -c -f "$SUDOERS_FILE"; then
    log_info "Sudoers syntax is valid"
else
    log_error "Sudoers syntax validation failed!"
    log_error "Removing invalid sudoers file..."
    rm -f "$SUDOERS_FILE"
    exit 1
fi

# Remove legacy and opposite-environment policies only after the replacement validates.
if [ "$DEPLOY_ENVIRONMENT" = "beta" ]; then
    OPPOSITE_SUDOERS_FILE="/etc/sudoers.d/${DEPLOY_USER}-production-deployment"
else
    OPPOSITE_SUDOERS_FILE="/etc/sudoers.d/${DEPLOY_USER}-beta-deployment"
fi
rm -f "$LEGACY_SUDOERS_FILE" "$OPPOSITE_SUDOERS_FILE"

# Test sudo access
log_info "Testing passwordless sudo access..."
if sudo -u "$DEPLOY_USER" sudo -n "$PRIVILEGED_HELPER" caddy-validate-live >/dev/null 2>&1; then
    log_info "Passwordless sudo is working correctly!"
else
    log_warn "Could not validate the live Caddyfile with the privileged helper"
    log_warn "You can test manually with: sudo -u $DEPLOY_USER sudo $PRIVILEGED_HELPER caddy-validate-live"
fi

echo ""
log_info "=========================================="
log_info "Passwordless sudo setup complete!"
log_info "=========================================="
echo ""
log_info "The deploy user '$DEPLOY_USER' can now run the fixed deployment helper operations without a password."
echo ""
log_info "GitHub Actions deployments should now work without password prompts."
echo ""

# Display the sudoers file for verification
log_info "Sudoers configuration:"
cat "$SUDOERS_FILE"
