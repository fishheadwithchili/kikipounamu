#!/bin/bash

# Enable Redis AOF Persistence for Local Instance
# This script checks if Redis is running and enables AOF if it's not already on.

REDIS_CLI="redis-cli"

# Check if redis-cli is available
if ! command -v $REDIS_CLI &> /dev/null; then
    echo "Warning: redis-cli not found. Cannot configure AOF persistence."
    exit 0
fi

# Check if Redis is running
if ! $REDIS_CLI ping &> /dev/null; then
    echo "⚠️ Redis is not running. Attempting to start..."
    if command -v systemctl > /dev/null 2>&1 && [ -d /run/systemd/system ]; then
        sudo systemctl start redis-server || true
    elif command -v service > /dev/null 2>&1; then
        sudo service redis-server start || true
    else
        sudo redis-server --daemonize yes || true
    fi
    sleep 2
fi

# Final check
if ! $REDIS_CLI ping &> /dev/null; then
    echo "Warning: Redis is still not running. Cannot configure AOF persistence."
    exit 0
fi

echo "Checking Redis AOF configuration..."

# Enable AOF
$REDIS_CLI CONFIG SET appendonly yes
$REDIS_CLI CONFIG SET appendfsync everysec

# Persist config to redis.conf if possible
$REDIS_CLI CONFIG REWRITE

echo "Redis AOF persistence enabled."
