#!/bin/bash
# Generate PocketBase encryption keys for production hardening
# This script creates secure 32-character encryption keys for PocketBase settings

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
ENV_EXAMPLE="$APP_DIR/.env.example"

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

#######################
# KEY GENERATION
#######################
generate_32char_key() {
    # Generate a secure random 32-character alphanumeric key
    # Uses /dev/urandom for cryptographic randomness
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32
}

#######################
# MAIN
#######################
main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  PocketBase Encryption Key Generator${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # Check if .env.example exists
    if [ ! -f "$ENV_EXAMPLE" ]; then
        error ".env.example not found at $ENV_EXAMPLE"
    fi

    # Create .env from .env.example if it doesn't exist
    if [ ! -f "$ENV_FILE" ]; then
        log "Creating .env from .env.example..."
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        log ".env created ✓"
    fi

    # Check if keys already exist
    PROD_KEY_EXISTS=$(grep -E '^ENCRYPTION_KEY_PROD=.+' "$ENV_FILE" || true)
    BETA_KEY_EXISTS=$(grep -E '^ENCRYPTION_KEY_BETA=.+' "$ENV_FILE" || true)

    if [ -n "$PROD_KEY_EXISTS" ] && [ -n "$BETA_KEY_EXISTS" ]; then
        warn "Encryption keys already exist in .env"
        echo ""
        echo "Current keys:"
        echo "  ENCRYPTION_KEY_PROD: ${PROD_KEY_EXISTS#*=}"
        echo "  ENCRYPTION_KEY_BETA: ${BETA_KEY_EXISTS#*=}"
        echo ""
        read -p "Regenerate keys? This will OVERWRITE existing keys! (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Keeping existing keys. Exiting."
            exit 0
        fi
        warn "Regenerating keys will require re-entering encrypted settings in PocketBase admin UI"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Cancelled. Keeping existing keys."
            exit 0
        fi
    fi

    step "Generating encryption keys..."

    # Generate keys
    PROD_KEY=$(generate_32char_key)
    BETA_KEY=$(generate_32char_key)

    # Verify key length
    if [ ${#PROD_KEY} -ne 32 ] || [ ${#BETA_KEY} -ne 32 ]; then
        error "Key generation failed - keys must be exactly 32 characters"
    fi

    log "Generated production key (32 chars): ${PROD_KEY:0:8}...${PROD_KEY:24:8}"
    log "Generated beta key (32 chars): ${BETA_KEY:0:8}...${BETA_KEY:24:8}"

    step "Updating .env file..."

    # Update or add keys to .env
    if grep -q '^ENCRYPTION_KEY_PROD=' "$ENV_FILE"; then
        # Update existing key
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^ENCRYPTION_KEY_PROD=.*|ENCRYPTION_KEY_PROD=$PROD_KEY|" "$ENV_FILE"
        else
            # Linux
            sed -i "s|^ENCRYPTION_KEY_PROD=.*|ENCRYPTION_KEY_PROD=$PROD_KEY|" "$ENV_FILE"
        fi
    else
        # Add new key
        echo "ENCRYPTION_KEY_PROD=$PROD_KEY" >> "$ENV_FILE"
    fi

    if grep -q '^ENCRYPTION_KEY_BETA=' "$ENV_FILE"; then
        # Update existing key
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^ENCRYPTION_KEY_BETA=.*|ENCRYPTION_KEY_BETA=$BETA_KEY|" "$ENV_FILE"
        else
            # Linux
            sed -i "s|^ENCRYPTION_KEY_BETA=.*|ENCRYPTION_KEY_BETA=$BETA_KEY|" "$ENV_FILE"
        fi
    else
        # Add new key
        echo "ENCRYPTION_KEY_BETA=$BETA_KEY" >> "$ENV_FILE"
    fi

    log "Keys written to .env ✓"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Encryption keys generated!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}What these keys encrypt:${NC}"
    echo "  - SMTP passwords (for email delivery)"
    echo "  - S3/storage credentials"
    echo "  - OAuth client secrets"
    echo "  - API keys stored in PocketBase settings"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo ""
    echo "1. ${BLUE}Restart PocketBase containers to apply encryption:${NC}"
    echo "   cd $APP_DIR"
    echo "   docker compose restart pocketbase"
    echo "   docker compose -f docker-compose.beta.yml restart pocketbase_beta"
    echo ""
    echo "2. ${BLUE}Backup your .env file securely:${NC}"
    echo "   cp .env .env.backup"
    echo "   # Store .env.backup in a secure location (NOT in git!)"
    echo ""
    echo "3. ${BLUE}Enable MFA and rate limiting:${NC}"
    echo "   See: docs/setup/DEPLOYMENT.md (Step 9)"
    echo ""
    echo -e "${YELLOW}Important:${NC}"
    echo "  - Keep the .env file SECRET"
    echo "  - Never commit .env to git (it's in .gitignore)"
    echo "  - If keys are lost, you'll need to re-enter encrypted settings"
    echo ""
}

main "$@"
