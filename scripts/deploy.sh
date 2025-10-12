#!/bin/bash
# Production Deployment Script for Mobile Tracker App
# Features: Blue-green deployment, rollback, health checks, error handling, backups
# Supports beta and production environments

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment argument (default: production)
ENVIRONMENT="${1:-production}"

# Validate environment
if [[ "$ENVIRONMENT" != "beta" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}ERROR: Invalid environment. Use 'beta' or 'production'${NC}"
    echo "Usage: $0 [beta|production]"
    exit 1
fi

# Configuration based on environment
APP_DIR="/opt/mobile-tracker-app"
LOG_FILE="/var/log/mobile-tracker-deploy-${ENVIRONMENT}.log"
LOCK_FILE="/tmp/mobile-tracker-deploy-${ENVIRONMENT}.lock"
BACKUP_DIR="/opt/mobile-tracker-backups/${ENVIRONMENT}"
MAX_BACKUPS=5

# Environment-specific configuration
if [[ "$ENVIRONMENT" == "beta" ]]; then
    POCKETBASE_PORT="8091"
    POCKETBASE_CONTAINER="pocketbase_beta"
    POCKETBASE_SERVICE="pocketbase_beta"
    FRONTEND_BUILD_DIR="frontend_build_beta"
    COMPOSE_FILE="docker-compose.beta.yml"
    DOMAIN="beta.myexperiment.life"
else
    POCKETBASE_PORT="8090"
    POCKETBASE_CONTAINER="pocketbase"
    POCKETBASE_SERVICE="pocketbase"
    FRONTEND_BUILD_DIR="frontend_build"
    COMPOSE_FILE="docker-compose.yml"
    DOMAIN="myexperiment.life"
fi

#######################
# LOGGING
#######################
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

#######################
# CLEANUP & ROLLBACK
#######################
cleanup() {
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        error "Deployment failed with exit code $exit_code"
        rollback
    fi

    # Remove lock file
    rm -f "$LOCK_FILE"

    exit $exit_code
}

rollback() {
    warn "Initiating rollback for $ENVIRONMENT environment..."

    cd "$APP_DIR"

    # Rollback frontend if old version exists
    if [ -d "${FRONTEND_BUILD_DIR}_old" ]; then
        log "Rolling back frontend to previous version..."
        rm -rf "${FRONTEND_BUILD_DIR}_new" 2>/dev/null || true
        rm -rf "$FRONTEND_BUILD_DIR" 2>/dev/null || true
        mv "${FRONTEND_BUILD_DIR}_old" "$FRONTEND_BUILD_DIR"

        # Reload Caddy to serve old frontend
        sudo systemctl reload caddy
        log "Frontend rolled back successfully"
    fi

    # Rollback PocketBase if backup exists
    if [ -f "$BACKUP_DIR/latest/$COMPOSE_FILE" ]; then
        log "Rolling back PocketBase container..."
        docker compose -f "$COMPOSE_FILE" down "$POCKETBASE_SERVICE"
        cp "$BACKUP_DIR/latest/$COMPOSE_FILE" "$APP_DIR/$COMPOSE_FILE"
        docker compose -f "$COMPOSE_FILE" up -d "$POCKETBASE_SERVICE"
        log "PocketBase rolled back successfully"
    fi

    error "Rollback complete. System restored to previous state."
}

trap cleanup EXIT INT TERM

#######################
# PRE-FLIGHT CHECKS
#######################
preflight_checks() {
    step "Running pre-flight checks..."

    # Check for deployment lock
    if [ -f "$LOCK_FILE" ]; then
        error "Deployment already in progress (lock file exists: $LOCK_FILE)"
        error "If no deployment is running, remove the lock file manually"
        exit 1
    fi

    # Create lock file
    echo $$ > "$LOCK_FILE"

    # Check required commands
    for cmd in git npm docker systemctl; do
        if ! command -v $cmd &> /dev/null; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done

    # Check Docker Compose (V2 plugin)
    if ! docker compose version &> /dev/null; then
        error "Docker Compose not found (requires Docker Compose V2)"
        exit 1
    fi

    # Check if app directory exists
    if [ ! -d "$APP_DIR" ]; then
        error "App directory does not exist: $APP_DIR"
        exit 1
    fi

    # Check disk space (require at least 1GB free)
    local available_space_kb=$(df "$APP_DIR" | awk 'NR==2 {print $4}')
    local available_space_mb=$((available_space_kb / 1024))
    if [ "$available_space_mb" -lt 1000 ]; then
        error "Insufficient disk space. Required: 1GB, Available: ${available_space_mb}MB"
        exit 1
    fi

    # Check if Caddy is running
    if ! systemctl is-active --quiet caddy; then
        error "Caddy is not running"
        exit 1
    fi

    # Check if PocketBase is running
    if ! docker ps | grep -q "$POCKETBASE_CONTAINER"; then
        error "PocketBase container ($POCKETBASE_CONTAINER) is not running"
        exit 1
    fi

    log "Pre-flight checks passed for $ENVIRONMENT environment ✓"
}

#######################
# BACKUP
#######################
create_backup() {
    step "Creating backup before deployment ($ENVIRONMENT)..."

    local backup_timestamp=$(date +'%Y%m%d_%H%M%S')
    local backup_path="$BACKUP_DIR/$backup_timestamp"

    # Ensure backup directory exists with proper permissions
    if [ ! -d "$BACKUP_DIR" ]; then
        sudo mkdir -p "$BACKUP_DIR"
        sudo chown -R $USER:$USER /opt/mobile-tracker-backups
        sudo chmod 755 /opt/mobile-tracker-backups
    fi

    mkdir -p "$backup_path"

    # Backup current frontend build
    if [ -d "$APP_DIR/$FRONTEND_BUILD_DIR" ]; then
        cp -r "$APP_DIR/$FRONTEND_BUILD_DIR" "$backup_path/"
        log "Frontend backed up to $backup_path/$FRONTEND_BUILD_DIR"
    fi

    # Backup docker-compose file (to track PocketBase image version)
    if [ -f "$APP_DIR/$COMPOSE_FILE" ]; then
        cp "$APP_DIR/$COMPOSE_FILE" "$backup_path/"
    fi

    # Backup PocketBase data (database) - environment specific
    local pb_data_dir="backend/pb_data_${ENVIRONMENT}"
    if [ -d "$APP_DIR/$pb_data_dir" ]; then
        tar -czf "$backup_path/pb_data_backup.tar.gz" -C "$APP_DIR/backend" "pb_data_${ENVIRONMENT}"
        log "PocketBase data backed up to $backup_path/pb_data_backup.tar.gz"
    fi

    # Create symlink to latest backup
    rm -f "$BACKUP_DIR/latest"
    ln -s "$backup_path" "$BACKUP_DIR/latest"

    # Cleanup old backups (keep only MAX_BACKUPS)
    local backup_count=$(ls -1t "$BACKUP_DIR" | grep -E '^[0-9]{8}_[0-9]{6}$' | wc -l)
    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        log "Cleaning up old backups (keeping latest $MAX_BACKUPS)..."
        ls -1t "$BACKUP_DIR" | grep -E '^[0-9]{8}_[0-9]{6}$' | tail -n +$((MAX_BACKUPS + 1)) | while read -r old_backup; do
            rm -rf "$BACKUP_DIR/$old_backup"
            log "Removed old backup: $old_backup"
        done
    fi

    log "Backup created successfully ✓"
}

#######################
# GIT OPERATIONS
#######################
update_source_code() {
    step "Updating source code from Git..."

    cd "$APP_DIR"

    # Fetch latest changes
    git fetch origin

    # Check current branch
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    log "Current branch: $current_branch"

    # Get current commit before pull
    local old_commit=$(git rev-parse HEAD)

    # Pull latest changes
    if ! git pull origin "$current_branch"; then
        error "Git pull failed. Check for merge conflicts or network issues."
        exit 1
    fi

    local new_commit=$(git rev-parse HEAD)

    if [ "$old_commit" = "$new_commit" ]; then
        warn "No new commits. Source code is already up to date."
    else
        log "Updated from $old_commit to $new_commit"
    fi

    log "Source code updated ✓"
}

#######################
# BUILD FRONTEND
#######################
build_frontend() {
    step "Building frontend..."

    cd "$APP_DIR/frontend"

    # Clean install dependencies
    log "Installing dependencies..."
    if ! npm ci --production=false --loglevel=error 2>&1 | tee -a "$LOG_FILE"; then
        error "npm ci failed. Check package.json and package-lock.json"
        exit 1
    fi

    # Build frontend
    log "Running build..."
    if ! npm run build 2>&1 | tee -a "$LOG_FILE"; then
        error "npm run build failed. Check build logs above"
        exit 1
    fi

    # Verify build output exists
    if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
        error "Build succeeded but dist/ directory is missing or empty"
        exit 1
    fi

    # Verify critical files exist
    if [ ! -f "dist/index.html" ]; then
        error "Build succeeded but index.html is missing"
        exit 1
    fi

    local build_size=$(du -sh dist | cut -f1)
    log "Frontend built successfully ✓ (size: $build_size)"
}

#######################
# DEPLOY FRONTEND
#######################
deploy_frontend() {
    step "Deploying frontend with blue-green strategy ($ENVIRONMENT)..."

    cd "$APP_DIR"

    # Remove any leftover new build
    rm -rf "${FRONTEND_BUILD_DIR}_new"

    # Copy new build
    cp -r frontend/dist "${FRONTEND_BUILD_DIR}_new"

    # Verify copy succeeded
    if [ ! -d "${FRONTEND_BUILD_DIR}_new" ] || [ ! -f "${FRONTEND_BUILD_DIR}_new/index.html" ]; then
        error "Failed to copy build to ${FRONTEND_BUILD_DIR}_new"
        exit 1
    fi

    # Atomic swap: old -> _old, new -> current
    if [ -d "$FRONTEND_BUILD_DIR" ]; then
        # Move current to old (overwrites previous old)
        rm -rf "${FRONTEND_BUILD_DIR}_old"
        mv "$FRONTEND_BUILD_DIR" "${FRONTEND_BUILD_DIR}_old"
        log "Current build moved to ${FRONTEND_BUILD_DIR}_old"
    fi

    # Move new to current
    mv "${FRONTEND_BUILD_DIR}_new" "$FRONTEND_BUILD_DIR"
    log "New build moved to $FRONTEND_BUILD_DIR"

    # Verify the swap
    if [ ! -f "$FRONTEND_BUILD_DIR/index.html" ]; then
        error "Frontend swap failed - index.html not found in $FRONTEND_BUILD_DIR"
        exit 1
    fi

    log "Frontend deployed ✓"
}

#######################
# DEPLOY POCKETBASE
#######################
deploy_pocketbase() {
    step "Updating PocketBase container ($ENVIRONMENT)..."

    cd "$APP_DIR"

    # Build PocketBase image (custom image, not from Docker Hub)
    log "Building PocketBase image..."
    if ! docker compose -f "$COMPOSE_FILE" build "$POCKETBASE_SERVICE" 2>&1 | tee -a "$LOG_FILE"; then
        error "Failed to build PocketBase image"
        exit 1
    fi

    # Get current container ID before update
    local old_container=$(docker ps -qf "name=$POCKETBASE_CONTAINER")

    # Update container (recreates if image changed)
    if ! docker compose -f "$COMPOSE_FILE" up -d "$POCKETBASE_SERVICE"; then
        error "Failed to start PocketBase container"
        exit 1
    fi

    local new_container=$(docker ps -qf "name=$POCKETBASE_CONTAINER")

    if [ "$old_container" != "$new_container" ]; then
        log "PocketBase container recreated (new container ID: $new_container)"
    else
        log "PocketBase container unchanged"
    fi

    log "PocketBase updated ✓"
}

#######################
# HEALTH CHECKS
#######################
health_check_pocketbase() {
    step "Performing PocketBase health check ($ENVIRONMENT)..."

    local max_attempts=30
    local attempt=0
    local wait_time=2

    while [ $attempt -lt $max_attempts ]; do
        if docker compose -f "$COMPOSE_FILE" exec -T "$POCKETBASE_SERVICE" wget --spider -q http://localhost:$POCKETBASE_PORT/api/health 2>/dev/null; then
            log "PocketBase is healthy ✓"
            return 0
        fi

        attempt=$((attempt + 1))
        log "Waiting for PocketBase to be healthy (attempt $attempt/$max_attempts)..."
        sleep $wait_time
    done

    error "PocketBase health check failed after $max_attempts attempts"
    return 1
}

health_check_frontend() {
    step "Performing frontend health check ($ENVIRONMENT)..."

    # Check if frontend build exists and has content
    if [ ! -d "$APP_DIR/$FRONTEND_BUILD_DIR" ]; then
        error "$FRONTEND_BUILD_DIR directory does not exist"
        return 1
    fi

    if [ ! -f "$APP_DIR/$FRONTEND_BUILD_DIR/index.html" ]; then
        error "index.html not found in $FRONTEND_BUILD_DIR"
        return 1
    fi

    # Try to fetch the frontend via Caddy with proper Host header
    local max_attempts=10
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        # Use curl to check if Caddy can serve the frontend for this environment
        # -L follows redirects (HTTP -> HTTPS)
        if curl -f -s -o /dev/null -w "%{http_code}" -L -H "Host: $DOMAIN" http://localhost/ | grep -q "200"; then
            log "Frontend is accessible via Caddy ✓"
            return 0
        fi

        attempt=$((attempt + 1))
        log "Waiting for frontend to be accessible (attempt $attempt/$max_attempts)..."
        sleep 1
    done

    error "Frontend health check failed - not accessible via Caddy"
    return 1
}

smoke_test() {
    step "Running smoke tests ($ENVIRONMENT)..."

    # Test PocketBase API
    if ! curl -f -s http://localhost:$POCKETBASE_PORT/api/health > /dev/null; then
        error "Smoke test failed: PocketBase API not responding on port $POCKETBASE_PORT"
        return 1
    fi

    # Test frontend (check if Caddy is serving it correctly)
    # -L follows redirects (HTTP -> HTTPS)
    if ! curl -f -s -L -H "Host: $DOMAIN" http://localhost/ | grep -q "<!DOCTYPE html>"; then
        error "Smoke test failed: Frontend not serving HTML for $DOMAIN"
        return 1
    fi

    log "Smoke tests passed ✓"
}

#######################
# FINALIZE DEPLOYMENT
#######################
reload_caddy() {
    step "Reloading Caddy..."

    # Test Caddy configuration first
    if ! sudo caddy validate --config /etc/caddy/Caddyfile 2>/dev/null; then
        warn "Caddy configuration validation failed, but continuing..."
    fi

    # Graceful reload (no downtime)
    if ! sudo systemctl reload caddy; then
        error "Failed to reload Caddy"
        exit 1
    fi

    # Verify Caddy is still running
    sleep 2
    if ! systemctl is-active --quiet caddy; then
        error "Caddy is not running after reload"
        exit 1
    fi

    log "Caddy reloaded ✓"
}

cleanup_old_build() {
    step "Cleaning up old frontend build ($ENVIRONMENT)..."

    cd "$APP_DIR"

    # Keep old build for 5 minutes in case we need emergency rollback
    if [ -d "${FRONTEND_BUILD_DIR}_old" ]; then
        (sleep 300 && rm -rf "${FRONTEND_BUILD_DIR}_old") &
        log "Old build will be deleted in 5 minutes (PID: $!)"
    fi
}

print_summary() {
    local db_size=$(du -sh "$APP_DIR/backend/pb_data_${ENVIRONMENT}/" 2>/dev/null | cut -f1 || echo 'N/A')
    local fe_size=$(du -sh "$APP_DIR/$FRONTEND_BUILD_DIR/" 2>/dev/null | cut -f1 || echo 'N/A')
    local git_commit=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo 'N/A')
    local backup_location=$(readlink -f "$BACKUP_DIR/latest" 2>/dev/null || echo 'N/A')

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Deployment Summary (${ENVIRONMENT}):${NC}"
    echo "  - Environment: $ENVIRONMENT"
    echo "  - Database size: $db_size"
    echo "  - Frontend size: $fe_size"
    echo "  - Backup location: $backup_location"
    echo "  - Git commit: $git_commit"
    echo "  - PocketBase port: $POCKETBASE_PORT"
    echo ""
    echo "🌐 Your app is now live at: https://$DOMAIN"
    echo ""
    echo -e "${YELLOW}Deployment log saved to:${NC} $LOG_FILE"
    echo ""
}

#######################
# MAIN DEPLOYMENT
#######################
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Deploying Mobile Tracker App${NC}"
    echo -e "${BLUE}  Environment: ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    log "Environment: $ENVIRONMENT"
    log "Logging to: $LOG_FILE"
    log "Started at $(date)"
    echo ""

    # Step 1: Pre-flight checks
    preflight_checks

    # Step 2: Create backup
    create_backup

    # Step 3: Update source code
    update_source_code

    # Step 4: Build frontend
    build_frontend

    # Step 5: Deploy frontend (blue-green)
    deploy_frontend

    # Step 6: Reload Caddy
    reload_caddy

    # Step 7: Health check frontend
    health_check_frontend

    # Step 8: Deploy PocketBase
    deploy_pocketbase

    # Step 9: Health check PocketBase
    health_check_pocketbase

    # Step 10: Run smoke tests
    smoke_test

    # Step 11: Cleanup
    cleanup_old_build

    # Success!
    print_summary
}

# Run main deployment
main "$@"
