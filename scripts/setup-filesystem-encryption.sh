#!/bin/bash
# Setup LUKS Filesystem Encryption for PocketBase Data
# This script creates an encrypted volume for PocketBase data (PII protection at rest)
# WARNING: This is an ADVANCED script. Make sure you have backups before running!

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/opt/mobile-tracker-app"
ENCRYPTED_MOUNT="/mnt/encrypted_pocketbase"
ENCRYPTION_KEY_FILE="/root/.pocketbase-encryption-key"
LUKS_DEVICE="/dev/mapper/encrypted_pocketbase"
BACKUP_DIR="/tmp/pocketbase_migration_backup_$(date +%Y%m%d_%H%M%S)"

#######################
# LOGGING
#######################
log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $*"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $*" >&2
    exit 1
}

step() {
    echo ""
    echo -e "${BLUE}==>${NC} $*"
}

info() {
    echo -e "${CYAN}ℹ${NC} $*"
}

#######################
# PRE-FLIGHT CHECKS
#######################
preflight_checks() {
    step "Running pre-flight checks..."

    # Check if running as root
    if [ "$(id -u)" -ne 0 ]; then
        error "This script must be run as root (use sudo)"
    fi

    # Check if running on VPS (not local dev)
    if [ ! -d "$APP_DIR" ]; then
        error "App directory not found at $APP_DIR. Are you on the VPS?"
    fi

    # Check required commands
    local required_commands="cryptsetup lsblk dd mkfs.ext4 docker"
    for cmd in $required_commands; do
        if ! command -v $cmd &> /dev/null; then
            error "Required command not found: $cmd"
        fi
    done

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Start it with: systemctl start docker"
    fi

    # Check disk space (need at least 2GB free for migration)
    local available_space_kb=$(df / | awk 'NR==2 {print $4}')
    local available_space_mb=$((available_space_kb / 1024))
    if [ "$available_space_mb" -lt 2000 ]; then
        warn "Low disk space: ${available_space_mb}MB available"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
    fi

    log "Pre-flight checks passed ✓"
}

#######################
# INTERACTIVE SETUP
#######################
interactive_setup() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  LUKS Filesystem Encryption Setup${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT WARNINGS:${NC}"
    echo ""
    echo "1. This script will encrypt your PocketBase data directories"
    echo "2. You will need to provide a passphrase for the encrypted volume"
    echo "3. If you lose the passphrase, YOUR DATA IS LOST FOREVER"
    echo "4. This process will stop your PocketBase containers temporarily"
    echo "5. Make sure you have recent backups before proceeding"
    echo ""
    echo -e "${YELLOW}What this script does:${NC}"
    echo ""
    echo "✓ Creates encrypted LUKS volume at $ENCRYPTED_MOUNT"
    echo "✓ Backs up existing PocketBase data"
    echo "✓ Migrates data to encrypted volume"
    echo "✓ Configures auto-mount on boot"
    echo "✓ Updates Docker volumes to use encrypted mount"
    echo ""
    echo -e "${YELLOW}Prerequisites:${NC}"
    echo ""
    echo "✓ You must be on the VPS (DigitalOcean, etc.)"
    echo "✓ You must have root/sudo access"
    echo "✓ You must have recent backups"
    echo "✓ You must remember the encryption passphrase"
    echo ""
    
    read -p "Do you want to proceed with filesystem encryption? (yes/NO): " -r REPLY
    echo
    if [ "$REPLY" != "yes" ]; then
        log "Setup cancelled."
        exit 0
    fi

    echo ""
    warn "This is your LAST CHANCE to cancel before making changes!"
    read -p "Type 'ENCRYPT' to confirm: " -r CONFIRM
    echo
    if [ "$CONFIRM" != "ENCRYPT" ]; then
        log "Setup cancelled."
        exit 0
    fi
}

#######################
# STORAGE SELECTION
#######################
select_storage_location() {
    step "Selecting storage location for encrypted volume..."
    
    echo ""
    echo -e "${YELLOW}Storage options:${NC}"
    echo ""
    echo "1. Create encrypted file-backed volume (loopback)"
    echo "   - Size: 5GB (expandable)"
    echo "   - Location: /opt/encrypted_pocketbase.img"
    echo "   - Best for: Most VPS setups"
    echo ""
    echo "2. Use existing block device (advanced)"
    echo "   - Requires: Unformatted disk/partition"
    echo "   - Best for: Dedicated data disks"
    echo ""
    read -p "Select option (1 or 2): " -n 1 -r
    echo

    if [ "$REPLY" = "1" ]; then
        STORAGE_TYPE="file"
        STORAGE_FILE="/opt/encrypted_pocketbase.img"
        STORAGE_SIZE="5G"
    elif [ "$REPLY" = "2" ]; then
        STORAGE_TYPE="block"
        echo ""
        lsblk -o NAME,SIZE,TYPE,MOUNTPOINT
        echo ""
        read -p "Enter block device path (e.g., /dev/sdb): " STORAGE_DEVICE
        
        if [ ! -b "$STORAGE_DEVICE" ]; then
            error "Block device not found: $STORAGE_DEVICE"
        fi
        
        warn "ALL DATA ON $STORAGE_DEVICE WILL BE DESTROYED!"
        read -p "Are you sure? Type the device name to confirm: " CONFIRM_DEVICE
        if [ "$CONFIRM_DEVICE" != "$STORAGE_DEVICE" ]; then
            error "Device confirmation failed"
        fi
    else
        error "Invalid selection"
    fi

    log "Storage location selected ✓"
}

