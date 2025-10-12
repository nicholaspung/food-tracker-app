#!/bin/bash
# Beta Environment Setup Script

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="/opt/mobile-tracker-app"
BACKEND_DIR="$APP_DIR/backend"

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
echo "Beta Environment Setup"
echo "========================================"
echo ""

# Setup log files with proper permissions
echo "0. Setting up log files..."
if ! [ -f "/var/log/mobile-tracker-deploy-beta.log" ]; then
    sudo touch /var/log/mobile-tracker-deploy-beta.log
    sudo chown $USER:$USER /var/log/mobile-tracker-deploy-beta.log
    sudo chmod 644 /var/log/mobile-tracker-deploy-beta.log
fi
if ! [ -f "/var/log/mobile-tracker-deploy.log" ]; then
    sudo touch /var/log/mobile-tracker-deploy.log
    sudo chown $USER:$USER /var/log/mobile-tracker-deploy.log
    sudo chmod 644 /var/log/mobile-tracker-deploy.log
fi
pass "Log files configured"
echo ""

# Check if running in correct directory
if [ "$PWD" != "$APP_DIR" ]; then
    info "Changing to app directory: $APP_DIR"
    cd "$APP_DIR" || { fail "Failed to change to $APP_DIR"; exit 1; }
fi

# Step 1: Check docker-compose.beta.yml exists
echo "1. Checking for docker-compose.beta.yml..."
if [ -f "docker-compose.beta.yml" ]; then
    pass "docker-compose.beta.yml found"
else
    fail "docker-compose.beta.yml not found"
    exit 1
fi
echo ""

# Step 2: Create beta data directories
echo "2. Setting up beta data directories..."
mkdir -p "$BACKEND_DIR/pb_data_beta"
mkdir -p "$BACKEND_DIR/pb_data_production"
pass "Data directories created"

# Move existing pb_data to production if needed
if [ -d "$BACKEND_DIR/pb_data" ] && [ ! -L "$BACKEND_DIR/pb_data" ]; then
    warn "Found existing pb_data directory"
    info "Moving to pb_data_production..."
    mv "$BACKEND_DIR/pb_data" "$BACKEND_DIR/pb_data_production"
    pass "Moved pb_data to pb_data_production"

    # Restart production container to use new directory
    info "Restarting production container..."
    docker compose restart pocketbase || warn "Failed to restart production container"
    sleep 3
    pass "Production container restarted"
fi
echo ""

# Step 3: Start beta PocketBase container
echo "3. Starting beta PocketBase container..."
if docker compose -f docker-compose.beta.yml up -d; then
    pass "Beta container started"
else
    fail "Failed to start beta container"
    exit 1
fi
echo ""

# Step 4: Wait for container to be ready
echo "4. Waiting for beta container to be ready..."
sleep 3

# Check if container is running
if docker ps | grep -q "pocketbase.*beta"; then
    pass "Beta container is running"
else
    fail "Beta container is not running"
    info "Check logs: docker compose -f docker-compose.beta.yml logs"
    exit 1
fi
echo ""

# Step 5: Test beta backend
echo "5. Testing beta backend health..."
for i in {1..10}; do
    if curl -s http://localhost:8091/api/health > /dev/null 2>&1; then
        pass "Beta backend is responding"
        break
    else
        if [ $i -eq 10 ]; then
            fail "Beta backend not responding after 10 attempts"
            info "Check logs: docker compose -f docker-compose.beta.yml logs"
            exit 1
        fi
        info "Waiting for backend to start... (attempt $i/10)"
        sleep 2
    fi
done
echo ""

# Step 6: Get beta installation token
echo "6. Getting beta PocketBase installation token..."
sleep 2
install_url=$(docker compose -f docker-compose.beta.yml logs pocketbase_beta 2>/dev/null | grep "pbinstal" | tail -1 | grep -oP 'http://[^\s]+' || echo "")

if [ -n "$install_url" ]; then
    # Extract token from URL
    token=$(echo "$install_url" | grep -oP '/_/#/pbinstal/\K.*')
    if [ -n "$token" ]; then
        pass "Installation token found"
        echo ""
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}IMPORTANT: Create Beta Admin Account${NC}"
        echo -e "${YELLOW}========================================${NC}"
        echo ""
        echo "Visit this URL to create the beta admin account:"
        echo -e "${GREEN}https://beta.myexperiment.life/_/#/pbinstal/$token${NC}"
        echo ""
        echo "Do this now before continuing!"
        echo -e "${YELLOW}========================================${NC}"
        echo ""
    else
        warn "Could not extract installation token"
        info "Check logs: docker compose -f docker-compose.beta.yml logs pocketbase_beta | grep pbinstal"
    fi
else
    warn "Installation token not found in logs"
    info "Admin may already be created or check logs: docker compose -f docker-compose.beta.yml logs pocketbase_beta"
fi
echo ""

# Step 7: Deploy beta frontend
echo "7. Deploying beta frontend..."
if bash "$APP_DIR/scripts/deploy.sh" beta; then
    pass "Beta frontend deployed"
else
    fail "Failed to deploy beta frontend"
    exit 1
fi
echo ""

# Step 8: Verify deployment
echo "8. Verifying beta deployment..."

# Check HTTPS
if curl -sI https://beta.myexperiment.life | head -1 | grep -q "200"; then
    pass "Beta site is accessible via HTTPS"
else
    warn "Beta site returned non-200 status"
    info "Check Caddy logs: sudo journalctl -u caddy -n 50"
fi

# Check API
if curl -s https://beta.myexperiment.life/api/health | grep -q "healthy"; then
    pass "Beta API is responding"
else
    warn "Beta API not responding correctly"
fi
echo ""

# Summary
echo "========================================"
echo -e "${GREEN}Beta Environment Setup Complete!${NC}"
echo "========================================"
echo ""
echo "Beta Environment Details:"
echo "  • Domain: https://beta.myexperiment.life"
echo "  • Admin Panel: https://beta.myexperiment.life/_/"
echo "  • PocketBase Port: 8091"
echo "  • Data Directory: $BACKEND_DIR/pb_data_beta"
echo "  • Frontend Build: $APP_DIR/frontend_build_beta"
echo ""
echo "Next Steps:"
echo "  1. Create beta admin account (see URL above if shown)"
echo "  2. Test beta site: https://beta.myexperiment.life"
echo "  3. Continue with GitHub Actions setup (Step 4-5 in docs)"
echo ""
echo "Useful Commands:"
echo "  • View beta logs: docker compose -f docker-compose.beta.yml logs -f"
echo "  • Restart beta: docker compose -f docker-compose.beta.yml restart"
echo "  • Stop beta: docker compose -f docker-compose.beta.yml down"
echo "  • Deploy to beta: bash scripts/deploy.sh beta"
echo ""
