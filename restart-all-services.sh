#!/bin/bash

# Restart All OpenBotAuth Services
# This script stops all services and starts them fresh

echo "🔄 Restarting All OpenBotAuth Services..."
echo ""

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Stop all services
echo "🛑 Stopping existing services..."
"$SCRIPT_DIR/kill-services.sh"
echo ""

# Wait a moment
sleep 2

# Start all services
"$SCRIPT_DIR/start-all-services.sh"

