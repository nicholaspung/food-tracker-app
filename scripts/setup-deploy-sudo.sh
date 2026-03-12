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
#   sudo bash setup-deploy-sudo.sh [deploy-username]
#
# Example:
#   sudo bash setup-deploy-sudo.sh deploy
#####################################################################

set -e  # Exit on any error

# Configuration
DEPLOY_USER="${1:-deploy}"
SUDOERS_FILE="/etc/sudoers.d/${DEPLOY_USER}-deployment"

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
   echo "Usage: sudo bash $0 [deploy-username]"
   exit 1
fi

# Check if deploy user exists
if ! id "$DEPLOY_USER" &>/dev/null; then
    log_error "User '$DEPLOY_USER' does not exist"
    exit 1
fi

log_info "Setting up passwordless sudo for user: $DEPLOY_USER"

# Create sudoers file
log_info "Creating sudoers configuration at: $SUDOERS_FILE"

cat > "$SUDOERS_FILE" << EOF
# Passwordless sudo configuration for automated deployments
# User: $DEPLOY_USER
# Created: $(date)

# Caddy web server management
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart caddy
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl status caddy
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl start caddy
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop caddy
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/caddy validate *
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/cp /opt/food-tracker-app/Caddyfile /etc/caddy/Caddyfile

# Backup directory management
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/mkdir -p /opt/food-tracker-backups*
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/chown * /opt/food-tracker-backups*
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/chmod * /opt/food-tracker-backups*

# Secrets directory management
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/mkdir -p /opt/food-tracker-secrets*
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/chown * /opt/food-tracker-secrets*
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/chmod * /opt/food-tracker-secrets*

# Docker Compose operations (if needed)
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker-compose *
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker compose *
EOF

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

# Test sudo access
log_info "Testing passwordless sudo access..."
if sudo -u "$DEPLOY_USER" sudo -n systemctl status caddy >/dev/null 2>&1; then
    log_info "Passwordless sudo is working correctly!"
else
    log_warn "Could not verify passwordless sudo (Caddy might not be running)"
    log_warn "You can test manually with: sudo -u $DEPLOY_USER sudo systemctl status caddy"
fi

echo ""
log_info "=========================================="
log_info "Passwordless sudo setup complete!"
log_info "=========================================="
echo ""
log_info "The deploy user '$DEPLOY_USER' can now run these commands without a password:"
echo "  - systemctl reload/restart/status caddy"
echo "  - caddy validate and copy the live Caddyfile"
echo "  - mkdir/chown/chmod for backup and secrets directories"
echo "  - docker-compose operations"
echo ""
log_info "GitHub Actions deployments should now work without password prompts."
echo ""

# Display the sudoers file for verification
log_info "Sudoers configuration:"
cat "$SUDOERS_FILE"
