#!/bin/bash
# Verification script for PocketBase backup setup

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BACKUP_DIR="/var/backups/pocketbase"
LOG_FILE="/var/log/pocketbase-backup.log"
BACKUP_SCRIPT="/opt/mobile-tracker-app/scripts/backup-pocketbase.sh"

pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo "========================================"
echo "PocketBase Backup Setup Verification"
echo "========================================"
echo ""

# Check 1: Backup script exists and is executable
echo "1. Checking backup script..."
if [ -f "$BACKUP_SCRIPT" ]; then
    if [ -x "$BACKUP_SCRIPT" ]; then
        pass "Backup script exists and is executable"
    else
        fail "Backup script exists but is not executable"
        info "Run: chmod +x $BACKUP_SCRIPT"
        exit 1
    fi
else
    fail "Backup script not found at $BACKUP_SCRIPT"
    exit 1
fi
echo ""

# Check 2: Cron service is running
echo "2. Checking cron service..."
if sudo systemctl is-active --quiet cron; then
    pass "Cron service is running"
else
    fail "Cron service is not running"
    info "Run: sudo systemctl start cron"
    exit 1
fi
echo ""

# Check 3: Crontab entry exists
echo "3. Checking crontab entry..."
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    pass "Crontab entry found"
    info "Scheduled at: $(crontab -l | grep "$BACKUP_SCRIPT" | awk '{print $1" "$2" "$3" "$4" "$5}')"
else
    fail "Crontab entry not found"
    info "Run: crontab -e"
    info "Add: 0 2 * * * $BACKUP_SCRIPT >> $LOG_FILE 2>&1"
    exit 1
fi
echo ""

# Check 4: Log file exists and is writable
echo "4. Checking log file..."
if [ -f "$LOG_FILE" ]; then
    if [ -w "$LOG_FILE" ]; then
        pass "Log file exists and is writable"
        # Show last backup time
        if [ -s "$LOG_FILE" ]; then
            last_backup=$(grep "Backup completed successfully" "$LOG_FILE" | tail -1 | grep -oP '\[\K[^]]+')
            if [ -n "$last_backup" ]; then
                info "Last successful backup: $last_backup"
            fi
        fi
    else
        fail "Log file exists but is not writable"
        info "Run: sudo chown $USER:$USER $LOG_FILE"
        exit 1
    fi
else
    warn "Log file does not exist yet"
    info "Run: sudo touch $LOG_FILE && sudo chown $USER:$USER $LOG_FILE"
fi
echo ""

# Check 5: Backup directory exists
echo "5. Checking backup directory..."
if [ -d "$BACKUP_DIR" ]; then
    pass "Backup directory exists"

    # Count backups
    backup_count=$(find "$BACKUP_DIR" -maxdepth 1 -name "pb-*.tar.gz" 2>/dev/null | wc -l)
    if [ "$backup_count" -gt 0 ]; then
        pass "Found $backup_count backup file(s)"

        # Show most recent backup
        latest_backup=$(ls -t "$BACKUP_DIR"/pb-*.tar.gz 2>/dev/null | head -1)
        if [ -n "$latest_backup" ]; then
            backup_size=$(du -sh "$latest_backup" | cut -f1)
            backup_time=$(stat -c %y "$latest_backup" 2>/dev/null | cut -d'.' -f1 || stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$latest_backup")
            info "Latest backup: $(basename "$latest_backup") ($backup_size)"
            info "Created: $backup_time"
        fi
    else
        warn "No backup files found yet"
        info "Run: $BACKUP_SCRIPT"
    fi
else
    warn "Backup directory does not exist yet"
    info "It will be created automatically on first backup"
fi
echo ""

# Check 6: Docker and PocketBase container
echo "6. Checking Docker and PocketBase..."
if command -v docker &> /dev/null; then
    pass "Docker is installed"

    if docker ps --format '{{.Names}}' | grep -q "pocketbase"; then
        pass "PocketBase container is running"
    else
        fail "PocketBase container is not running"
        info "Run: cd /opt/mobile-tracker-app && docker compose up -d"
        exit 1
    fi
else
    fail "Docker is not installed"
    exit 1
fi
echo ""

# Check 7: Test backup can be run
echo "7. Testing backup script execution..."
echo "   This will run the backup script now. Continue? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    info "Running backup script..."
    if "$BACKUP_SCRIPT"; then
        pass "Backup script executed successfully"

        # Verify new backup was created
        sleep 1
        latest_backup=$(ls -t "$BACKUP_DIR"/pb-*.tar.gz 2>/dev/null | head -1)
        if [ -n "$latest_backup" ]; then
            backup_size=$(du -sh "$latest_backup" | cut -f1)
            info "New backup created: $(basename "$latest_backup") ($backup_size)"
        fi
    else
        fail "Backup script failed"
        info "Check logs: tail -50 $LOG_FILE"
        exit 1
    fi
else
    warn "Skipped backup script execution"
fi
echo ""

# Summary
echo "========================================"
echo -e "${GREEN}All checks passed!${NC}"
echo "========================================"
echo ""
echo "Your backup system is configured correctly:"
echo "  • Backups run daily at 2:00 AM"
echo "  • Backups stored in: $BACKUP_DIR"
echo "  • Logs stored in: $LOG_FILE"
echo "  • Retention: 7 days (daily), 28 days (weekly), 180 days (monthly)"
echo ""
echo "Useful commands:"
echo "  • List backups: ls -lh $BACKUP_DIR/"
echo "  • View logs: tail -50 $LOG_FILE"
echo "  • Run backup now: $BACKUP_SCRIPT"
echo "  • Check crontab: crontab -l"
echo ""