#######################
# CREATE ENCRYPTED VOLUME
#######################
create_encrypted_volume() {
    step "Creating encrypted volume..."

    if [ "$STORAGE_TYPE" = "file" ]; then
        # Create file-backed volume
        log "Creating ${STORAGE_SIZE} file at ${STORAGE_FILE}..."
        dd if=/dev/zero of="$STORAGE_FILE" bs=1M count=5120 status=progress
        
        log "Setting up loop device..."
        LOOP_DEVICE=$(losetup -f --show "$STORAGE_FILE")
        ENCRYPT_TARGET="$LOOP_DEVICE"
        log "Loop device: $LOOP_DEVICE"
    else
        ENCRYPT_TARGET="$STORAGE_DEVICE"
    fi

    # Setup LUKS encryption
    log "Setting up LUKS encryption on $ENCRYPT_TARGET..."
    echo ""
    warn "You will be prompted to enter a passphrase for the encrypted volume"
    warn "Choose a STRONG passphrase and WRITE IT DOWN in a safe place!"
    echo ""
    
    cryptsetup luksFormat "$ENCRYPT_TARGET" --type luks2

    log "Opening encrypted volume..."
    cryptsetup luksOpen "$ENCRYPT_TARGET" encrypted_pocketbase

    # Create filesystem
    log "Creating ext4 filesystem..."
    mkfs.ext4 -L pocketbase_encrypted "$LUKS_DEVICE"

    # Mount encrypted volume
    log "Mounting encrypted volume..."
    mkdir -p "$ENCRYPTED_MOUNT"
    mount "$LUKS_DEVICE" "$ENCRYPTED_MOUNT"

    log "Encrypted volume created and mounted ✓"
}

#######################
# BACKUP AND MIGRATE DATA
#######################
migrate_data() {
    step "Backing up and migrating PocketBase data..."

    # Stop containers
    log "Stopping PocketBase containers..."
    cd "$APP_DIR"
    docker compose down pocketbase || true
    docker compose -f docker-compose.beta.yml down pocketbase_beta || true

    # Create backup
    log "Creating backup at $BACKUP_DIR..."
    mkdir -p "$BACKUP_DIR"
    
    if [ -d "$APP_DIR/backend/pb_data_production" ]; then
        cp -r "$APP_DIR/backend/pb_data_production" "$BACKUP_DIR/"
        log "Backed up production data"
    fi
    
    if [ -d "$APP_DIR/backend/pb_data_beta" ]; then
        cp -r "$APP_DIR/backend/pb_data_beta" "$BACKUP_DIR/"
        log "Backed up beta data"
    fi

    # Create encrypted directories
    log "Creating directories in encrypted volume..."
    mkdir -p "$ENCRYPTED_MOUNT/pb_data_production"
    mkdir -p "$ENCRYPTED_MOUNT/pb_data_beta"

    # Migrate data
    if [ -d "$APP_DIR/backend/pb_data_production" ]; then
        log "Migrating production data..."
        rsync -av "$APP_DIR/backend/pb_data_production/" "$ENCRYPTED_MOUNT/pb_data_production/"
    fi
    
    if [ -d "$APP_DIR/backend/pb_data_beta" ]; then
        log "Migrating beta data..."
        rsync -av "$APP_DIR/backend/pb_data_beta/" "$ENCRYPTED_MOUNT/pb_data_beta/"
    fi

    # Set proper permissions
    chown -R 1000:1000 "$ENCRYPTED_MOUNT/pb_data_production"
    chown -R 1000:1000 "$ENCRYPTED_MOUNT/pb_data_beta"

    log "Data migration complete ✓"
}

#######################
# SETUP AUTO-MOUNT
#######################
setup_automount() {
    step "Configuring auto-mount on boot..."

    # Generate encryption key file
    log "Generating encryption key file..."
    dd if=/dev/urandom of="$ENCRYPTION_KEY_FILE" bs=512 count=1
    chmod 400 "$ENCRYPTION_KEY_FILE"

    log "Adding key to LUKS keyslot..."
    cryptsetup luksAddKey "$ENCRYPT_TARGET" "$ENCRYPTION_KEY_FILE"

    # Get UUID
    local UUID=$(blkid -s UUID -o value "$ENCRYPT_TARGET")
    
    # Add to /etc/crypttab
    log "Updating /etc/crypttab..."
    echo "encrypted_pocketbase UUID=$UUID $ENCRYPTION_KEY_FILE luks" >> /etc/crypttab

    # Add to /etc/fstab
    log "Updating /etc/fstab..."
    echo "$LUKS_DEVICE $ENCRYPTED_MOUNT ext4 defaults,nofail 0 2" >> /etc/fstab

    log "Auto-mount configured ✓"
}

