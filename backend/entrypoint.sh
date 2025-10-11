#!/bin/sh
# Entrypoint script for PocketBase container
# Ensures correct permissions on mounted volumes before starting the application

# Ensure directories exist (in case volumes aren't mounted yet)
mkdir -p /pb/pb_data /pb/pb_migrations /pb/pb_hooks /pb/pb_public

# Fix permissions on mounted volumes if running as root
# This allows the application to write to the volumes
if [ "$(id -u)" = "0" ]; then
    echo "Running as root, fixing permissions..."
    chown -R 1000:1000 /pb/pb_data /pb/pb_migrations /pb/pb_hooks /pb/pb_public 2>/dev/null || true
fi

# Execute the command passed to the container
exec "$@"
