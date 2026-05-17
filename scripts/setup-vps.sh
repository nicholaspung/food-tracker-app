#!/bin/bash
# VPS Initial Setup Script for Yummy Recs
# Run this on a fresh Ubuntu VPS (22.04-25.04)
# Features: Security hardening, idempotency, error handling

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOG_FILE="/tmp/vps-setup-$(date +%Y%m%d-%H%M%S).log"

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
    exit 1
}

step() {
    echo ""
    echo -e "${BLUE}==>${NC} $*"
}

#######################
# PRE-FLIGHT CHECKS
#######################
preflight_checks() {
    step "Running pre-flight checks..."

    # Check OS
    if [ ! -f /etc/os-release ]; then
        error "Cannot detect OS. This script is designed for Ubuntu 22.04-25.04"
    fi

    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        warn "This script is designed for Ubuntu. Detected: $ID"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
    fi

    # Check Ubuntu version (supports 22.04 through 25.04)
    VERSION_ID_MAJOR="${VERSION_ID%.*}"
    if [ "$VERSION_ID_MAJOR" -lt 22 ] || [ "$VERSION_ID_MAJOR" -gt 25 ]; then
        error "Ubuntu version $VERSION_ID is not supported. Requires 22.04-25.04"
    fi

    # Check sudo access
    if ! sudo -n true 2>/dev/null; then
        error "This script requires sudo access"
    fi

    # Check internet connectivity
    if ! ping -c 1 -W 2 google.com &> /dev/null; then
        error "No internet connection detected"
    fi

    log "Running on Ubuntu $VERSION_ID ✓"
    log "Sudo access confirmed ✓"
    log "Internet connectivity OK ✓"
}

#######################
# SYSTEM UPDATE
#######################
update_system() {
    step "Updating system packages..."
    sudo apt-get update
    sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
    log "System updated ✓"
}

#######################
# CREATE APP DIRECTORY
#######################
create_app_directory() {
    step "Creating application directory..."

    if [ -d "/opt/food-tracker-app" ]; then
        log "Directory /opt/food-tracker-app already exists"
    else
        sudo mkdir -p /opt/food-tracker-app
        sudo chown $USER:$USER /opt/food-tracker-app
        log "Created /opt/food-tracker-app ✓"
    fi
}

#######################
# INSTALL DOCKER
#######################
install_docker() {
    step "Installing Docker..."

    if command -v docker &> /dev/null; then
        log "Docker already installed ($(docker --version))"
    else
        # Install using official script
        curl -fsSL https://get.docker.com -o get-docker.sh

        # Show hash for security verification
        sha256sum get-docker.sh
        warn "Verify the hash above matches Docker's official hash if needed"

        sudo sh get-docker.sh
        rm get-docker.sh
        log "Docker installed ✓"
    fi

    # Add user to docker group (idempotent)
    if groups $USER | grep -q '\bdocker\b'; then
        log "User already in docker group"
    else
        sudo usermod -aG docker $USER
        log "User added to docker group ✓"
        warn "You must log out and log back in for docker group to take effect!"
    fi
}

#######################
# INSTALL DOCKER COMPOSE
#######################
install_docker_compose() {
    step "Installing Docker Compose..."

    if docker compose version &> /dev/null; then
        log "Docker Compose already installed ($(docker compose version))"
    else
        sudo apt-get install -y docker-compose-plugin
        log "Docker Compose installed ✓"
    fi
}