#######################
# UPDATE DOCKER VOLUMES
#######################
update_docker_volumes() {
    step "Updating Docker Compose volumes..."

    cd "$APP_DIR"

    # Backup original compose files
    cp docker-compose.yml docker-compose.yml.before-encryption
    cp docker-compose.beta.yml docker-compose.beta.yml.before-encryption

    # Update production volume
    sed -i "s|./backend/pb_data_production:/pb/pb_data|$ENCRYPTED_MOUNT/pb_data_production:/pb/pb_data|g" docker-compose.yml

    # Update beta volume
    sed -i "s|./backend/pb_data_beta:/pb/pb_data|$ENCRYPTED_MOUNT/pb_data_beta:/pb/pb_data|g" docker-compose.beta.yml

    log "Docker volumes updated ✓"
}

#######################
# VERIFICATION
#######################
verify_setup() {
    step "Verifying encryption setup..."

    # Check mount
    if ! mountpoint -q "$ENCRYPTED_MOUNT"; then
        error "Encrypted volume is not mounted"
    fi
    log "Mount verified ✓"

    # Check data exists
    if [ ! -d "$ENCRYPTED_MOUNT/pb_data_production" ]; then
        error "Production data directory not found in encrypted volume"
    fi
    log "Data directories verified ✓"

    # Start containers
    log "Starting PocketBase containers..."
    cd "$APP_DIR"
    docker compose up -d pocketbase
    docker compose -f docker-compose.beta.yml up -d pocketbase_beta

    # Wait for health check
    sleep 10
    
    if docker compose ps pocketbase | grep -q "running"; then
        log "Production container started ✓"
    else
        error "Production container failed to start"
    fi

    if docker compose -f docker-compose.beta.yml ps pocketbase_beta | grep -q "running"; then
        log "Beta container started ✓"
    else
        warn "Beta container may not have started (check logs)"
    fi

    log "Verification complete ✓"
}

#######################
# PRINT SUMMARY
#######################
print_summary() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Filesystem Encryption Setup Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}What was done:${NC}"
    echo "  ✓ Created encrypted LUKS volume"
    echo "  ✓ Migrated PocketBase data to encrypted storage"
    echo "  ✓ Configured auto-mount on boot"
    echo "  ✓ Updated Docker volumes"
    echo "  ✓ Started PocketBase containers"
    echo ""
    echo -e "${YELLOW}Important Information:${NC}"
    echo ""
    echo "  📁 Encrypted mount: $ENCRYPTED_MOUNT"
    echo "  🔑 Key file: $ENCRYPTION_KEY_FILE"
    echo "  💾 Backup location: $BACKUP_DIR"
    echo ""
    echo -e "${YELLOW}Security Notes:${NC}"
    echo ""
    echo "  1. Your data is now encrypted at rest"
    echo "  2. The encryption key is stored at: $ENCRYPTION_KEY_FILE"
    echo "  3. Keep a secure backup of your encryption passphrase"
    echo "  4. Original data backup is at: $BACKUP_DIR"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo ""
    echo "  1. ${BLUE}Verify your apps work:${NC}"
    echo "     - Production: https://myexperiment.life"
    echo "     - Beta: https://beta.myexperiment.life"
    echo ""
    echo "  2. ${BLUE}Test database access:${NC}"
    echo "     docker compose logs pocketbase"
    echo ""
    echo "  3. ${BLUE}Backup encryption key:${NC}"
    echo "     sudo cp $ENCRYPTION_KEY_FILE /secure/backup/location/"
    echo ""
    echo "  4. ${BLUE}Clean up old data (after verification):${NC}"
    echo "     sudo rm -rf $APP_DIR/backend/pb_data_production.old"
    echo "     sudo rm -rf $APP_DIR/backend/pb_data_beta.old"
    echo "     sudo rm -rf $BACKUP_DIR"
    echo ""
    echo -e "${YELLOW}Recovery Instructions:${NC}"
    echo ""
    echo "  If you need to manually mount the encrypted volume:"
    echo "  1. cryptsetup luksOpen $ENCRYPT_TARGET encrypted_pocketbase"
    echo "  2. mount $LUKS_DEVICE $ENCRYPTED_MOUNT"
    echo ""
}

#######################
# MAIN
#######################
main() {
    preflight_checks
    interactive_setup
    select_storage_location
    create_encrypted_volume
    migrate_data
    setup_automount
    update_docker_volumes
    verify_setup
    print_summary
}

main "$@"
