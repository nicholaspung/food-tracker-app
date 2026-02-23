#!/bin/bash
# Post-Setup Script for Mobile Tracker App
# Run after cloning repository to /opt/food-tracker-app
# Features: Rollback capability, validation, idempotency, error handling

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/opt/food-tracker-app"
LOG_FILE="/tmp/food-tracker-post-setup-$(date +%Y%m%d-%H%M%S).log"
LOCK_FILE="/tmp/food-tracker-post-setup.lock"

# Default values (pre-configured for yummyrecs.com)
DOMAIN="${DOMAIN:-yummyrecs.com}"
EMAIL="${EMAIL:-22228236+nicholaspung@users.noreply.github.com}"

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
        error "Post-setup failed with exit code $exit_code"
        rollback
    fi

    # Remove lock file
    rm -f "$LOCK_FILE"

    exit $exit_code
}

rollback() {
    warn "Initiating rollback..."

    cd "$APP_DIR"

    # Restore Caddyfile backup if exists
    if [ -f "Caddyfile.backup" ]; then
        log "Restoring Caddyfile backup..."
        sudo cp Caddyfile.backup /etc/caddy/Caddyfile
        sudo systemctl reload caddy 2>/dev/null || true
        mv Caddyfile.backup Caddyfile
    fi

    # Restore frontend build backup if exists
    if [ -d "frontend_build.backup" ]; then
        log "Restoring frontend build backup..."
        rm -rf frontend_build
        mv frontend_build.backup frontend_build
    fi

    error "Rollback complete. System restored to previous state."
}

trap cleanup EXIT INT TERM

#######################
# VALIDATION
#######################
validate_prerequisites() {
    step "Validating prerequisites..."

    # Check working directory
    if [ "$PWD" != "$APP_DIR" ]; then
        error "This script must be run from $APP_DIR"
        error "Run: cd $APP_DIR && bash scripts/post-setup.sh"
        exit 1
    fi

    # Check git repository
    if [ ! -d ".git" ]; then
        error "Not a git repository. Clone your repo first:"
        error "git clone https://github.com/nicholaspung/food-tracker-app.git ."
        exit 1
    fi

    # Check required commands
    local required_commands="docker npm node curl sudo systemctl"
    for cmd in $required_commands; do
        if ! command -v $cmd &> /dev/null; then
            error "Required command '$cmd' not found"
            error "Please run setup-vps.sh first"
            exit 1
        fi
    done

    # Check Docker Compose (plugin or standalone)
    if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
        error "Docker Compose not found"
        error "Please run setup-vps.sh first"
        exit 1
    fi

    # Check Node.js version (require 18+ for React 19)
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        error "Node.js version 18 or higher required (found v$node_version)"
        exit 1
    fi

    # Check if Caddy is installed and service exists
    if ! command -v caddy &> /dev/null; then
        error "Caddy binary not found"
        error "Please install Caddy first (setup-vps.sh)"
        exit 1
    fi

    # Check if Caddy service exists using systemctl status
    if ! systemctl status caddy.service &> /dev/null && ! systemctl list-unit-files caddy.service &> /dev/null; then
        error "Caddy systemd service not found"
        error "Please install Caddy first (setup-vps.sh)"
        exit 1
    fi

    # Check Docker daemon
    if ! docker info >/dev/null 2>&1; then
        error "Docker daemon is not running"
        error "Start it with: sudo systemctl start docker"
        exit 1
    fi

    # Check libheif for HEIC image conversion
    if ! dpkg -l | grep -q libheif-dev; then
        warn "libheif not installed - HEIC photo uploads will fail"
        warn "Install with: sudo apt-get install -y libheif-dev"
        warn "Or re-run setup-vps.sh to install all dependencies"
        read -p "Continue without libheif? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Installation cancelled. Please install libheif first."
            exit 1
        fi
    else
        log "libheif installed ✓ (HEIC photo conversion enabled)"
    fi

    # Check disk space (need at least 1GB free)
    local available_space_kb=$(df "$APP_DIR" | awk 'NR==2 {print $4}')
    local available_space_mb=$((available_space_kb / 1024))
    if [ "$available_space_mb" -lt 1000 ]; then
        error "Insufficient disk space"
        error "Required: 1000MB, Available: ${available_space_mb}MB"
        exit 1
    fi

    # Check deployment lock
    if [ -f "$LOCK_FILE" ]; then
        error "Another deployment is in progress (lock file exists: $LOCK_FILE)"
        error "If no deployment is running, remove: rm $LOCK_FILE"
        exit 1
    fi

    # Create lock file
    echo $$ > "$LOCK_FILE"

    log "All prerequisites validated ✓"
}