#######################
# INSTALL CADDY
#######################
install_caddy() {
    step "Installing Caddy web server..."

    if command -v caddy &> /dev/null; then
        log "Caddy already installed ($(caddy version))"
    else
        sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl

        # Download Caddy GPG key
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
            sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

        # Add Caddy repository
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
            sudo tee /etc/apt/sources.list.d/caddy-stable.list

        # Set proper permissions
        sudo chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        sudo chmod 644 /etc/apt/sources.list.d/caddy-stable.list

        sudo apt-get update
        sudo apt-get install -y caddy

        log "Caddy installed ✓"
    fi

    # Setup log directory with proper permissions
    sudo mkdir -p /var/log/caddy
    sudo chown -R caddy:caddy /var/log/caddy
    sudo chmod 755 /var/log/caddy

    # Create log files with proper permissions
    sudo touch /var/log/caddy/access.log
    sudo touch /var/log/caddy/beta-access.log
    sudo chown caddy:caddy /var/log/caddy/*.log
    sudo chmod 644 /var/log/caddy/*.log
}

#######################
# CONFIGURE FIREWALL
#######################
configure_firewall() {
    step "Configuring firewall..."

    if sudo ufw status | grep -q "Status: active"; then
        log "UFW already enabled"
    else
        sudo ufw default deny incoming
        sudo ufw default allow outgoing
        sudo ufw limit ssh  # Rate limit SSH (max 6 connections per 30 seconds)
        sudo ufw allow http
        sudo ufw allow https
        echo "y" | sudo ufw enable
        log "UFW firewall configured and enabled ✓"
    fi
}

#######################
# INSTALL FAIL2BAN
#######################
install_fail2ban() {
    step "Installing Fail2ban for intrusion prevention..."

    if command -v fail2ban-client &> /dev/null; then
        log "Fail2ban already installed"
    else
        sudo apt-get install -y fail2ban

        # Create basic jail configuration
        sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF

        sudo systemctl enable fail2ban
        sudo systemctl restart fail2ban
        log "Fail2ban installed and configured ✓"
    fi
}

#######################
# SECURITY UPDATES
#######################
enable_security_updates() {
    step "Enabling automatic security updates..."

    sudo apt-get install -y unattended-upgrades

    sudo tee /etc/apt/apt.conf.d/20auto-upgrades > /dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

    log "Automatic security updates enabled ✓"
}

#######################
# INSTALL GIT
#######################
install_git() {
    step "Installing Git..."

    if command -v git &> /dev/null; then
        log "Git already installed ($(git --version))"
    else
        sudo apt-get install -y git
        log "Git installed ✓"
    fi
}

#######################
# INSTALL NODE TOOLING
#######################
install_node_tooling() {
    step "Installing Node.js and pnpm..."

    local install_node=false
    if command -v node &> /dev/null; then
        local node_major
        node_major=$(node -p "process.versions.node.split('.')[0]")
        if [ "$node_major" -lt 20 ]; then
            warn "Detected Node.js $(node --version), upgrading to Node.js 22"
            install_node=true
        else
            log "Node.js already installed ($(node --version))"
        fi
    else
        install_node=true
    fi

    if [ "$install_node" = true ]; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
        log "Node.js installed ✓ ($(node --version))"
    fi

    sudo corepack enable
    corepack prepare pnpm@11.1.2 --activate
    log "pnpm installed ✓ ($(pnpm --version))"
}

#######################
# INSTALL LIBHEIF
#######################
install_libheif() {
    step "Installing libheif for HEIC image support..."

    if dpkg -l | grep -q libheif-dev; then
        log "libheif already installed ($(dpkg -l | grep libheif-dev | awk '{print $3}'))"
    else
        sudo apt-get install -y libheif-dev
        log "libheif installed ✓"
        log "HEIC to JPEG conversion now supported for menu photo uploads"
    fi
}

#######################
# CREATE BACKUP DIRECTORY
#######################
create_backup_directory() {
    step "Creating backup directory..."

    sudo mkdir -p /var/backups/pocketbase
    sudo chown $USER:$USER /var/backups/pocketbase
    log "Backup directory created ✓"
}

#######################
# CREATE SWAP FILE
#######################
create_swap() {
    step "Checking swap configuration..."

    TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')

    if [ "$TOTAL_MEM" -lt 2048 ]; then
        if [ -f /swapfile ]; then
            log "Swap file already exists"
        else
            log "Creating 2GB swap file (detected ${TOTAL_MEM}MB RAM)..."
            sudo fallocate -l 2G /swapfile
            sudo chmod 600 /swapfile
            sudo mkswap /swapfile
            sudo swapon /swapfile

            # Make swap permanent
            if ! grep -q '/swapfile' /etc/fstab; then
                echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
            fi

            log "Swap file created and enabled ✓"
        fi
    else
        log "Sufficient RAM ($TOTAL_MEM MB), swap not needed"
    fi
}

#######################
# CONFIGURE LOG ROTATION
#######################
setup_log_rotation() {
    step "Configuring log rotation for Caddy..."

    sudo tee /etc/logrotate.d/caddy > /dev/null <<'EOF'
/var/log/caddy/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 caddy caddy
    sharedscripts
    postrotate
        systemctl reload caddy > /dev/null 2>&1 || true
    endscript
}
EOF

    log "Log rotation configured ✓"
}

#######################
# MAIN
#######################
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Yummy Recs - VPS Setup${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    log "Logging to: $LOG_FILE"
    echo ""

    preflight_checks
    update_system
    create_app_directory
    install_docker
    install_docker_compose
    install_caddy
    configure_firewall
    install_fail2ban
    enable_security_updates
    install_git
    install_node_tooling
    install_libheif
    create_backup_directory
    create_swap
    setup_log_rotation

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ VPS setup complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo ""
    echo "1. ${BLUE}Log out and log back in${NC} (required for Docker permissions):"
    echo "   exit"
    echo "   ssh $(whoami)@$(hostname -I | awk '{print $1}')"
    echo ""
    echo "2. ${BLUE}Clone your repository:${NC}"
    echo "   cd /opt/food-tracker-app"
    echo "   git clone https://github.com/nicholaspung/food-tracker-app.git ."
    echo ""
    echo "3. ${BLUE}Run automated deployment:${NC}"
    echo "   bash scripts/post-setup.sh"
    echo ""
    echo -e "${YELLOW}Setup log saved to:${NC} $LOG_FILE"
    echo ""
}

main "$@"
