#!/bin/bash
# Production-grade PocketBase Backup Script
# Features: Zero-downtime online backup, verification, remote storage, monitoring

set -euo pipefail

# Configuration
BACKUP_DIR="/var/backups/pocketbase"
APP_DIR="/opt/mobile-tracker-app"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TEMP_BACKUP_DIR="$BACKUP_DIR/temp-$TIMESTAMP"
BACKUP_FILE="$BACKUP_DIR/pb-$TIMESTAMP.tar.gz"
LOG_FILE="/var/log/pocketbase-backup.log"

# Alerting (configure these if needed)
ALERT_EMAIL=""  # Set to email address for alerts
HEALTHCHECK_URL=""  # Set to healthchecks.io URL for monitoring

# Retention
DAILY_RETENTION=7
WEEKLY_RETENTION=28
MONTHLY_RETENTION=180

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

#######################
# LOGGING
#######################
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error_exit() {
    log "ERROR: $1"

    # Cleanup temp files
    [ -d "$TEMP_BACKUP_DIR" ] && rm -rf "$TEMP_BACKUP_DIR"

    # Send alert email if configured
    if command -v mail &> /dev/null && [ -n "$ALERT_EMAIL" ]; then
        echo -e "Backup failed at $(date)\n\nError: $1\n\nLog: $LOG_FILE" | \
            mail -s "PocketBase Backup FAILED" "$ALERT_EMAIL"
    fi

    # Ping healthcheck (failure)
    if [ -n "$HEALTHCHECK_URL" ]; then
        curl -fsS --retry 3 "$HEALTHCHECK_URL/fail" \
            --data-raw "PocketBase backup failed: $1" > /dev/null 2>&1 || true
    fi

    exit 1
}

trap 'error_exit "Script failed at line $LINENO"' ERR

#######################
# BACKUP
#######################
create_online_backup() {
    log "Starting PocketBase online backup (zero downtime)..."

    # Verify Docker is running
    docker ps > /dev/null || error_exit "Docker is not running"

    # Navigate to app directory
    cd "$APP_DIR" || error_exit "App directory not found: $APP_DIR"

    # Check container is running
    if ! docker compose ps pocketbase | grep -q "Up"; then
        error_exit "PocketBase container is not running"
    fi

    # Create temp backup directory
    mkdir -p "$TEMP_BACKUP_DIR" || error_exit "Cannot create temp backup directory"

    # Backup databases using SQLite online backup (zero downtime)
    log "Backing up databases..."

    # Main database
    if ! docker exec pocketbase sqlite3 /pb/pb_data/data.db \
        ".backup '/pb/pb_data/temp-data-$TIMESTAMP.db'"; then
        error_exit "Failed to backup data.db"
    fi

    # Auxiliary database (if exists)
    docker exec pocketbase sqlite3 /pb/pb_data/auxiliary.db \
        ".backup '/pb/pb_data/temp-auxiliary-$TIMESTAMP.db'" 2>/dev/null || true

    # Copy backup files out of container
    docker cp "pocketbase:/pb/pb_data/temp-data-$TIMESTAMP.db" \
        "$TEMP_BACKUP_DIR/data.db" || error_exit "Failed to copy data.db"

    docker cp "pocketbase:/pb/pb_data/temp-auxiliary-$TIMESTAMP.db" \
        "$TEMP_BACKUP_DIR/auxiliary.db" 2>/dev/null || true

    # Copy storage directory (uploads)
    log "Copying storage files..."
    docker cp pocketbase:/pb/pb_data/storage "$TEMP_BACKUP_DIR/" 2>/dev/null || true
    docker cp pocketbase:/pb/pb_data/logs.db "$TEMP_BACKUP_DIR/" 2>/dev/null || true

    # Cleanup temp files in container
    docker exec pocketbase rm -f \
        "/pb/pb_data/temp-data-$TIMESTAMP.db" \
        "/pb/pb_data/temp-auxiliary-$TIMESTAMP.db" 2>/dev/null || true

    # Create compressed archive
    log "Creating compressed archive..."
    if ! tar -czf "$BACKUP_FILE" -C "$TEMP_BACKUP_DIR" .; then
        error_exit "Failed to create tar archive"
    fi

    # Cleanup temp directory
    rm -rf "$TEMP_BACKUP_DIR"

    log "Online backup created successfully"
}