validate_inputs() {
    # Validate domain format
    if ! echo "$DOMAIN" | grep -qE '^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'; then
        error "Invalid domain format: $DOMAIN"
        exit 1
    fi

    # Validate email format
    if ! echo "$EMAIL" | grep -qE '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'; then
        error "Invalid email format: $EMAIL"
        exit 1
    fi

    log "Domain and email validated ✓"
}

#######################
# CONFIGURATION
#######################
configure_environment() {
    step "Configuring environment..."

    # Prompt for configuration
    echo -e "${YELLOW}Default configuration:${NC}"
    echo "  Domain: $DOMAIN"
    echo "  Email: $EMAIL"
    echo ""
    read -p "Use these defaults? (Y/n): " USE_DEFAULTS

    if [ "$USE_DEFAULTS" = "n" ] || [ "$USE_DEFAULTS" = "N" ]; then
        read -p "Enter your domain name: " DOMAIN
        read -p "Enter your email for Let's Encrypt SSL: " EMAIL

        validate_inputs
    fi

    echo ""
    log "Final configuration:"
    log "  Domain: $DOMAIN"
    log "  Email: $EMAIL"
    echo ""
}

configure_caddyfile() {
    step "Configuring Caddyfile..."

    # Check if Caddyfile needs updating
    if grep -q "your-email@example.com\|yourdomain.com" Caddyfile; then
        log "Updating placeholder values in Caddyfile..."

        # Backup current Caddyfile
        cp Caddyfile Caddyfile.backup

        # Update values
        sed -i "s/your-email@example.com/$EMAIL/g" Caddyfile
        sed -i "s/yourdomain.com/$DOMAIN/g" Caddyfile

        log "Caddyfile updated ✓"
    elif grep -q "$DOMAIN" Caddyfile && grep -q "$EMAIL" Caddyfile; then
        log "Caddyfile already configured with these values ✓"
    else
        warn "Caddyfile appears to be manually modified"
        log "Current domain: $(grep -E '^[a-z0-9.-]+\s+\{' Caddyfile | awk '{print $1}')"
        read -p "Force update to $DOMAIN? (y/N): " FORCE_UPDATE

        if [ "$FORCE_UPDATE" = "y" ] || [ "$FORCE_UPDATE" = "Y" ]; then
            cp Caddyfile Caddyfile.backup
            sed -i "s/your-email@example.com/$EMAIL/g" Caddyfile
            sed -i "s/yourdomain.com/$DOMAIN/g" Caddyfile
        else
            error "Please manually update Caddyfile with your domain"
            exit 1
        fi
    fi
}

