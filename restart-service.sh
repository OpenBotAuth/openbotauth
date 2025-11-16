#!/bin/bash

# Restart Registry Service Script
# This script stops any running instances and starts the service fresh

echo "🔄 Restarting OpenBotAuth Registry Service..."
echo ""

# Kill any existing tsx processes
echo "📛 Stopping existing services..."
pkill -f "tsx watch" 2>/dev/null || true
sleep 1

# Check if Redis is running
echo "🔍 Checking Redis..."
if ! nc -z localhost 6379 2>/dev/null; then
    echo "⚠️  Redis is not running!"
    echo "   Start Redis with: docker run -d -p 6379:6379 redis:7-alpine"
    echo ""
fi

# Navigate to service directory
cd "$(dirname "$0")/packages/registry-service"

# Start the service
echo "🚀 Starting registry service..."
echo "   Loading .env from: ../../.env"
echo ""
pnpm dev