#######################
# VERIFICATION
#######################
verify_backup() {
    log "Verifying backup integrity..."

    # Test tar extraction
    if ! tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
        error_exit "Backup archive is corrupt (tar test failed)"
    fi

    # Extract to temp directory for verification
    local test_dir="/tmp/pb-verify-$$"
    mkdir -p "$test_dir"
    tar -xzf "$BACKUP_FILE" -C "$test_dir"

    # Verify SQLite database integrity
    if [ -f "$test_dir/data.db" ]; then
        local integrity=$(docker run --rm -v "$test_dir/data.db:/test.db" \
            ghcr.io/pocketbase/pocketbase:latest \
            sqlite3 /test.db "PRAGMA integrity_check;" 2>/dev/null || echo "failed")

        if [ "$integrity" != "ok" ]; then
            rm -rf "$test_dir"
            error_exit "Database integrity check failed"
        fi

        # Get row count as sanity check
        local user_count=$(docker run --rm -v "$test_dir/data.db:/test.db" \
            ghcr.io/pocketbase/pocketbase:latest \
            sqlite3 /test.db "SELECT COUNT(*) FROM _users;" 2>/dev/null || echo "0")

        log "Backup verified successfully (users: $user_count)"
    fi

    # Get backup size
    local backup_size=$(du -sh "$BACKUP_FILE" | cut -f1)
    local backup_size_bytes=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE")

    # Verify backup is not suspiciously small
    if [ "$backup_size_bytes" -lt 10240 ]; then
        rm -rf "$test_dir"
        error_exit "Backup file is suspiciously small: $backup_size_bytes bytes"
    fi

    log "Backup size: $backup_size"

    # Create checksum
    md5sum "$BACKUP_FILE" > "${BACKUP_FILE}.md5"

    rm -rf "$test_dir"
}

#######################
# REMOTE STORAGE
#######################
upload_to_remote() {
    # Example: Upload to AWS S3 (uncomment and configure)
    # if command -v aws &> /dev/null; then
    #     log "Uploading to S3..."
    #     if aws s3 cp "$BACKUP_FILE" "s3://your-bucket/mobile-tracker-app/" \
    #         --storage-class STANDARD_IA \
    #         --metadata "timestamp=$TIMESTAMP,verified=true"; then
    #         log "S3 upload successful"
    #     else
    #         error_exit "S3 upload failed"
    #     fi
    # fi

    # Example: Upload via rsync (uncomment and configure)
    # if command -v rsync &> /dev/null; then
    #     log "Uploading to remote server..."
    #     if rsync -avz --timeout=300 "$BACKUP_FILE" \
    #         backup-user@backup-server.com:/backups/mobile-tracker-app/; then
    #         log "Rsync upload successful"
    #     else
    #         error_exit "Rsync upload failed"
    #     fi
    # fi

    log "Remote storage upload skipped (not configured)"
}

#######################
# CLEANUP
#######################
cleanup_old_backups() {
    log "Cleaning up old backups..."

    # Daily backups (keep $DAILY_RETENTION days)
    find "$BACKUP_DIR/" -maxdepth 1 -name "pb-*.tar.gz" -mtime +$DAILY_RETENTION -delete || \
        log "Warning: Daily cleanup failed"

    # Weekly backups (every Sunday)
    if [ "$(date +%u)" -eq 7 ]; then
        mkdir -p "$BACKUP_DIR/weekly"
        cp "$BACKUP_FILE" "$BACKUP_DIR/weekly/" || log "Warning: Weekly backup copy failed"
        find "$BACKUP_DIR/weekly/" -name "pb-*.tar.gz" -mtime +$WEEKLY_RETENTION -delete || true
        log "Weekly backup created"
    fi

    # Monthly backups (1st of month)
    if [ "$(date +%d)" = "01" ]; then
        mkdir -p "$BACKUP_DIR/monthly"
        cp "$BACKUP_FILE" "$BACKUP_DIR/monthly/" || log "Warning: Monthly backup copy failed"
        find "$BACKUP_DIR/monthly/" -name "pb-*.tar.gz" -mtime +$MONTHLY_RETENTION -delete || true
        log "Monthly backup created"
    fi

    # Count remaining backups
    local backup_count=$(find "$BACKUP_DIR/" -maxdepth 1 -name "pb-*.tar.gz" | wc -l)
    log "Total local daily backups: $backup_count"
}

#######################
# MAIN
#######################
main() {
    log "========================================"
    log "Starting PocketBase backup"
    log "========================================"

    # Verify backup directory exists
    mkdir -p "$BACKUP_DIR" || error_exit "Cannot create backup directory"

    # Create online backup (zero downtime)
    create_online_backup

    # Verify backup integrity
    verify_backup

    # Upload to remote storage (optional)
    upload_to_remote

    # Cleanup old backups
    cleanup_old_backups

    # Success notification
    log "========================================"
    log "Backup completed successfully!"
    log "File: $BACKUP_FILE"
    log "========================================"

    # Ping healthcheck (success)
    if [ -n "$HEALTHCHECK_URL" ]; then
        curl -fsS --retry 3 "$HEALTHCHECK_URL" > /dev/null 2>&1 || \
            log "Warning: Healthcheck ping failed"
    fi

    exit 0
}

main "$@"