deploy_caddyfile() {
    step "Deploying Caddyfile to /etc/caddy/..."

    # Validate Caddyfile syntax
    if ! sudo caddy validate --config Caddyfile 2>/dev/null; then
        warn "Caddyfile validation failed, but continuing..."
    fi

    # Ensure log directory exists with proper permissions
    sudo mkdir -p /var/log/caddy
    sudo chown -R caddy:caddy /var/log/caddy
    sudo chmod 755 /var/log/caddy

    # Create log files if they don't exist
    sudo touch /var/log/caddy/access.log
    sudo touch /var/log/caddy/beta-access.log
    sudo chown caddy:caddy /var/log/caddy/*.log
    sudo chmod 644 /var/log/caddy/*.log

    # Copy to /etc/caddy/
    sudo cp Caddyfile /etc/caddy/Caddyfile

    # Restart Caddy
    if ! sudo systemctl restart caddy; then
        error "Failed to restart Caddy"
        error "Check logs: sudo journalctl -u caddy -n 50"
        exit 1
    fi

    # Verify Caddy is running
    sleep 2
    if ! sudo systemctl is-active --quiet caddy; then
        error "Caddy is not running after restart"
        error "Check logs: sudo journalctl -u caddy -n 50"
        exit 1
    fi

    log "Caddy deployed and running ✓"
}

create_env_files() {
    step "Creating environment files..."

    # Frontend .env
    if [ -f "frontend/.env" ]; then
        warn "frontend/.env already exists"

        # Show diff
        diff -u frontend/.env <(cat <<EOF
# Frontend Environment Variables

# API Configuration - Production
VITE_API_URL=https://$DOMAIN
EOF
) || true

        read -p "Overwrite? (y/N): " OVERWRITE
        if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
            log "Keeping existing frontend/.env"
            return
        fi
    fi

    cat > frontend/.env <<EOF
# Frontend Environment Variables

# API Configuration - Production
# PocketBase automatically appends /api/ to requests
VITE_API_URL=https://$DOMAIN
EOF

    log "Created frontend/.env ✓"

    # Root .env (optional)
    cat > .env <<EOF
# Environment Configuration for Mobile Tracker App VPS Deployment

# Application
APP_NAME=food-tracker-app
DOMAIN=$DOMAIN

# Email for Let's Encrypt
ADMIN_EMAIL=$EMAIL

# PocketBase Configuration
TZ=America/Los_Angeles
EOF

    log "Created .env ✓"
}

#######################
# POCKETBASE
#######################
start_pocketbase() {
    step "Starting PocketBase container..."

    cd "$APP_DIR"

    # Build the PocketBase image first (on first run or if Dockerfile changed)
    log "Building PocketBase Docker image..."
    if ! docker compose build pocketbase 2>&1 | tee -a "$LOG_FILE"; then
        error "Failed to build PocketBase image"
        exit 1
    fi

    # Start the container
    if docker compose up -d pocketbase; then
        log "PocketBase container started ✓"
    else
        error "Failed to start PocketBase"
        exit 1
    fi

    # Wait for PocketBase to be healthy
    log "Waiting for PocketBase to be healthy..."
    local max_attempts=20
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        # Check if container is running (check for Up/running status, not exited/error)
        local container_status=$(docker compose ps pocketbase --format json 2>/dev/null || docker compose ps pocketbase 2>/dev/null)
        if echo "$container_status" | grep -qE "(exited|error|dead)"; then
            warn "PocketBase container in error state, checking logs..."
            docker compose logs --tail=20 pocketbase
            error "PocketBase container failed to start"
            exit 1
        fi

        # Try health check
        if curl -s http://127.0.0.1:8090/api/health > /dev/null 2>&1; then
            log "PocketBase is healthy ✓"
            return 0
        fi

        # Show progress every 5 attempts
        if [ $((attempt % 5)) -eq 0 ] && [ $attempt -gt 0 ]; then
            log "Still waiting... (attempt $attempt/$max_attempts)"
        fi

        attempt=$((attempt + 1))
        sleep 3
    done

    # Final check before giving up
    log "Checking PocketBase container status..."
    docker compose ps pocketbase
    docker compose logs --tail=30 pocketbase | tee -a "$LOG_FILE"

    warn "PocketBase health check timeout (not critical, continuing...)"
    warn "Container is running but health endpoint may be slow to respond"
    warn "Check with: docker compose logs -f pocketbase"
}

#######################
# FRONTEND
#######################
build_frontend() {
    step "Building frontend..."

    cd "$APP_DIR/frontend"

    # Install dependencies
    log "Installing dependencies..."
    if ! npm ci --production=false --loglevel=error 2>&1 | tee -a "$LOG_FILE"; then
        error "npm ci failed. Check package.json and package-lock.json"
        exit 1
    fi

    # Build
    log "Running build..."
    if ! npm run build 2>&1 | tee -a "$LOG_FILE"; then
        error "npm run build failed. Check build logs above"
        exit 1
    fi

    # Verify build output
    if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
        error "Build succeeded but dist/ directory is missing or empty"
        exit 1
    fi

    if [ ! -f "dist/index.html" ]; then
        error "Build succeeded but index.html is missing"
        exit 1
    fi

    local build_size=$(du -sh dist | cut -f1)
    log "Frontend built successfully ✓ (size: $build_size)"
}

deploy_frontend() {
    step "Deploying frontend..."

    cd "$APP_DIR"

    # Backup existing build if it exists
    if [ -d "frontend_build" ]; then
        log "Backing up current frontend build..."
        cp -r frontend_build frontend_build.backup
    fi

    # Deploy new build
    rm -rf frontend_build
    cp -r frontend/dist frontend_build

    # Verify deployment
    if [ ! -f "frontend_build/index.html" ]; then
        error "Frontend deployment failed - index.html not found"
        exit 1
    fi

    log "Frontend deployed ✓"
}

#######################
# FINALIZATION
#######################
setup_backups() {
    step "Setting up backup configuration..."

    # PocketBase backups
    sudo mkdir -p /var/backups/pocketbase
    sudo chown $USER:$USER /var/backups/pocketbase

    # Deployment backups
    sudo mkdir -p /opt/food-tracker-backups/{beta,production}
    sudo chown -R $USER:$USER /opt/food-tracker-backups
    sudo chmod 755 /opt/food-tracker-backups
    log "Backup directories created ✓"

    if [ -f "scripts/backup-pocketbase.sh" ]; then
        chmod +x scripts/backup-pocketbase.sh
        log "Backup script is ready ✓"
    fi

    # Create deployment log directory
    log "Creating deployment log directory..."
    mkdir -p /opt/food-tracker-app/logs
    chmod 755 /opt/food-tracker-app/logs
    log "Deployment log directory created ✓"
}

print_summary() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}🎉 Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Your app should now be live at: ${BLUE}https://$DOMAIN${NC}"
    echo ""
    echo -e "${YELLOW}Important Next Steps:${NC}"
    echo ""
    echo "1. ${BLUE}Setup PocketBase Admin Account:${NC}"
    echo "   Visit: https://$DOMAIN/_/"
    echo "   ${RED}Create your admin account NOW for security!${NC}"
    echo ""
    echo "2. ${BLUE}Test your app:${NC}"
    echo "   Visit: https://$DOMAIN"
    echo ""
    echo "3. ${BLUE}Setup automated backups (recommended):${NC}"
    echo "   crontab -e"
    echo "   Add this line:"
    echo "   0 2 * * * $APP_DIR/scripts/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1"
    echo ""
    echo "4. ${BLUE}Verify everything is working:${NC}"
    echo "   - Test signup/login flow"
    echo "   - Check PocketBase admin panel"
    echo "   - Monitor logs: docker-compose logs -f pocketbase"
    echo ""
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo "  View logs:           docker-compose logs -f pocketbase"
    echo "  Restart PocketBase:  docker-compose restart pocketbase"
    echo "  Redeploy:            bash scripts/deploy.sh"
    echo "  Manual backup:       bash scripts/backup-pocketbase.sh"
    echo ""
    echo -e "${YELLOW}Deployment log saved to:${NC} $LOG_FILE"
    echo ""
}

#######################
# MAIN
#######################
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Mobile Tracker App - Post Setup${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    log "Logging to: $LOG_FILE"
    echo ""

    validate_prerequisites
    configure_environment
    configure_caddyfile
    deploy_caddyfile
    create_env_files
    start_pocketbase
    build_frontend
    deploy_frontend
    setup_backups
    print_summary

    # Cleanup backup files on success
    rm -f Caddyfile.backup
    rm -rf frontend_build.backup
}

main "$@"
